import type {
  BuildingKey,
  FactionId,
  Flow,
  MarketKey,
  Personality,
  ResourceKey,
  ResourceNode,
  Stocks,
  TechBranch,
  TechId,
  TerrainKey,
} from './types';

// ── Identity ────────────────────────────────────────────────────────────────

export const GAME = {
  id: 'management-century',
  name: 'MANAGEMENT CENTURY',
  subtitle: 'Crônicas da Partilha',
  world: 'Terra · A Partilha',
  tagline: 'Toda fronteira é uma decisão.',
  version: 2,
  saveVersion: 2,
  baseProjectSlots: 2,
  baseAdminCapacity: 4,
  maxBuildingLevel: 3,
  victoryTitle: 'Hegemonia Consolidada',
};

export const RESOURCE_KEYS: ResourceKey[] = [
  'creditos',
  'alimentos',
  'energia',
  'materias',
  'bens',
  'influencia',
  'conhecimento',
];

export const MARKET_KEYS: MarketKey[] = ['alimentos', 'energia', 'materias', 'bens'];

export interface ResourceMeta {
  key: ResourceKey;
  label: string;
  short: string;
  icon: string;
  color: string;
  description: string;
  market?: boolean;
}

export const RESOURCES: Record<ResourceKey, ResourceMeta> = {
  creditos: {
    key: 'creditos', label: 'Créditos', short: 'Cr', icon: 'Coins', color: '#e4bd72',
    description: 'Moeda de reserva do sistema. Financia obras, tropas, acordos e expansão.',
  },
  alimentos: {
    key: 'alimentos', label: 'Alimentos', short: 'Al', icon: 'Wheat', color: '#82c97c',
    description: 'Sustenta a população. Escassez gera fome, desordem e êxodo.',
  },
  energia: {
    key: 'energia', label: 'Energia', short: 'En', icon: 'Zap', color: '#6cc8e8',
    description: 'Move indústrias e centros de pesquisa. O déficit reduz a produção.',
  },
  materias: {
    key: 'materias', label: 'Matérias-primas', short: 'Mp', icon: 'Pickaxe', color: '#c7a17b',
    description: 'Insumo de construção e da indústria. Pode ser vendido no mercado.',
  },
  bens: {
    key: 'bens', label: 'Bens industriais', short: 'Bi', icon: 'Package', color: '#c6a5ea',
    description: 'Produzidos pelos complexos industriais e valorizados pelo comércio.',
  },
  influencia: {
    key: 'influencia', label: 'Influência', short: 'In', icon: 'Crown', color: '#6fd9c7',
    description: 'Capital político para reivindicar territórios e firmar acordos.',
  },
  conhecimento: {
    key: 'conhecimento', label: 'Conhecimento', short: 'Co', icon: 'FlaskConical', color: '#93b7f4',
    description: 'Produzido por centros de pesquisa. Desbloqueia a árvore tecnológica.',
  },
};

export const EMPTY_FLOW = (): Flow => ({
  creditos: 0, alimentos: 0, energia: 0, materias: 0, bens: 0, influencia: 0, conhecimento: 0,
});

export const EMPTY_STOCKS = (): Stocks => ({ ...EMPTY_FLOW() });

// ── Terrain & resources ─────────────────────────────────────────────────────

export interface TerrainDef {
  key: TerrainKey;
  name: string;
  description: string;
  baseFood: number;
  baseMaterials: number;
  baseEnergy: number;
  slots: number;
  color: string;
  texture: 'plains' | 'forest' | 'hills' | 'mountain' | 'coast' | 'desert' | 'sea';
}

