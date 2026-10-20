import type { CityDistrict, GameState } from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Efeito do distrito onde a sede foi erguida.
//
// O lote escolhido no mapa 3D não é decorativo: cada distrito troca comércio
// por produção ou por defesa. Os multiplicadores são pequenos e simétricos para
// não quebrar o balanceamento já calibrado por simulação.
// ─────────────────────────────────────────────────────────────────────────────

export interface HqEffect {
  label: string;
  commerce: number;
  production: number;
  defense: number;
  description: string;
}

export const HQ_DISTRICTS: Record<CityDistrict, HqEffect> = {
  Centro: {
    label: 'Centro',
    commerce: 0.1,
    production: 0,
    defense: -0.06,
    description: 'Sede no coração financeiro: +10% comércio na capital, −6% defesa.',
  },
  Expansão: {
    label: 'Expansão',
    commerce: -0.04,
    production: 0.08,
    defense: 0,
    description: 'Sede em área de crescimento: +8% produção de bens e materiais, −4% comércio.',
  },
  Periferia: {
    label: 'Periferia',
    commerce: -0.05,
    production: 0,
    defense: 0.14,
    description: 'Sede em terreno amplo e protegido: +14% defesa na capital, −5% comércio.',
  },
};

/** Multiplicador só vale na capital e só para a facção que fundou a sede. */
export function hqEffectFor(state: GameState, tileId: string): HqEffect | null {
  const seat = state.city;
  if (!seat) return null;
  const tile = state.tiles[tileId];
  if (!tile || !tile.isCapital) return null;
  if (tile.owner !== state.playerFactionId) return null;
  return HQ_DISTRICTS[seat.district] ?? null;
}

export function hqCommerceMult(state: GameState, tileId: string): number {
  return 1 + (hqEffectFor(state, tileId)?.commerce ?? 0);
}

export function hqProductionMult(state: GameState, tileId: string): number {
  return 1 + (hqEffectFor(state, tileId)?.production ?? 0);
}

export function hqDefenseMult(state: GameState, tileId: string): number {
  return 1 + (hqEffectFor(state, tileId)?.defense ?? 0);
}
