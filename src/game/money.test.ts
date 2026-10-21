import { describe, expect, it } from 'vitest';
import { reaisShort } from './money';
import { money } from '../ui/format';

describe('escala monetária em reais', () => {
  it('mostra milhões, milhares e reais inteiros no padrão brasileiro', () => {
    expect(money(12_000_000)).toBe('R$ 12,0 mi');
    expect(money(850_000)).toBe('R$ 850 mil');
    expect(money(8_400)).toBe('R$ 8.400');
    expect(money(-1_500_000)).toBe('−R$ 1,5 mi');
    expect(money(1_500_000, true)).toBe('+R$ 1,5 mi');
  });

  it('encurta bilhões sem perder a ordem de grandeza', () => {
    expect(reaisShort(2_400_000_000)).toBe('R$ 2,4 bi');
    expect(reaisShort(0)).toBe('R$ 0');
    expect(reaisShort(Number.NaN)).toBe('R$ 0');
  });
});