export const TERRAIN: Record<TerrainKey, TerrainDef> = {
  planicie: {
    key: 'planicie', name: 'Planície', description: 'Solo agrícola e boas rotas terrestres.',
    baseFood: 2.6, baseMaterials: 0.4, baseEnergy: 0, slots: 1, color: '#596f50', texture: 'plains',
  },
  floresta: {
    key: 'floresta', name: 'Floresta', description: 'Madeira abundante e clima úmido.',
    baseFood: 0.9, baseMaterials: 1.2, baseEnergy: 0.1, slots: 0, color: '#3c5a49', texture: 'forest',
  },
  colina: {
    key: 'colina', name: 'Colina', description: 'Relevo favorável à extração e à defesa.',
    baseFood: 0.8, baseMaterials: 1.8, baseEnergy: 0.2, slots: 1, color: '#706549', texture: 'hills',
  },
  montanha: {
    key: 'montanha', name: 'Montanha', description: 'Jazidas ricas e barreiras naturais.',
    baseFood: 0.25, baseMaterials: 2.4, baseEnergy: 0.7, slots: 0, color: '#606068', texture: 'mountain',
  },
  costa: {
    key: 'costa', name: 'Costa', description: 'Portos naturais e pesca; rota para o mar.',
    baseFood: 2.3, baseMaterials: 0.3, baseEnergy: 0.1, slots: 1, color: '#69725d', texture: 'coast',
  },
  deserto: {
    key: 'deserto', name: 'Deserto', description: 'Terreno árido, mas há depósitos raros sob a areia.',
    baseFood: 0.15, baseMaterials: 0.7, baseEnergy: 0.2, slots: 0, color: '#8b7553', texture: 'desert',
  },
  agua: {
    key: 'agua', name: 'Oceano aberto', description: 'Águas profundas. Fora das fronteiras terrestres.',
    baseFood: 0, baseMaterials: 0, baseEnergy: 0, slots: 0, color: '#0d1828', texture: 'sea',
  },
};

export interface NodeDef {
  key: ResourceNode;
  name: string;
  description: string;
  bonus: Partial<Flow>;
  color: string;
  symbol: string;
}

export const NODES: Record<ResourceNode, NodeDef> = {
  nenhum: { key: 'nenhum', name: 'Sem depósito', description: 'Nenhum recurso especial mapeado.', bonus: {}, color: '#7c8797', symbol: '' },
  fertil: { key: 'fertil', name: 'Solo fértil', description: '+2,4 alimentos por ciclo no território.', bonus: { alimentos: 2.4 }, color: '#82c97c', symbol: 'leaf' },
  minerio: { key: 'minerio', name: 'Jazida mineral', description: '+2,8 matérias-primas por ciclo.', bonus: { materias: 2.8 }, color: '#c7a17b', symbol: 'diamond' },
  energia: { key: 'energia', name: 'Queda d’água', description: '+2,8 energia por ciclo.', bonus: { energia: 2.8 }, color: '#6cc8e8', symbol: 'bolt' },
  madeira: { key: 'madeira', name: 'Floresta manejada', description: '+1,6 matérias-primas e +1 crédito por ciclo.', bonus: { materias: 1.6, creditos: 1 }, color: '#91a878', symbol: 'tree' },
  pesca: { key: 'pesca', name: 'Costa pesqueira', description: '+2 alimentos por ciclo.', bonus: { alimentos: 2 }, color: '#74b7c7', symbol: 'wave' },
  raro: { key: 'raro', name: 'Depósito raro', description: '+5 créditos e +0,8 influência por ciclo.', bonus: { creditos: 5, influencia: 0.8 }, color: '#d9a7f0', symbol: 'star' },
};

// ── Buildings ───────────────────────────────────────────────────────────────

export interface BuildingLevel {
  cost: Partial<Stocks>;
  cycles: number;
}

export interface BuildingDef {
  key: BuildingKey;
  name: string;
  short: string;
  icon: string;
  category: string;
  description: string;
  accent: string;
  levels: BuildingLevel[];
  production: Partial<Flow>;
  consumption: Partial<Flow>;
  upkeep: Partial<Flow>;
  jobs: number;
  defense?: number;
  slotsBonus?: number;
  localProductionBonus?: number;
  terrainBonus?: { terrains?: TerrainKey[]; nodes?: ResourceNode[]; resource: ResourceKey; multiplier: number };
  techUnlock?: Partial<Record<number, TechId>>;
  effect: string;
}

