import { readFile } from 'node:fs/promises';

import { createEntityId, moneyFromDecimal, type Payment } from '@asa/domain';

import type {
  ConvenioAdapter,
  ConvenioExecutionContext,
  DownloadedArtifact,
  InterpretedArtifacts,
  NormalizedDemonstrativeDraft,
  PendingPaymentCandidate,
  PortalCredentials,
} from '../base/contracts';

function buildFixturePath(): URL {
  return new URL('./fixtures/demo-demonstrative.csv', import.meta.url);
}

function parseCsv(contents: string): Array<Record<string, string>> {
  const [headerLine, ...dataLines] = contents.trim().split(/\r?\n/);
  const headers = headerLine.split(',');

  return dataLines.map((line) => {
    const values = line.split(',');
    return headers.reduce<Record<string, string>>((record, header, index) => {
      record[header] = values[index] ?? '';
      return record;
    }, {});
  });
}

function buildPayment(candidate: PendingPaymentCandidate): Payment {
  return {
    id: createEntityId('PAY'),
    convenioCode: candidate.convenioCode,
    convenioName: candidate.convenioName,
    paymentDate: candidate.paymentDate,
    competence: candidate.competence,
    totalAmountCents: candidate.totalAmountCents,
    externalIdentifier: candidate.externalIdentifier,
    batchIdentifier: candidate.batchIdentifier,
  };
}

export class DemoConvenioAdapter implements ConvenioAdapter {
  public readonly code = 'DEMO';

  public readonly displayName = 'Convenio Demonstracao';

  public async openPortal(_context: ConvenioExecutionContext): Promise<void> {
    return Promise.resolve();
  }

  public async performLogin(
    _credentials: PortalCredentials,
    _context: ConvenioExecutionContext,
  ): Promise<void> {
    return Promise.resolve();
  }

  public async locatePendingPayments(
    _context: ConvenioExecutionContext,
  ): Promise<PendingPaymentCandidate[]> {
    return [
      {
        convenioCode: this.code,
        convenioName: this.displayName,
        paymentDate: '2026-08-17',
        competence: '2026-08',
        totalAmountCents: 47730,
        externalIdentifier: 'DEMO-2026-08-17-001',
        batchIdentifier: 'LOTE-DEMO-08',
      },
    ];
  }

  public async downloadArtifacts(
    payment: PendingPaymentCandidate,
    _context: ConvenioExecutionContext,
  ): Promise<DownloadedArtifact[]> {
    const contents = await readFile(buildFixturePath());

    return [
      {
        fileName: `${payment.externalIdentifier ?? 'demo'}.csv`,
        contents,
        mediaType: 'text/csv',
      },
    ];
  }

  public async interpretArtifacts(
    payment: PendingPaymentCandidate,
    artifacts: DownloadedArtifact[],
    _context: ConvenioExecutionContext,
  ): Promise<InterpretedArtifacts> {
    const artifact = artifacts[0];

    if (!artifact) {
      throw new Error('Nenhum arquivo DEMO foi encontrado para interpretacao.');
    }

    const rows = parseCsv(artifact.contents.toString('utf8')).map((record) => ({
      guideNumber: record.guia,
      patientName: record.paciente,
      serviceDate: record.data,
      codigoOriginal: record.codigoOriginal,
      description: record.descricao,
      quantity: Number(record.quantidade || '1') || 1,
      amountCents: moneyFromDecimal(record.valor),
      glosaCents: moneyFromDecimal(record.glosa),
      auxValuesCents: [
        moneyFromDecimal(record.aux1),
        moneyFromDecimal(record.aux2),
        moneyFromDecimal(record.aux3),
      ] as [number, number, number],
      institutionalAmountCents: moneyFromDecimal(record.valorInst),
      film: record.filme,
      codGlosa: record.codGlosa,
      originalData: record,
    }));

    return {
      portalAmountCents: payment.totalAmountCents,
      rows,
      metadata: {
        fixture: 'demo-demonstrative.csv',
      },
    };
  }

  public async normalizeData(
    payment: PendingPaymentCandidate,
    interpreted: InterpretedArtifacts,
    _context: ConvenioExecutionContext,
  ): Promise<NormalizedDemonstrativeDraft> {
    return {
      payment: buildPayment(payment),
      portalAmountCents: interpreted.portalAmountCents,
      procedures: interpreted.rows,
      sourceMetadata: interpreted.metadata,
    };
  }
}
