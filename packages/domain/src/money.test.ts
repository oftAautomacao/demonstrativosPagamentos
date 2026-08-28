import { addMoney, areAmountsEqual, formatMoneyBRL, moneyFromDecimal } from './money';

describe('money utilities', () => {
  it('sums values using integer cents', () => {
    expect(addMoney(100, 205, 995)).toBe(1300);
  });

  it('compares amounts exactly in cents', () => {
    expect(areAmountsEqual(13733424, 13733424)).toBe(true);
    expect(areAmountsEqual(13733424, 13695424)).toBe(false);
  });

  it('parses brazilian and dot-decimal formats safely', () => {
    expect(moneyFromDecimal('137.334,24')).toBe(13733424);
    expect(moneyFromDecimal('380.00')).toBe(38000);
    expect(moneyFromDecimal('136954,24')).toBe(13695424);
  });

  it('formats values for UI output', () => {
    expect(formatMoneyBRL(47730)).toBe('R$\u00a0477,30');
  });
});