const b = (
  credits: number, materias: number, energia: number, bens: number, cycles: number,
): BuildingLevel => ({ cost: { creditos: credits, materias, energia, bens }, cycles });

export const BUILDINGS: Record<BuildingKey, BuildingDef> = {
  fazenda: {
    key: 'fazenda', name: 'Fazendas Coletivas', short: 'Fazenda', icon: 'Wheat',
    category: 'Alimentos', accent: '#82c97c',
    description: 'Cooperativas agrícolas que alimentam as cidades e sustentam o crescimento populacional.',
    levels: [b(45, 6, 1, 0, 2), b(85, 16, 4, 0, 3), b(150, 30, 9, 0, 4)],
    production: { alimentos: 8 }, consumption: {}, upkeep: { creditos: 0.5 }, jobs: 7,
    terrainBonus: { nodes: ['fertil'], terrains: ['planicie'], resource: 'alimentos', multiplier: 0.5 },
    techUnlock: { 3: 'ec2' }, effect: '+8 alimentos/ciclo por nível.',
  },
  extratora: {
    key: 'extratora', name: 'Instalações de Extração', short: 'Extração', icon: 'Pickaxe',
    category: 'Matérias-primas', accent: '#c7a17b',
    description: 'Minas e serrarias mecanizadas que transformam o subsolo em insumo produtivo.',
    levels: [b(50, 10, 2, 0, 2), b(95, 22, 5, 0, 3), b(165, 40, 10, 0, 4)],
    production: { materias: 7 }, consumption: { energia: 0.5 }, upkeep: { creditos: 0.8 }, jobs: 8,
    terrainBonus: { nodes: ['minerio'], terrains: ['montanha', 'colina'], resource: 'materias', multiplier: 0.4 },
    techUnlock: { 3: 'in1' }, effect: '+7 matérias-primas/ciclo por nível.',
  },
  usina: {
    key: 'usina', name: 'Complexo Energético', short: 'Energia', icon: 'Zap',
    category: 'Energia', accent: '#6cc8e8',
    description: 'Turbinas e caldeiras que mantêm a rede estável. Sem energia, a nação desacelera.',
    levels: [b(60, 15, 0, 0, 2), b(110, 28, 0, 0, 3), b(190, 48, 0, 0, 4)],
    production: { energia: 8 }, consumption: { materias: 0.8 }, upkeep: { creditos: 1.2 }, jobs: 5,
    terrainBonus: { nodes: ['energia'], terrains: ['montanha'], resource: 'energia', multiplier: 0.4 },
    techUnlock: { 3: 'in2' }, effect: '+8 energia/ciclo por nível.',
  },
  industria: {
    key: 'industria', name: 'Complexo Industrial', short: 'Indústria', icon: 'Factory',
    category: 'Indústria', accent: '#c6a5ea',
    description: 'Linhas de montagem que convertem matérias-primas e energia em bens de alto valor.',
    levels: [b(105, 30, 10, 0, 3), b(190, 55, 20, 0, 4), b(320, 95, 35, 0, 5)],
    production: { bens: 7 }, consumption: { materias: 4.5, energia: 3 }, upkeep: { creditos: 2.5 }, jobs: 11,
    terrainBonus: { terrains: ['colina', 'planicie'], resource: 'bens', multiplier: 0.12 },
    techUnlock: { 3: 'in3' }, effect: '+7 bens/ciclo por nível; consome insumos.',
  },
  entreposto: {
    key: 'entreposto', name: 'Entreposto Comercial', short: 'Comércio', icon: 'Store',
    category: 'Comércio', accent: '#e4bd72',
    description: 'Casas de comércio que vendem bens industriais e geram créditos conforme o mercado.',
    levels: [b(70, 16, 4, 0, 2), b(130, 30, 8, 0, 3), b(220, 52, 14, 0, 4)],
    production: { creditos: 12 }, consumption: { bens: 1.5 }, upkeep: { creditos: 1.4 }, jobs: 6,
    terrainBonus: { terrains: ['costa'], resource: 'creditos', multiplier: 0.3 },
    techUnlock: { 3: 'ec1' }, effect: '≈12 créditos/ciclo por nível (varia com o preço dos bens).',
  },
  administrativo: {
    key: 'administrativo', name: 'Centro Administrativo', short: 'Administração', icon: 'Landmark',
    category: 'Administração', accent: '#9fc2b4',
    description: 'Burocracia eficiente: gera influência política e reduz a desordem local.',
    levels: [b(75, 14, 3, 0, 3), b(140, 28, 8, 0, 3), b(240, 50, 14, 0, 4)],
    production: { influencia: 2.5, creditos: 2 }, consumption: {}, upkeep: { creditos: 2 }, jobs: 5,
    techUnlock: { 3: 'es1' }, effect: '+2,5 influência e +0,5 capacidade administrativa por nível.',
  },
  pesquisa: {
    key: 'pesquisa', name: 'Centro de Pesquisa', short: 'Pesquisa', icon: 'FlaskConical',
    category: 'Ciência', accent: '#93b7f4',
    description: 'Laboratórios e academias que produzem conhecimento para novas tecnologias.',
    levels: [b(90, 22, 8, 0, 3), b(165, 42, 16, 0, 4), b(280, 75, 28, 0, 5)],
    production: { conhecimento: 3.5 }, consumption: { energia: 1.5 }, upkeep: { creditos: 2.8 }, jobs: 8,
    terrainBonus: { terrains: ['planicie'], resource: 'conhecimento', multiplier: 0.1 },
    techUnlock: { 3: 'es4' }, effect: '+3,5 conhecimento/ciclo por nível.',
  },
  defesa: {
    key: 'defesa', name: 'Instalações de Defesa', short: 'Defesa', icon: 'Shield',
    category: 'Defesa', accent: '#e39a80',
    description: 'Muralhas, baterias e guarnições permanentes que protegem o território.',
    levels: [b(60, 26, 2, 0, 2), b(115, 48, 8, 0, 3), b(200, 85, 18, 0, 4)],
    production: {}, consumption: {}, upkeep: { creditos: 1.8 }, jobs: 3, defense: 18,
    terrainBonus: { terrains: ['montanha', 'colina'], resource: 'creditos', multiplier: 0 },
    techUnlock: { 3: 'es3' }, effect: '+18 defesa territorial por nível.',
  },
  logistica: {
    key: 'logistica', name: 'Malha Logística', short: 'Logística', icon: 'Truck',
    category: 'Logística', accent: '#b7b3a1',
    description: 'Estradas, armazéns e ferrovias: mais espaço construível e produção local mais eficiente.',
    levels: [b(55, 14, 3, 0, 2), b(105, 26, 6, 0, 3), b(175, 44, 12, 0, 4)],
    production: {}, consumption: {}, upkeep: { creditos: 1.2 }, jobs: 3,
    slotsBonus: 2, localProductionBonus: 0.05,
    techUnlock: { 3: 'lg2' }, effect: '+2 espaços e +5% produção local por nível.',
  },
};

