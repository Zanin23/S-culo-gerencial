import { RESOURCES, RESOURCE_KEYS } from '../game/constants';
import type { Flow, ResourceKey, Stocks } from '../game/types';

const numberFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function fmt(value: number): string {
  if (!Number.isFinite(value)) return '0';
  if (Math.abs(value) >= 100) return numberFormat.format(Math.round(value));
  if (Math.abs(value) >= 10) return numberFormat.format(Math.round(value));
  if (Math.abs(value) < 0.05) return '0';
  return decimalFormat.format(value);
}

export function fmtRate(value: number): string {
  if (Math.abs(value) < 0.05) return '0';
  return `${value > 0 ? '+' : '−'}${fmt(Math.abs(value))}`;
}

export function signed(value: number, digits = 1): string {
  if (Math.abs(value) < 0.05) return '0';
  const text = digits ? value.toFixed(digits).replace('.', ',') : numberFormat.format(Math.round(value));
  return `${value > 0 ? '+' : '−'}${text.replace('-', '')}`;
}

export function pct(value: number): string {
  return `${Math.round(value)}%`;
}

export function trendClass(value: number): string {
  if (value > 0.05) return 'is-positive';
  if (value < -0.05) return 'is-negative';
  return 'is-neutral';
}

export function costEntries(cost: Partial<Stocks> | null | undefined): Array<{ key: ResourceKey; value: number }> {
  if (!cost) return [];
  return RESOURCE_KEYS.filter((key) => (cost[key] ?? 0) > 0).map((key) => ({
    key,
    value: Math.round(cost[key] ?? 0),
  }));
}

export function resourceChipLabel(key: ResourceKey): string {
  return RESOURCES[key].short;
}

export function flowEntries(flow: Flow): Array<{ key: ResourceKey; value: number }> {
  return RESOURCE_KEYS.map((key) => ({ key, value: flow[key] }));
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 8) return 'agora mesmo';
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `há ${hours} h`;
}

export function plural(value: number, singular: string, pluralText: string): string {
  return value === 1 ? singular : pluralText;
}

export function cycleLabel(cycle: number): string {
  return `Ciclo ${String(cycle).padStart(2, '0')}`;
}

export function signedPct(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}
