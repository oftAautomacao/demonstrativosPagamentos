import {
  createAsaWorkbook,
  validateDemonstrative,
} from '@asa/asa';
import { DemoConvenioAdapter, type ConvenioAdapter, type NormalizedProcedureDraft } from '@asa/convenios';
import {
  addMoney,
  AsaImportReviewStatus,
  createEntityId,
  createRunId,
  DemonstrativeStatus,
  type AppState,
  type AsaImportReview,
  type Demonstrative,
  type Guide,
  type MoneyCents,
  type Procedure,
  type ProcessingRun,
  type RunLogEntry,
  ValidationStatus,
} from '@asa/domain';
import { FileStorageService, JsonStateRepository } from '@asa/storage';
import { InMemoryTussMappingRepository, TussService } from '@asa/tuss';

import { CredentialsService } from './credentials-service';
import { calculateNextRun } from './scheduler/local-scheduler';

type ReviewInput = {
  status: AsaImportReviewStatus;
  importedAmountCents: MoneyCents | null;
  notes: string | null;
};

const tussService = new TussService(
  new InMemoryTussMappingRepository([
    {
      convenioCode: 'DEMO',
      codigoOriginal: '041301234',
      codigoASA: '041301240',
      source: 'demo-fixture',
    },
    {
      convenioCode: 'DEMO',
      codigoOriginal: '030101007',
      codigoASA: '030101007',
      source: 'demo-fixture',
    },
    {
      convenioCode: 'DEMO',
      codigoOriginal: '030102002',
      codigoASA: '030102002',
      source: 'demo-fixture',
    },
  ]),
);

function createImportReview(expectedAmountCents: MoneyCents): AsaImportReview {
  return {
    status: AsaImportReviewStatus.PENDING,
    expectedAmountCents,
    importedAmountCents: null,
    differenceAmountCents: null,
    notes: null,
    updatedAt: null,
  };
}

export class ProcessingService {
  private readonly demoAdapter: ConvenioAdapter;

  public constructor(
    private readonly stateRepository: JsonStateRepository,
    private readonly fileStorage: FileStorageService,
    private readonly credentialsService: CredentialsService,
  ) {
    this.demoAdapter = new DemoConvenioAdapter();
  }

  public async bootstrap(): Promise<void> {
    await this.fileStorage.ensureBaseDirectories();
    const state = await this.stateRepository.load();
    if (state.demonstratives.length === 0) {
      await this.executeDemoRun();
    }
  }

  public async getState(): Promise<AppState> {
    const state = await this.stateRepository.load();
    const nextRunAt = calculateNextRun(state.scheduler);

    if (nextRunAt !== state.scheduler.nextRunAt) {
      const nextState: AppState = {
        ...state,
        scheduler: {
          ...state.scheduler,
          nextRunAt,
        },
      };
      await this.stateRepository.save(nextState);
      return nextState;
    }

    return state;
  }