export const BUILDING_ORDER: BuildingKey[] = [
  'fazenda', 'extratora', 'usina', 'industria', 'entreposto',
  'administrativo', 'pesquisa', 'defesa', 'logistica',
];

// ── Technology ──────────────────────────────────────────────────────────────

export interface TechEffects {
  production?: Partial<Flow>;
  globalProduction?: number;
  tradeMult?: number;
  sellMult?: number;
  expansionCostMult?: number;
  expansionInfluenceMult?: number;
  maxProjects?: number;
  slotsBonus?: number;
  defenseMult?: number;
  militaryMult?: number;
  unrestReduction?: number;
  relationGainMult?: number;
  influencePerCycle?: number;
  adminCapacity?: number;
  industryEnergyMult?: number;
}

export type { TechBranch };

export interface TechDef {
  id: TechId;
  branch: TechBranch;
  tier: number;
  name: string;
  icon: string;
  description: string;
  cost: { conhecimento: number; creditos: number };
  requires: TechId[];
  effects: TechEffects;
  unlocks?: { building: BuildingKey; level: number }[];
  benefits: string[];
}

export const TECH_BRANCHES: Record<TechBranch, { name: string; icon: string; color: string; description: string }> = {
  economia: { name: 'Economia', icon: 'Coins', color: '#e4bd72', description: 'Mercados, agricultura e finanças.' },
  industria: { name: 'Indústria', icon: 'Factory', color: '#c6a5ea', description: 'Extração, energia e manufatura.' },
  logistica: { name: 'Logística', icon: 'Route', color: '#8fbfa5', description: 'Rotas, capacidade e integração territorial.' },
  estado: { name: 'Estado', icon: 'Scale', color: '#8fb4f5', description: 'Administração, diplomacia e defesa.' },
};

