import type { DiplomacyMap, FactionId, GameState, Relation } from './types';

export const RELATION_SEED: Record<string, number> = {
  'aurelia|concordia': 12,
  'concordia|kestrel': 5,
  'concordia|vantor': -14,
  'aurelia|kestrel': 10,
  'aurelia|vantor': -6,
  'kestrel|vantor': -8,
};

export function relationKey(a: FactionId, b: FactionId): string {
  return [a, b].sort().join('|');
}

export const EMPTY_RELATION = (): Relation => ({
  relation: 0,
  trade: false,
  nonAggression: false,
  alliance: false,
  war: false,
  since: 0,
});

export function getRelation(state: GameState, a: FactionId, b: FactionId): Relation {
  return state.diplomacy[relationKey(a, b)] ?? EMPTY_RELATION();
}

export function getRelationFromMap(map: DiplomacyMap, a: FactionId, b: FactionId): Relation {
  return map[relationKey(a, b)] ?? EMPTY_RELATION();
}

export function relationStatus(r: Relation): { label: string; tone: 'good' | 'warm' | 'neutral' | 'cold' | 'bad' } {
  if (r.war) return { label: 'Em guerra', tone: 'bad' };
  if (r.alliance) return { label: 'Aliança', tone: 'good' };
  if (r.nonAggression) return { label: 'Não-agressão', tone: 'warm' };
  if (r.trade) return { label: 'Acordo comercial', tone: 'warm' };
  if (r.relation >= 40) return { label: 'Cordial', tone: 'good' };
  if (r.relation >= 10) return { label: 'Neutra', tone: 'neutral' };
  if (r.relation >= -20) return { label: 'Tensa', tone: 'cold' };
  return { label: 'Hostil', tone: 'bad' };
}

export function hasActivePact(r: Relation): boolean {
  return r.trade || r.nonAggression || r.alliance;
}

export function relationsOf(state: GameState, factionId: FactionId): Array<{ other: FactionId; relation: Relation }> {
  const others = (Object.keys(state.factions) as FactionId[]).filter((id) => id !== factionId);
  return others.map((other) => ({ other, relation: getRelation(state, factionId, other) }));
}

export function proposeCost(kind: 'trade' | 'nonAggression' | 'alliance' | 'peace'): number {
  return kind === 'trade' ? 4 : kind === 'nonAggression' ? 7 : kind === 'alliance' ? 12 : 2;
}

export function relationRequirement(kind: 'trade' | 'nonAggression' | 'alliance' | 'peace'): number {
  return kind === 'trade' ? 20 : kind === 'nonAggression' ? 32 : kind === 'alliance' ? 62 : -100;
}

export function offerLabel(kind: 'trade' | 'nonAggression' | 'alliance' | 'peace'): string {
  return kind === 'trade'
    ? 'Acordo comercial'
    : kind === 'nonAggression'
      ? 'Pacto de não-agressão'
      : kind === 'alliance'
        ? 'Aliança'
        : 'Tratado de paz';
}