  public async executeDemoRun(): Promise<ProcessingRun> {
    const state = await this.stateRepository.load();
    const runId = createRunId(new Date(), state.runs.length + 1);
    const logs: RunLogEntry[] = [];

    const log = (step: string, message: string, metadata?: Record<string, unknown>): void => {
      logs.push({
        id: createEntityId('LOG'),
        step,
        level: 'INFO',
        message,
        occurredAt: new Date().toISOString(),
        metadata,
      });
    };

    log('START', 'Inicio da execucao DEMO.');

    const context = {
      browserAgent: null,
      currentDate: new Date(),
    };
    const credentials = this.credentialsService.getForConvenio(this.demoAdapter.code);

    await this.demoAdapter.openPortal(context);
    log('PORTAL', 'Portal DEMO aberto.');

    await this.demoAdapter.performLogin(credentials, context);
    log('LOGIN', 'Login DEMO validado sem expor credenciais.');

    const candidates = await this.demoAdapter.locatePendingPayments(context);
    const payment = candidates[0];
    if (!payment) {
      throw new Error('Nenhum pagamento DEMO encontrado.');
    }
    log('PAYMENT_FOUND', 'Pagamento DEMO localizado.', {
      paymentDate: payment.paymentDate,
      externalIdentifier: payment.externalIdentifier,
    });

    const artifacts = await this.demoAdapter.downloadArtifacts(payment, context);
    log('DOWNLOAD', 'Arquivos DEMO carregados.', {
      count: artifacts.length,
    });

    const interpreted = await this.demoAdapter.interpretArtifacts(payment, artifacts, context);
    log('PARSING', 'Fixture DEMO interpretada.', {
      rows: interpreted.rows.length,
    });

    const normalized = await this.demoAdapter.normalizeData(payment, interpreted, context);
    const demonstrativeId = createEntityId('DEM');

    const originalFiles = await Promise.all(
      artifacts.map((artifact) =>
        this.fileStorage.saveArtifact({
          convenioCode: this.demoAdapter.code,
          paymentDate: payment.paymentDate,
          demonstrativeId,
          fileName: artifact.fileName,
          contents: artifact.contents,
          kind: 'ORIGINAL',
        }),
      ),
    );

    const guides = await this.buildGuides(this.demoAdapter.code, normalized.procedures);
    const demonstrativeAmountCents = addMoney(
      ...guides.flatMap((guide) => guide.procedures.map((procedure) => procedure.valorCents)),
    );

    const baseDemonstrative: Demonstrative = {
      id: demonstrativeId,
      convenioCode: this.demoAdapter.code,
      convenioName: this.demoAdapter.displayName,
      payment: normalized.payment,
      status: DemonstrativeStatus.PROCESSING,
      portalAmountCents: normalized.portalAmountCents,
      demonstrativeAmountCents,
      guideCount: guides.length,
      guides,
      originalFiles,
      processedFiles: [],
      asaFile: null,
      validation: null,
      timeline: [
        this.timeline('PORTAL', 'Portal', 'Acesso ao portal DEMO realizado.', true),
        this.timeline('PAYMENT', 'Pagamento', 'Pagamento pendente localizado.', true),
        this.timeline('DOWNLOADS', 'Downloads', 'Arquivo fixture preservado em storage/originais.', true),
        this.timeline('PROCESSING', 'Processamento', 'Dados normalizados para o modelo interno.', true),
      ],
      importReview: createImportReview(demonstrativeAmountCents),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const processedFile = await this.fileStorage.saveArtifact({
      convenioCode: this.demoAdapter.code,
      paymentDate: payment.paymentDate,
      demonstrativeId,
      fileName: 'normalized.json',
      contents: JSON.stringify(
        {
          sourceMetadata: normalized.sourceMetadata,
          payment: normalized.payment,
          guides,
        },
        null,
        2,
      ),
      kind: 'PROCESSED',
    });

    const workbook = createAsaWorkbook(baseDemonstrative);
    const validation = validateDemonstrative(baseDemonstrative, workbook.rows);
    const asaFileRecord = await this.fileStorage.saveArtifact({
      convenioCode: this.demoAdapter.code,
      paymentDate: payment.paymentDate,
      demonstrativeId,
      fileName: `ASA-${payment.paymentDate}.xlsx`,
      contents: workbook.buffer,
      kind: 'ASA',
    });

    const finalStatus =
      validation.status === ValidationStatus.VALIDATED
        ? DemonstrativeStatus.WAITING_MANUAL_ASA_IMPORT
        : DemonstrativeStatus.PRE_ASA_DIVERGENCE;

    const demonstrative: Demonstrative = {
      ...baseDemonstrative,
      status: finalStatus,
      processedFiles: [processedFile],
      asaFile: this.fileStorage.createAsaReference(asaFileRecord),
      validation,
      timeline: [
        ...baseDemonstrative.timeline,
        this.timeline(
          'VALIDATION',
          'Validacao',
          validation.status === ValidationStatus.VALIDATED
            ? `Totais validados em ${workbook.humanTotal}.`
            : 'Divergencias encontradas antes do ASA.',
          validation.status === ValidationStatus.VALIDATED,
        ),
        this.timeline('ASA_FILE', 'Arquivo ASA', 'XLSX final gerado e armazenado.', true),
      ],
      updatedAt: new Date().toISOString(),
    };

    log('VALIDATION', 'Validacao concluida.', {
      status: validation.status,
      issues: validation.issues.length,
    });
    log('ASA_GENERATION', 'Arquivo ASA gerado.', {
      file: asaFileRecord.relativePath,
    });

    const filteredDemonstratives = state.demonstratives.filter(
      (item) =>
        item.payment.externalIdentifier !== demonstrative.payment.externalIdentifier ||
        item.convenioCode !== demonstrative.convenioCode,
    );
    const scheduler = {
      ...state.scheduler,
      lastRunAt: new Date().toISOString(),
      nextRunAt: calculateNextRun(state.scheduler),
    };

    const run: ProcessingRun = {
      id: runId,
      convenioCode: this.demoAdapter.code,
      convenioName: this.demoAdapter.displayName,
      startedAt: logs[0]?.occurredAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      success: true,
      demonstrativeIds: [demonstrative.id],
      logs,
    };

    const nextState: AppState = {
      demonstratives: [demonstrative, ...filteredDemonstratives],
      runs: [run, ...state.runs].slice(0, 20),
      scheduler,
    };

    await this.stateRepository.save(nextState);
    return run;
  }

  public async updateSchedulerSettings(nextScheduler: AppState['scheduler']): Promise<AppState['scheduler']> {
    const state = await this.stateRepository.load();
    const scheduler = {
      ...nextScheduler,
      nextRunAt: calculateNextRun(nextScheduler),
    };

    await this.stateRepository.save({
      ...state,
      scheduler,
    });

    return scheduler;
  }

  public async updateReview(demonstrativeId: string, input: ReviewInput): Promise<Demonstrative> {
    const state = await this.stateRepository.load();
    const current = state.demonstratives.find((item) => item.id === demonstrativeId);

    if (!current) {
      throw new Error('Demonstrativo nao encontrado.');
    }

    const differenceAmountCents =
      input.importedAmountCents === null
        ? null
        : current.importReview.expectedAmountCents - input.importedAmountCents;

    const statusByReview = {
      [AsaImportReviewStatus.PENDING]: current.status,
      [AsaImportReviewStatus.CORRECT]: DemonstrativeStatus.COMPLETED,
      [AsaImportReviewStatus.DIFFERENT_VALUE]: DemonstrativeStatus.ASA_IMPORT_DIVERGENT,
      [AsaImportReviewStatus.ERROR]: DemonstrativeStatus.ASA_IMPORT_ERROR,
    } as const;

    const updated: Demonstrative = {
      ...current,
      status: statusByReview[input.status],
      importReview: {
        status: input.status,
        expectedAmountCents: current.importReview.expectedAmountCents,
        importedAmountCents: input.importedAmountCents,
        differenceAmountCents,
        notes: input.notes,
        updatedAt: new Date().toISOString(),
      },
      timeline: [
        ...current.timeline.filter((event) => event.stage !== 'ASA_REVIEW'),
        this.timeline(
          'ASA_REVIEW',
          'Conferencia ASA',
          this.reviewMessage(input.status, differenceAmountCents),
          input.status !== AsaImportReviewStatus.ERROR,
        ),
      ],
      updatedAt: new Date().toISOString(),
    };

    await this.stateRepository.save({
      ...state,
      demonstratives: state.demonstratives.map((item) => (item.id === demonstrativeId ? updated : item)),
    });

    return updated;
  }

  private reviewMessage(status: AsaImportReviewStatus, differenceAmountCents: MoneyCents | null): string {
    if (status === AsaImportReviewStatus.CORRECT) {
      return 'Importacao confirmada como correta pelo usuario.';
    }

    if (status === AsaImportReviewStatus.DIFFERENT_VALUE) {
      return `Importacao divergente. Diferenca apurada: ${differenceAmountCents ?? 0} centavos.`;
    }

    if (status === AsaImportReviewStatus.ERROR) {
      return 'Usuario informou erro no ASA durante a importacao.';
    }

    return 'Conferencia pendente.';
  }

  private timeline(
    stage: Demonstrative['timeline'][number]['stage'],
    title: string,
    details: string,
    success: boolean,
  ): Demonstrative['timeline'][number] {
    return {
      id: createEntityId('EVT'),
      stage,
      title,
      details,
      occurredAt: new Date().toISOString(),
      success,
    };
  }

  private async buildGuides(
    convenioCode: string,
    drafts: NormalizedProcedureDraft[],
  ): Promise<Guide[]> {
    const guideMap = new Map<string, Guide>();

    for (const draft of drafts) {
      const mapping = await tussService.applyMapping(convenioCode, draft.codigoOriginal);
      const procedure: Procedure = {
        id: createEntityId('PROC'),
        guideNumber: draft.guideNumber,
        codigoOriginal: draft.codigoOriginal,
        codigoASA: mapping.asaCode ?? draft.codigoOriginal,
        descricao: draft.description,
        quantidade: draft.quantity || 1,
        valorCents: draft.amountCents,
        glosaCents: draft.glosaCents,
        valorAuxiliaresCents: draft.auxValuesCents,
        valorInstitucionalCents: draft.institutionalAmountCents,
        dataAtendimento: draft.serviceDate,
        pacienteNome: draft.patientName,
        filme: draft.film,
        codGlosa: draft.codGlosa,
        originalData: draft.originalData,
        transformations: [mapping.record],
      };

      const key = draft.guideNumber;
      const existing = guideMap.get(key);

      if (existing) {
        existing.procedures.push(procedure);
      } else {
        guideMap.set(key, {
          id: createEntityId('GUI'),
          numeroGuia: draft.guideNumber,
          paciente: draft.patientName,
          dataAtendimento: draft.serviceDate,
          procedures: [procedure],
        });
      }
    }

    return [...guideMap.values()];
  }
}