export const TECHS: Record<TechId, TechDef> = {
  ec1: {
    id: 'ec1', branch: 'economia', tier: 1, name: 'Mercados Abertos', icon: 'Coins',
    description: 'Feiras permanentes e câmaras de comércio dão liquidez à economia.',
    cost: { conhecimento: 12, creditos: 55 }, requires: [],
    effects: { tradeMult: 0.12, production: { creditos: 0.04 } },
    unlocks: [{ building: 'entreposto', level: 3 }],
    benefits: ['+12% de receita comercial', '+4% de receita urbana', 'Entreposto nível III'],
  },
  ec2: {
    id: 'ec2', branch: 'economia', tier: 2, name: 'Agricultura Intensiva', icon: 'Wheat',
    description: 'Irrigação planejada e rotação de culturas elevam a produtividade rural.',
    cost: { conhecimento: 26, creditos: 105 }, requires: ['ec1'],
    effects: { production: { alimentos: 0.2 } },
    unlocks: [{ building: 'fazenda', level: 3 }],
    benefits: ['+20% produção de alimentos', 'Fazendas nível III'],
  },
  ec3: {
    id: 'ec3', branch: 'economia', tier: 3, name: 'Bancos Nacionais', icon: 'Landmark',
    description: 'Crédito soberano e câmbio estável reduzem o custo de crescer.',
    cost: { conhecimento: 44, creditos: 180 }, requires: ['ec2'],
    effects: { production: { creditos: 0.12 }, expansionCostMult: -0.12 },
    benefits: ['+12% de receita urbana', '−12% custo de expansão'],
  },
  ec4: {
    id: 'ec4', branch: 'economia', tier: 4, name: 'Comércio Global', icon: 'Ship',
    description: 'Rotas marítimas conectam sua rede aos mercados além do horizonte.',
    cost: { conhecimento: 68, creditos: 290 }, requires: ['ec3'],
    effects: { tradeMult: 0.18, sellMult: 0.08 },
    benefits: ['+18% de receita comercial', '+8% preço de venda'],
  },
  in1: {
    id: 'in1', branch: 'industria', tier: 1, name: 'Metalurgia Avançada', icon: 'Flame',
    description: 'Fornalhas de alta temperatura multiplicam o rendimento das jazidas.',
    cost: { conhecimento: 14, creditos: 65 }, requires: [],
    effects: { production: { materias: 0.15 } },
    unlocks: [{ building: 'extratora', level: 3 }],
    benefits: ['+15% matérias-primas', 'Extração nível III'],
  },
  in2: {
    id: 'in2', branch: 'industria', tier: 2, name: 'Redes Inteligentes', icon: 'Zap',
    description: 'Distribuição elétrica adaptativa reduz perdas e aumenta a oferta.',
    cost: { conhecimento: 28, creditos: 120 }, requires: ['in1'],
    effects: { production: { energia: 0.16 } },
    unlocks: [{ building: 'usina', level: 3 }],
    benefits: ['+16% produção de energia', 'Usinas nível III'],
  },
  in3: {
    id: 'in3', branch: 'industria', tier: 3, name: 'Automação Pesada', icon: 'Bot',
    description: 'Braços mecânicos e controle de processos elevam a escala industrial.',
    cost: { conhecimento: 46, creditos: 205 }, requires: ['in2'],
    effects: { production: { bens: 0.22 } },
    unlocks: [{ building: 'industria', level: 3 }],
    benefits: ['+22% produção de bens', 'Indústria nível III'],
  },
  in4: {
    id: 'in4', branch: 'industria', tier: 4, name: 'Complexos Siderúrgicos', icon: 'Blocks',
    description: 'Cadeias integradas de aço e polímeros reduzem perdas e ampliam a oferta.',
    cost: { conhecimento: 70, creditos: 310 }, requires: ['in3'],
    effects: { production: { materias: 0.14, bens: 0.1 }, industryEnergyMult: 0.78 },
    benefits: ['+14% matérias-primas', '+10% bens', '−22% energia industrial'],
  },
  lg1: {
    id: 'lg1', branch: 'logistica', tier: 1, name: 'Estradas Troncais', icon: 'Route',
    description: 'Uma rede viária contínua encurta distâncias entre os territórios.',
    cost: { conhecimento: 13, creditos: 60 }, requires: [],
    effects: { globalProduction: 0.08 },
    benefits: ['+8% produção em todos os territórios'],
  },
  lg2: {
    id: 'lg2', branch: 'logistica', tier: 2, name: 'Ferrovias Continentais', icon: 'TrainFront',
    description: 'Trens de carga ligam a capital às fronteiras e reduzem o custo de integração.',
    cost: { conhecimento: 25, creditos: 110 }, requires: ['lg1'],
    effects: { expansionCostMult: -0.25, maxProjects: 1 },
    unlocks: [{ building: 'logistica', level: 3 }],
    benefits: ['−25% custo de expansão', '+1 projeto simultâneo', 'Logística nível III'],
  },
  lg3: {
    id: 'lg3', branch: 'logistica', tier: 3, name: 'Portos Livres', icon: 'Anchor',
    description: 'Entrepostos francos atraem mercadores de todo o mundo.',
    cost: { conhecimento: 40, creditos: 175 }, requires: ['lg2'],
    effects: { tradeMult: 0.1, sellMult: 0.06 },
    benefits: ['+10% receita comercial', '+6% preço de venda'],
  },
  lg4: {
    id: 'lg4', branch: 'logistica', tier: 4, name: 'Malha Integrada', icon: 'Network',
    description: 'Uma malha única de transporte e dados torna todo o território mais produtivo.',
    cost: { conhecimento: 66, creditos: 275 }, requires: ['lg3'],
    effects: { globalProduction: 0.1, slotsBonus: 1 },
    benefits: ['+10% produção global', '+1 espaço construível por território'],
  },
  es1: {
    id: 'es1', branch: 'estado', tier: 1, name: 'Administração Civil', icon: 'Scale',
    description: 'Servidores treinados e registros unificados dão alcance ao Estado.',
    cost: { conhecimento: 15, creditos: 70 }, requires: [],
    effects: { unrestReduction: 0.2, adminCapacity: 1 },
    unlocks: [{ building: 'administrativo', level: 3 }],
    benefits: ['−20% desordem', '+1 capacidade administrativa', 'Administração nível III'],
  },
  es2: {
    id: 'es2', branch: 'estado', tier: 2, name: 'Diplomacia de Salão', icon: 'Handshake',
    description: 'Uma corte habilidosa transforma concessões pequenas em acordos duradouros.',
    cost: { conhecimento: 30, creditos: 130 }, requires: ['es1'],
    effects: { relationGainMult: 0.5, expansionInfluenceMult: -0.2 },
    benefits: ['+50% ganho de relações', '−20% influência em expansões'],
  },
  es3: {
    id: 'es3', branch: 'estado', tier: 3, name: 'Doutrina de Defesa', icon: 'Shield',
    description: 'Comando unificado e reservistas preparados protegem as fronteiras.',
    cost: { conhecimento: 48, creditos: 215 }, requires: ['es2'],
    effects: { defenseMult: 0.25, militaryMult: 0.2 },
    unlocks: [{ building: 'defesa', level: 3 }],
    benefits: ['+25% defesa territorial', '+20% poder militar', 'Defesa nível III'],
  },
  es4: {
    id: 'es4', branch: 'estado', tier: 4, name: 'Grande Conselho', icon: 'Crown',
    description: 'As Casas reconhecem sua legitimidade. O Estado vira instituição continental.',
    cost: { conhecimento: 72, creditos: 320 }, requires: ['es3'],
    effects: { influencePerCycle: 1, adminCapacity: 1 },
    unlocks: [{ building: 'pesquisa', level: 3 }],
    benefits: ['+1 influência/ciclo', '+1 capacidade administrativa', 'Pesquisa nível III'],
  },
};

