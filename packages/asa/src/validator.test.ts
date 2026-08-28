import { ValidationStatus } from '@asa/domain';

import { createSampleDemonstrative } from '../../../tests/support/sample-demonstrative';
import { createAsaRows } from './generator';
import { validateDemonstrative } from './validator';

describe('ASA validator', () => {
  it('validates matching totals', () => {
    const demonstrative = createSampleDemonstrative();
    const validation = validateDemonstrative(demonstrative, createAsaRows(demonstrative));

    expect(validation?.status).toBe(ValidationStatus.VALIDATED);
    expect(validation?.issues).toHaveLength(0);
  });

  it('detects divergences between demonstrative and ASA totals', () => {
    const demonstrative = createSampleDemonstrative();
    demonstrative.guides[0]?.procedures[0] && (demonstrative.guides[0].procedures[0].valorCents = 37000);

    const validation = validateDemonstrative(demonstrative, createAsaRows(demonstrative));

    expect(validation?.status).toBe(ValidationStatus.DIVERGENT);
    expect(validation?.issues.some((issue) => issue.code === 'PORTAL_ASA_MISMATCH')).toBe(true);
  });

  it('detects duplicated procedure rows', () => {
    const demonstrative = createSampleDemonstrative();
    const rows = createAsaRows(demonstrative);
    rows.push({ ...rows[0]! });

    const validation = validateDemonstrative(demonstrative, rows);

    expect(validation?.duplicateGuides).toContain('000123456789');
  });
});
