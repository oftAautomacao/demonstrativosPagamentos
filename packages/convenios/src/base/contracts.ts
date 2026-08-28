import type { BrowserAgent } from '@asa/browser';
import type { MoneyCents, Payment } from '@asa/domain';

export type PortalCredentials = {
  username: string;
  password: string;
};

export type PendingPaymentCandidate = {
  convenioCode: string;
  convenioName: string;
  paymentDate: string;
  competence: string | null;
  totalAmountCents: MoneyCents;
  externalIdentifier: string | null;
  batchIdentifier: string | null;
};

export type DownloadedArtifact = {
  fileName: string;
  contents: Buffer;
  mediaType: string;
};

export type InterpretedProcedureRecord = {
  guideNumber: string;
  patientName: string;
  serviceDate: string;
  codigoOriginal: string;
  description: string;
  quantity: number;
  amountCents: MoneyCents;
  glosaCents: MoneyCents;
  auxValuesCents: [MoneyCents, MoneyCents, MoneyCents];
  institutionalAmountCents: MoneyCents;
  film: string;
  codGlosa: string;
  originalData: Record<string, unknown>;
};

export type InterpretedArtifacts = {
  portalAmountCents: MoneyCents | null;
  rows: InterpretedProcedureRecord[];
  metadata: Record<string, unknown>;
};

export type NormalizedProcedureDraft = InterpretedProcedureRecord;

export type NormalizedDemonstrativeDraft = {
  payment: Payment;
  portalAmountCents: MoneyCents | null;
  procedures: NormalizedProcedureDraft[];
  sourceMetadata: Record<string, unknown>;
};

export type ConvenioExecutionContext = {
  browserAgent: BrowserAgent | null;
  currentDate: Date;
};

export type ConvenioAdapter = {
  code: string;
  displayName: string;
  openPortal(context: ConvenioExecutionContext): Promise<void>;
  performLogin(credentials: PortalCredentials, context: ConvenioExecutionContext): Promise<void>;
  locatePendingPayments(context: ConvenioExecutionContext): Promise<PendingPaymentCandidate[]>;
  downloadArtifacts(
    payment: PendingPaymentCandidate,
    context: ConvenioExecutionContext,
  ): Promise<DownloadedArtifact[]>;
  interpretArtifacts(
    payment: PendingPaymentCandidate,
    artifacts: DownloadedArtifact[],
    context: ConvenioExecutionContext,
  ): Promise<InterpretedArtifacts>;
  normalizeData(
    payment: PendingPaymentCandidate,
    interpreted: InterpretedArtifacts,
    context: ConvenioExecutionContext,
  ): Promise<NormalizedDemonstrativeDraft>;
};