export const TECH_ORDER: TechId[] = [
  'ec1', 'ec2', 'ec3', 'ec4',
  'in1', 'in2', 'in3', 'in4',
  'lg1', 'lg2', 'lg3', 'lg4',
  'es1', 'es2', 'es3', 'es4',
];

// ── Factions ────────────────────────────────────────────────────────────────

export interface FactionDef {
  id: FactionId;
  name: string;
  short: string;
  epithet: string;
  leader: string;
  motto: string;
  description: string;
  color: string;
  colorSoft: string;
  personality: Personality;
  capitalName: string;
  aggression: number;
  expansionBias: number;
  industryBias: number;
  techBias: number;
  tradeBias: number;
  diplomacyBias: number;
  relationBaseline: number;
  emblem: string;
}

export const FACTIONS: Record<FactionId, FactionDef> = {
  concordia: {
    id: 'concordia', name: 'Casa Concórdia', short: 'Concórdia', epithet: 'A Casa do Equilíbrio',
    leader: 'Conselho de Lisboa', motto: 'Nada se conquista sem sustentar.',
    description: 'Uma casa de mercadores e engenheiros nascida no estuário do Tejo. Troca a força bruta por infraestrutura, crédito e acordos que sobrevivem a governos.',
    color: '#3fd6c2', colorSoft: '#14685f', personality: 'mercantil', capitalName: 'Lisboa',
    aggression: 0.3, expansionBias: 0.7, industryBias: 0.7, techBias: 0.75, tradeBias: 0.9,
    diplomacyBias: 0.8, relationBaseline: 0, emblem: 'compass',
  },
  aurelia: {
    id: 'aurelia', name: 'Liga Aureliana', short: 'Aurelia', epithet: 'A Casa do Ouro',
    leader: 'Chanceler Otávia Rhen', motto: 'Todo acordo tem seu preço justo.',
    description: 'Bancos, arquivos e institutos de cálculo de Roma. Compra influência com crédito e transforma informação em vantagem antes que as outras Casas percebam.',
    color: '#e4b566', colorSoft: '#6a5226', personality: 'tecnocrata', capitalName: 'Roma',
    aggression: 0.22, expansionBias: 0.55, industryBias: 0.55, techBias: 0.95, tradeBias: 0.95,
    diplomacyBias: 0.9, relationBaseline: 14, emblem: 'coin',
  },
  kestrel: {
    id: 'kestrel', name: 'Consórcio Kestrel', short: 'Kestrel', epithet: 'A Casa da Forja',
    leader: 'Diretor Soren Vask', motto: 'O futuro é fundido, não herdado.',
    description: 'Um consórcio de fundições e engenheiros sediado em Londres. Mede poder em toneladas de aço e aceita qualquer acordo que mantenha suas forjas acesas.',
    color: '#a78cf8', colorSoft: '#4b3b82', personality: 'industrial', capitalName: 'Londres',
    aggression: 0.4, expansionBias: 0.72, industryBias: 0.95, techBias: 0.85, tradeBias: 0.55,
    diplomacyBias: 0.55, relationBaseline: 2, emblem: 'anvil',
  },
  vantor: {
    id: 'vantor', name: 'Domínio Vantor', short: 'Vantor', epithet: 'A Casa do Punho',
    leader: 'Generalíssima Iska Vantor', motto: 'A fronteira é onde a força termina.',
    description: 'Um domínio militar que nasceu controlando o Bósforo e ainda considera a diplomacia um intervalo entre campanhas.',
    color: '#e36d63', colorSoft: '#6b2e2b', personality: 'militar', capitalName: 'Ancara',
    aggression: 0.85, expansionBias: 0.82, industryBias: 0.6, techBias: 0.45, tradeBias: 0.35,
    diplomacyBias: 0.25, relationBaseline: -12, emblem: 'sword',
  },
};

