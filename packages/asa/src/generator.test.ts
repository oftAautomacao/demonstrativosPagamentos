import { createAsaRows, createAsaWorkbook, sumAsaRowValues } from './generator';
import { createSampleDemonstrative } from '../../../tests/support/sample-demonstrative';

describe('ASA generator', () => {
  it('generates rows in the expected order', () => {
    const demonstrative = createSampleDemonstrative();
    const rows = createAsaRows(demonstrative);

    expect(rows).toHaveLength(3);
    expect(Object.keys(rows[0] ?? {})).toEqual([
      'CodConvenio',
      'Guia',
      'TUSS',
      'Valor',
      'Filme',
      'Qtde',
      'CodGlosa',
      'ValorAux1',
      'ValorAux2',
      'ValorAux3',
      'ValorInst',
      'Data',
      'Nome',
    ]);
  });

  it('preserves leading zeros for guide and TUSS values', () => {
    const demonstrative = createSampleDemonstrative();
    const rows = createAsaRows(demonstrative);

    expect(rows[0]?.Guia).toBe('000123456789');
    expect(rows[0]?.TUSS).toBe('041301240');
  });

  it('creates workbook and preserves totals', () => {
    const demonstrative = createSampleDemonstrative();
    const workbook = createAsaWorkbook(demonstrative);

    expect(workbook.buffer.byteLength).toBeGreaterThan(0);
    expect(sumAsaRowValues(workbook.rows)).toBe(47730);
  });
});
