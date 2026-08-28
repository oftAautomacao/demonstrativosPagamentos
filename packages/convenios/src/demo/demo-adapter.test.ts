import { addMoney } from '@asa/domain';

import { DemoConvenioAdapter } from './demo-adapter';

describe('DemoConvenioAdapter', () => {
  it('normalizes fixture rows into the internal draft format', async () => {
    const adapter = new DemoConvenioAdapter();
    const context = {
      browserAgent: null,
      currentDate: new Date('2026-08-28T12:00:00.000Z'),
    };

    const candidate = (await adapter.locatePendingPayments(context))[0]!;
    const artifacts = await adapter.downloadArtifacts(candidate, context);
    const interpreted = await adapter.interpretArtifacts(candidate, artifacts, context);
    const normalized = await adapter.normalizeData(candidate, interpreted, context);

    expect(normalized.procedures).toHaveLength(3);
    expect(normalized.payment.externalIdentifier).toBe('DEMO-2026-08-17-001');
    expect(addMoney(...normalized.procedures.map((procedure) => procedure.amountCents))).toBe(47730);
  });
});
