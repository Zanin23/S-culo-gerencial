// ─────────────────────────────────────────────────────────────────────────────
// MANAGEMENT CENTURY — Domain model
// The engine is deliberately framework-free: it can run in the browser today and
// behind an authoritative server later without changing any rule.
// ─────────────────────────────────────────────────────────────────────────────

export type ResourceKey =
  | 'creditos'
  | 'alimentos'
  | 'energia'
  | 'materias'
  | 'bens'
  | 'influencia'
  | 'conhecimento';

export type Stocks = Record<ResourceKey, number>;
export type Flow = Record<ResourceKey, number>;
export type Cost = Partial<Stocks>;

export type FactionId = 'concordia' | 'aurelia' | 'kestrel' | 'vantor';
export type Personality = 'mercantil' | 'industrial' | 'militar' | 'tecnocrata';

export type TerrainKey =
  | 'planicie'
  | 'floresta'
  | 'colina'
  | 'montanha'
  | 'costa'
  | 'deserto'
  | 'agua';

export type ResourceNode =
  | 'nenhum'
  | 'fertil'
  | 'minerio'
  | 'energia'
  | 'madeira'
  | 'pesca'
  | 'raro';

export type BuildingKey =
  | 'fazenda'
  | 'extratora'
  | 'usina'
  | 'industria'
  | 'entreposto'
  | 'administrativo'
  | 'pesquisa'
  | 'defesa'
  | 'logistica';

export type TechBranch = 'economia' | 'industria' | 'logistica' | 'estado';

export type TechId =
  | 'ec1' | 'ec2' | 'ec3' | 'ec4'
  | 'in1' | 'in2' | 'in3' | 'in4'
  | 'lg1' | 'lg2' | 'lg3' | 'lg4'
  | 'es1' | 'es2' | 'es3' | 'es4';

export type MarketKey = 'alimentos' | 'energia' | 'materias' | 'bens';

export type GamePhase = 'playing' | 'victory' | 'defeat';

export type ProjectKind = 'construcao' | 'expansao' | 'operacao' | 'pesquisa';

export interface Tile {
  /** ISO 3166-1 alpha-3 (Natural Earth ADM0_A3). */
  id: string;
  name: string;
  continent: string;
  capitalCity: string;
  lat: number;
  lon: number;
  area: number;
  provinceCount: number;
  cityCount: number;
  terrain: TerrainKey;
  node: ResourceNode;
  pop: number;
  owner: FactionId | null;
  buildings: Record<BuildingKey, number>;
  unrest: number;
  strategic: number;
  isCapital: boolean;
  note?: string;
  conqueredCycle?: number;
}

export interface Faction {
  id: FactionId;
  stocks: Stocks;
  techs: TechId[];
  capitalId: string;
  military: number;
  lastFlow: Flow;
  lastProduction: Flow;
  lastConsumption: Flow;
  shortages: ResourceKey[];
  debts: Debt[];
  warExhaustion: number;
  eliminated: boolean;
  lastGiftCycle: number;
}

export interface Debt {
  label: string;
  credits: number;
  untilCycle: number;
}

export interface Relation {
  relation: number;
  trade: boolean;
  nonAggression: boolean;
  alliance: boolean;
  war: boolean;
  since: number;
}

export type DiplomacyMap = Record<string, Relation>;

export interface Project {
  id: string;
  factionId: FactionId;
  kind: ProjectKind;
  tileId: string;
  building?: BuildingKey;
  targetLevel?: number;
  targetFaction?: FactionId;
  techId?: TechId;
  label: string;
  cost: Cost;
  startedCycle: number;
  completesCycle: number;
}

export interface DiplomaticOffer {
  id: string;
  from: FactionId;
  to: FactionId;
  kind: 'trade' | 'nonAggression' | 'alliance' | 'peace';
  createdCycle: number;
  expiresCycle: number;
}

export type LogKind =
  | 'economia'
  | 'construcao'
  | 'expansao'
  | 'diplomacia'
  | 'militar'
  | 'evento'
  | 'sistema'
  | 'pesquisa';

export interface LogEntry {
  id: string;
  cycle: number;
  kind: LogKind;
  text: string;
  factionId?: FactionId;
}

export interface ActiveModifier {
  id: string;
  label: string;
  description: string;
  untilCycle: number;
  scope: 'global' | 'faction';
  factionId?: FactionId;
  production?: Partial<Flow>;
  market?: Partial<Record<MarketKey, number>>;
  researchDiscount?: number;
  tradeBonus?: number;
  unrestPerCycle?: number;
}

export interface MarketState {
  prices: Record<MarketKey, number>;
  previous: Record<MarketKey, number>;
}

export interface CycleSnapshot {
  cycle: number;
  stocks: Stocks;
  production: Flow;
  net: Flow;
  tiles: number;
  pop: number;
  score: number;
}

export interface CycleReport {
  cycle: number;
  deltas: Flow;
  production: Flow;
  consumption: Flow;
  completed: string[];
  events: string[];
  shortages: ResourceKey[];
  battles: BattleReport[];
  alerts: string[];
  notable: boolean;
}

export interface BattleReport {
  cycle: number;
  attacker: FactionId;
  defender: FactionId;
  tileId: string;
  tileName: string;
  attackerStrength: number;
  defenderStrength: number;
  success: boolean;
  attackerLoss: number;
  defenderLoss: number;
}

export interface ObjectiveState {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  done: boolean;
  unit: string;
  hint: string;
  icon: string;
}

export interface TutorialState {
  seenIntro: boolean;
  step: number;
  done: boolean;
}

export interface GameSettings {
  showDigest: boolean;
}

export type CityDistrict = 'Centro' | 'Expansão' | 'Periferia';

/** Sede do jogador: cidade real escolhida no mapa-múndi e lote no plano 3D. */
export interface CitySeat {
  cityId: string;
  cityName: string;
  countryId: string;
  plotId: string;
  district: CityDistrict;
  lat: number;
  lon: number;
  foundedCycle: number;
}

export interface GameState {
  version: number;
  seed: number;
  rngState: number;
  cycle: number;
  phase: GamePhase;
  playerFactionId: FactionId;
  createdAt: number;
  factions: Record<FactionId, Faction>;
  tiles: Record<string, Tile>;
  diplomacy: DiplomacyMap;
  market: MarketState;
  projects: Project[];
  offers: DiplomaticOffer[];
  modifiers: ActiveModifier[];
  log: LogEntry[];
  history: CycleSnapshot[];
  pendingEventId: string | null;
  usedEvents: string[];
  lastReport: CycleReport | null;
  lastBattle: BattleReport | null;
  victoryCycle: number | null;
  tutorial: TutorialState;
  settings: GameSettings;
  /** Presente a partir da fundação da sede; saves antigos não têm o campo. */
  city?: CitySeat | null;
  nextId: number;
}

export interface CommandResult {
  ok: boolean;
  state: GameState;
  message: string;
}
