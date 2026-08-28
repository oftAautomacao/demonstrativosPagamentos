import type { MoneyCents } from './money';

export enum DemonstrativeStatus {
  NEW = 'NEW',
  ACCESSING_PORTAL = 'ACCESSING_PORTAL',
  PAYMENT_FOUND = 'PAYMENT_FOUND',
  DOWNLOADING = 'DOWNLOADING',
  DOWNLOADED = 'DOWNLOADED',
  PROCESSING = 'PROCESSING',
  VALIDATING = 'VALIDATING',
  ASA_FILE_READY = 'ASA_FILE_READY',
  PRE_ASA_DIVERGENCE = 'PRE_ASA_DIVERGENCE',
  PORTAL_ERROR = 'PORTAL_ERROR',
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  WAITING_MANUAL_ASA_IMPORT = 'WAITING_MANUAL_ASA_IMPORT',
  ASA_IMPORT_OK = 'ASA_IMPORT_OK',
  ASA_IMPORT_DIVERGENT = 'ASA_IMPORT_DIVERGENT',
  ASA_IMPORT_ERROR = 'ASA_IMPORT_ERROR',
  RECONCILIATION_IN_PROGRESS = 'RECONCILIATION_IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export enum ValidationStatus {
  VALIDATED = 'VALIDATED',
  DIVERGENT = 'DIVERGENT',
}

export enum ValidationSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
}

export enum AsaImportReviewStatus {
  PENDING = 'PENDING',
  CORRECT = 'CORRECT',
  DIFFERENT_VALUE = 'DIFFERENT_VALUE',
  ERROR = 'ERROR',
}

export type TimelineStage =
  | 'PORTAL'
  | 'PAYMENT'
  | 'DOWNLOADS'
  | 'PROCESSING'
  | 'VALIDATION'
  | 'ASA_FILE'
  | 'ASA_REVIEW';

export type TimelineEvent = {
  id: string;
  stage: TimelineStage;
  title: string;
  details: string;
  occurredAt: string;
  success: boolean;
};

export type OriginalFileRecord = {
  id: string;
  fileName: string;
  relativePath: string;
  sha256: string;
  sizeBytes: number;
  kind: 'ORIGINAL' | 'PROCESSED' | 'ASA';
  createdAt: string;
};

export type TussConversionRecord = {
  originalCode: string;
  asaCode: string | null;
  matched: boolean;
  mappingSource: string;
};

export type Procedure = {
  id: string;
  guideNumber: string;
  codigoOriginal: string;
  codigoASA: string;
  descricao: string;
  quantidade: number;
  valorCents: MoneyCents;
  glosaCents: MoneyCents;
  valorAuxiliaresCents: [MoneyCents, MoneyCents, MoneyCents];
  valorInstitucionalCents: MoneyCents;
  dataAtendimento: string;
  pacienteNome: string;
  filme: string;
  codGlosa: string;
  originalData: Record<string, unknown>;
  transformations: TussConversionRecord[];
};

export type Guide = {
  id: string;
  numeroGuia: string;
  paciente: string;
  dataAtendimento: string;
  procedures: Procedure[];
};

export type Payment = {
  id: string;
  convenioCode: string;
  convenioName: string;
  paymentDate: string;
  competence: string | null;
  totalAmountCents: MoneyCents;
  externalIdentifier: string | null;
  batchIdentifier: string | null;
};

export type ValidationIssue = {
  code: string;
  severity: ValidationSeverity;
  message: string;
};

export type ValidationSnapshot = {
  status: ValidationStatus;
  portalAmountCents: MoneyCents | null;
  demonstrativeAmountCents: MoneyCents;
  asaAmountCents: MoneyCents;
  guideCount: number;
  duplicateGuides: string[];
  missingTussMappings: string[];
  issues: ValidationIssue[];
};

export type AsaFileReference = {
  fileName: string;
  relativePath: string;
  createdAt: string;
};

export type AsaImportReview = {
  status: AsaImportReviewStatus;
  expectedAmountCents: MoneyCents;
  importedAmountCents: MoneyCents | null;
  differenceAmountCents: MoneyCents | null;
  notes: string | null;
  updatedAt: string | null;
};

export type Demonstrative = {
  id: string;
  convenioCode: string;
  convenioName: string;
  payment: Payment;
  status: DemonstrativeStatus;
  portalAmountCents: MoneyCents | null;
  demonstrativeAmountCents: MoneyCents;
  guideCount: number;
  guides: Guide[];
  originalFiles: OriginalFileRecord[];
  processedFiles: OriginalFileRecord[];
  asaFile: AsaFileReference | null;
  validation: ValidationSnapshot | null;
  timeline: TimelineEvent[];
  importReview: AsaImportReview;
  createdAt: string;
  updatedAt: string;
};

export type SchedulerSettings = {
  enabled: boolean;
  weekdays: number[];
  time: string;
  timezone: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
};

export type RunLogLevel = 'INFO' | 'ERROR';

export type RunLogEntry = {
  id: string;
  step: string;
  level: RunLogLevel;
  message: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
};

export type ProcessingRun = {
  id: string;
  convenioCode: string;
  convenioName: string;
  startedAt: string;
  finishedAt: string | null;
  success: boolean;
  demonstrativeIds: string[];
  logs: RunLogEntry[];
};

export type AppState = {
  demonstratives: Demonstrative[];
  runs: ProcessingRun[];
  scheduler: SchedulerSettings;
};

export type AsaOutputRow = {
  CodConvenio: string;
  Guia: string;
  TUSS: string;
  Valor: string;
  Filme: string;
  Qtde: string;
  CodGlosa: string;
  ValorAux1: string;
  ValorAux2: string;
  ValorAux3: string;
  ValorInst: string;
  Data: string;
  Nome: string;
};