export const AI_FACTIONS: FactionId[] = ['aurelia', 'kestrel', 'vantor'];

// ── Objectives & market ─────────────────────────────────────────────────────

export interface ObjectiveDef {
  id: string;
  title: string;
  description: string;
  target: number;
  unit: string;
  icon: string;
  hint: string;
}

export const OBJECTIVES: ObjectiveDef[] = [
  {
    id: 'capital', title: 'Coração de Concórdia', target: 60, unit: 'dev.',
    description: 'Leve o desenvolvimento da capital a 60.',
    icon: 'Landmark',
    hint: 'Construa e melhore estruturas na capital. Logística e administração valorizam o território.',
  },
  {
    id: 'territorios', title: 'Presença global', target: 8, unit: 'países',
    description: 'Administre ao menos 8 países.',
    icon: 'Map',
    hint: 'Reivindique países neutros que fazem fronteira com os seus. Cada expansão exige créditos e influência.',
  },
  {
    id: 'industria', title: 'A forja global', target: 30, unit: 'bens/ciclo',
    description: 'Produza 30 bens industriais em um único ciclo.',
    icon: 'Factory',
    hint: 'Complexos industriais convertem matérias-primas e energia em bens. Cuide das cadeias de suprimento.',
  },
  {
    id: 'tecnologia', title: 'Vanguarda científica', target: 7, unit: 'tecnologias',
    description: 'Pesquise 7 tecnologias.',
    icon: 'FlaskConical',
    hint: 'Centros de pesquisa geram conhecimento. Cada ramo abre caminhos diferentes.',
  },
  {
    id: 'influencia', title: 'Voz no Conselho', target: 100, unit: 'influência',
    description: 'Acumule 100 de influência política.',
    icon: 'Crown',
    hint: 'Centros administrativos e a capital geram influência. Expandir-se consome parte dela.',
  },
  {
    id: 'acordos', title: 'Conselho das Casas', target: 2, unit: 'potências',
    description: 'Tenha um acordo ativo com 2 potências.',
    icon: 'Handshake',
    hint: 'Presentes e acordos comerciais elevam relações. Pactos de não-agressão contam para o objetivo.',
  },
];

export const MARKET_BASE: Record<MarketKey, number> = {
  alimentos: 1.4, energia: 2.6, materias: 2.4, bens: 5.8,
};

export const MARKET_LABELS: Record<MarketKey, string> = {
  alimentos: 'Alimentos', energia: 'Energia', materias: 'Matérias-primas', bens: 'Bens industriais',
};

export const STARTING_STOCKS: Stocks = {
  creditos: 320,
  alimentos: 80,
  energia: 50,
  materias: 70,
  bens: 24,
  influencia: 30,
  conhecimento: 10,
};

export const STARTING_MILITARY = 45;

export const RANKS = [
  { min: 0, name: 'Casa Emergente', note: 'Ainda uma voz entre muitas.' },
  { min: 120, name: 'Potência Regional', note: 'O mundo começa a ouvir você.' },
  { min: 220, name: 'Potência Continental', note: 'Seu nome pesa nas negociações.' },
  { min: 330, name: 'Hegemon', note: 'A ordem do mundo se escreve em sua capital.' },
];
