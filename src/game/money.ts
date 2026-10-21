// ─────────────────────────────────────────────────────────────────────────────
// Sistema monetário da MANAGEMENT CENTURY.
//
// Um ciclo representa **um mês de operação** e todos os valores são expressos em
// reais (R$). O grupo começa como uma companhia de porte médio: a sede, as praças
// licenciadas e as primeiras unidades valem milhões, como no mercado real.
//
// Âncoras usadas para calibrar o jogo (valores aproximados de mercado):
//   • loja/centro de varejo de rua .............. R$ 3–5 mi de implantação
//   • unidade agropecuária média ................ R$ 2–4 mi de terra e maquinário
//   • terminal portuário / pátio ................ R$ 10–20 mi
//   • planta industrial média ................... R$ 8–15 mi
//   • linha de montagem de veículos ............. R$ 25–40 mi
//   • sede corporativa (8 andares) .............. R$ 6–8 mi
//   • torre administrativa ...................... R$ 20–30 mi
//   • campus matriz ............................. R$ 60–80 mi
//   • folha de pagamento por unidade ............ 15–25% da receita
//   • manutenção predial ........................ 1,5–3% do imóvel por mês
//
// A rentabilidade dos ativos fica entre 3% e 6% do capital investido por ciclo
// (payback de 15 a 30 ciclos), faixa que mantém a progressão jogável sem preços
// irreais como "uma fábrica por R$ 500".
// ─────────────────────────────────────────────────────────────────────────────

/** Reais → valor por extenso curto, usado em textos do motor (sem depender da UI). */
export function reaisShort(value: number): string {
  if (!Number.isFinite(value)) return 'R$ 0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000_000) return `${sign}R$ ${(abs / 1_000_000_000).toFixed(1).replace('.', ',')} bi`;
  if (abs >= 1_000_000) return `${sign}R$ ${(abs / 1_000_000).toFixed(1).replace('.', ',')} mi`;
  if (abs >= 1_000) return `${sign}R$ ${Math.round(abs / 1_000)} mil`;
  return `${sign}R$ ${Math.round(abs)}`;
}

/** Caixa inicial do grupo jogador: capital de giro e primeira rodada de investimento. */
export const START_CASH = 12_000_000;
/** Caixa inicial das rivais: entram um pouco atrás para dar espaço ao jogador. */
export const AI_START_CASH = 9_000_000;

/**
 * Multiplicador de conversão de campanhas antigas (v5 ou anterior) para a escala
 * em reais. Aplicado ao caixa e aos custos já contratados na migração.
 */
export const LEGACY_MONEY_SCALE = 20_000;

/** Piso de caixa que a IA mantém antes de assumir novos compromissos. */
export const AI_RESERVE = 2_500_000;
