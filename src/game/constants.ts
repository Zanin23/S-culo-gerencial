import type {
  BuildingKey,
  FactionId,
  Flow,
  MarketKey,
  Personality,
  ResourceKey,
  ResourceNode,
  SectorKey,
  Stocks,
  TechBranch,
  TechId,
  TerrainKey,
} from './types';

// ── Identity ────────────────────────────────────────────────────────────────

export const GAME = {
  id: 'management-century',
  name: 'MANAGEMENT CENTURY',
  subtitle: 'Companhias, mercado e relevância',
  world: 'Terra · Mercado global',
  tagline: 'Todo mercado é uma decisão.',
  version: 4,
  saveVersion: 4,
  baseProjectSlots: 2,
  baseAdminCapacity: 4,
  maxBuildingLevel: 3,
  maxOperationLevel: 3,
  victoryTitle: 'Liderança de Mercado',
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
    key: 'creditos', label: 'Dinheiro', short: 'R$', icon: 'Coins', color: '#e4bd72',
    description: 'Caixa da companhia. Paga unidades, obras, P&D e licenças de mercado.',
  },
  alimentos: {
    key: 'alimentos', label: 'Alimentos', short: 'Al', icon: 'Wheat', color: '#82c97c',
    description: 'Abastece as cidades. Escassez pressiona custos, desordem e produtividade.',
  },
  energia: {
    key: 'energia', label: 'Energia', short: 'En', icon: 'Zap', color: '#6cc8e8',
    description: 'Move fábricas e centros de P&D. O déficit derruba a produção.',
  },
  materias: {
    key: 'materias', label: 'Matérias-primas', short: 'Mp', icon: 'Pickaxe', color: '#c7a17b',
    description: 'Insumo de construção e da indústria. Commodity negociada no mercado.',
  },
  bens: {
    key: 'bens', label: 'Bens industriais', short: 'Bi', icon: 'Package', color: '#c6a5ea',
    description: 'Produzidos pelos complexos industriais e vendidos pela rede de varejo.',
  },
  influencia: {
    key: 'influencia', label: 'Relações', short: 'Re', icon: 'Handshake', color: '#6fd9c7',
    description: 'Peso institucional: abre licenças, acordos e novos mercados.',
  },
  conhecimento: {
    key: 'conhecimento', label: 'P&D', short: 'P&D', icon: 'FlaskConical', color: '#93b7f4',
    description: 'Produzido pelos centros de pesquisa. Desbloqueia tecnologia aplicada.',
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
  nenhum: { key: 'nenhum', name: 'Sem vocação especial', description: 'Praça sem vantagem natural destacada.', bonus: {}, color: '#7c8797', symbol: '' },
  fertil: { key: 'fertil', name: 'Solo fértil', description: 'Terreno agrícola: favorece fazendas e agroindústrias.', bonus: { alimentos: 2.4 }, color: '#82c97c', symbol: 'leaf' },
  minerio: { key: 'minerio', name: 'Jazida mineral', description: 'Minério abundante: abastece indústrias e fábricas.', bonus: { materias: 2.8 }, color: '#c7a17b', symbol: 'diamond' },
  energia: { key: 'energia', name: 'Vale industrial', description: 'Infraestrutura pronta para plantas e linhas de montagem.', bonus: { energia: 2.8 }, color: '#6cc8e8', symbol: 'bolt' },
  madeira: { key: 'madeira', name: 'Floresta manejada', description: 'Madeira e celulose para insumos e construção.', bonus: { materias: 1.6, creditos: 1 }, color: '#91a878', symbol: 'tree' },
  pesca: { key: 'pesca', name: 'Costa pesqueira', description: 'Porto natural e vocação para exportação e cabotagem.', bonus: { alimentos: 2 }, color: '#74b7c7', symbol: 'wave' },
  raro: { key: 'raro', name: 'Depósito raro', description: 'Minerais raros de alto valor de mercado.', bonus: { creditos: 5, influencia: 0.8 }, color: '#d9a7f0', symbol: 'star' },
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
  terrainBonus?: { terrains?: TerrainKey[]; nodes?: ResourceNode[]; label: string; multiplier: number };
  techUnlock?: Partial<Record<number, TechId>>;
  effect: string;
}

const b = (
  credits: number, materias: number, energia: number, bens: number, cycles: number,
): BuildingLevel => ({ cost: { creditos: credits, materias, energia, bens }, cycles });

export const BUILDINGS: Record<BuildingKey, BuildingDef> = {
  fazenda: {
    key: 'fazenda', name: 'Agroindústria', short: 'Agro', icon: 'Wheat',
    category: 'Agro', accent: '#82c97c',
    description: 'Unidades agrícolas que abastecem as cidades e sustentam a operação.',
    levels: [b(45, 6, 1, 0, 2), b(85, 16, 4, 0, 3), b(150, 30, 9, 0, 4)],
    production: { alimentos: 8 }, consumption: {}, upkeep: { creditos: 0.5 }, jobs: 7,
    terrainBonus: { nodes: ['fertil'], terrains: ['planicie'], label: 'produção agrícola', multiplier: 0.5 },
    techUnlock: { 3: 'ec2' }, effect: '≈ R$ 7/ciclo por nível (produção agrícola).',
  },
  extratora: {
    key: 'extratora', name: 'Unidades de Extração', short: 'Extração', icon: 'Pickaxe',
    category: 'Insumos', accent: '#c7a17b',
    description: 'Minas e serrarias mecanizadas que transformam o subsolo em insumo produtivo.',
    levels: [b(50, 10, 2, 0, 2), b(95, 22, 5, 0, 3), b(165, 40, 10, 0, 4)],
    production: { materias: 7 }, consumption: {}, upkeep: { creditos: 0.8 }, jobs: 8,
    terrainBonus: { nodes: ['minerio'], terrains: ['montanha', 'colina'], label: 'insumos', multiplier: 0.4 },
    techUnlock: { 3: 'in1' }, effect: '≈ R$ 12/ciclo por nível (extração).',
  },
  usina: {
    key: 'usina', name: 'Centro de Distribuição', short: 'Distribuição', icon: 'Truck',
    category: 'Distribuição', accent: '#b7b3a1',
    description: 'Armazém, frota e pátio próprios: colocam a produção da praça no mercado.',
    levels: [b(60, 15, 0, 0, 2), b(110, 28, 0, 0, 3), b(190, 48, 0, 0, 4)],
    production: { creditos: 9 }, consumption: {}, upkeep: { creditos: 1.1 }, jobs: 6,
    terrainBonus: { terrains: ['costa'], label: 'receita local', multiplier: 0.3 },
    techUnlock: { 3: 'in2' }, effect: '≈ R$ 9/ciclo por nível; bônus na costa.',
  },
  industria: {
    key: 'industria', name: 'Complexo Industrial', short: 'Indústria', icon: 'Factory',
    category: 'Indústria', accent: '#c6a5ea',
    description: 'Linhas de montagem que convertem insumos comprados no mercado em produtos de alto valor.',
    levels: [b(105, 30, 10, 0, 3), b(190, 55, 20, 0, 4), b(320, 95, 35, 0, 5)],
    production: { bens: 7 }, consumption: { materias: 5 }, upkeep: { creditos: 2.5 }, jobs: 11,
    terrainBonus: { terrains: ['colina', 'planicie'], label: 'produção industrial', multiplier: 0.12 },
    techUnlock: { 3: 'in3' }, effect: '≈ R$ 24/ciclo por nível; insumos comprados no mercado.',
  },
  entreposto: {
    key: 'entreposto', name: 'Rede de Varejo', short: 'Varejo', icon: 'Store',
    category: 'Comércio', accent: '#e4bd72',
    description: 'Lojas e centros de distribuição que vendem bens e geram caixa conforme o mercado.',
    levels: [b(70, 16, 4, 0, 2), b(130, 30, 8, 0, 3), b(220, 52, 14, 0, 4)],
    production: { creditos: 12 }, consumption: { bens: 1.5 }, upkeep: { creditos: 1.4 }, jobs: 6,
    terrainBonus: { terrains: ['costa'], label: 'receita local', multiplier: 0.3 },
    techUnlock: { 3: 'ec1' }, effect: '≈ R$ 12/ciclo por nível (varia com o mercado).',
  },
  administrativo: {
    key: 'administrativo', name: 'Escritório Central', short: 'Administração', icon: 'Landmark',
    category: 'Administração', accent: '#9fc2b4',
    description: 'Estrutura de gestão: amplia a capacidade administrativa e reduz a desordem local.',
    levels: [b(75, 14, 3, 0, 3), b(140, 28, 8, 0, 3), b(240, 50, 14, 0, 4)],
    production: { influencia: 2.5, creditos: 2 }, consumption: {}, upkeep: { creditos: 2 }, jobs: 5,
    techUnlock: { 3: 'es1' }, effect: '≈ R$ 15/ciclo e +0,5 capacidade administrativa por nível.',
  },
  pesquisa: {
    key: 'pesquisa', name: 'Centro de P&D', short: 'P&D', icon: 'FlaskConical',
    category: 'Pesquisa', accent: '#93b7f4',
    description: 'Laboratórios aplicados que transformam pesquisa em novas tecnologias.',
    levels: [b(90, 22, 8, 0, 3), b(165, 42, 16, 0, 4), b(280, 75, 28, 0, 5)],
    production: { conhecimento: 3.5 }, consumption: {}, upkeep: { creditos: 2.8 }, jobs: 8,
    terrainBonus: { terrains: ['planicie'], label: 'pesquisa', multiplier: 0.1 },
    techUnlock: { 3: 'es4' }, effect: '≈ R$ 28/ciclo por nível em P&D.',
  },
  defesa: {
    key: 'defesa', name: 'Segurança Patrimonial', short: 'Segurança', icon: 'Shield',
    category: 'Segurança', accent: '#e39a80',
    description: 'Vigilância, seguro e controle de perdas: protege ativos e segura a desordem.',
    levels: [b(60, 26, 2, 0, 2), b(115, 48, 8, 0, 3), b(200, 85, 18, 0, 4)],
    production: {}, consumption: {}, upkeep: { creditos: 1.8 }, jobs: 3, defense: 18,
    techUnlock: { 3: 'es3' }, effect: '+18 de proteção e −0,8 de desordem/ciclo por nível.',
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
  operationsMult?: number;
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
  economia: { name: 'Mercados', icon: 'Coins', color: '#e4bd72', description: 'Preços, crédito e receita.' },
  industria: { name: 'Indústria', icon: 'Factory', color: '#c6a5ea', description: 'Extração, manufatura e escala.' },
  logistica: { name: 'Logística', icon: 'Route', color: '#8fbfa5', description: 'Rotas, capacidade e integração.' },
  estado: { name: 'Gestão', icon: 'Scale', color: '#8fb4f5', description: 'Administração, acordos e segurança.' },
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
    benefits: ['+20% receita agrícola', 'Fazendas nível III'],
  },
  ec3: {
    id: 'ec3', branch: 'economia', tier: 3, name: 'Crédito Corporativo', icon: 'Landmark',
    description: 'Linhas de crédito e câmbio estável reduzem o custo de crescer.',
    cost: { conhecimento: 44, creditos: 180 }, requires: ['ec2'],
    effects: { production: { creditos: 0.12 }, expansionCostMult: -0.12 },
    benefits: ['+12% de receita urbana', '−12% custo de expansão'],
  },
  ec4: {
    id: 'ec4', branch: 'economia', tier: 4, name: 'Comércio Global', icon: 'Ship',
    description: 'Rotas marítimas conectam sua rede aos mercados além do horizonte.',
    cost: { conhecimento: 68, creditos: 290 }, requires: ['ec3'],
    effects: { tradeMult: 0.18, operationsMult: 0.04 },
    benefits: ['+18% de receita comercial', '+4% receita de unidades'],
  },
  in1: {
    id: 'in1', branch: 'industria', tier: 1, name: 'Metalurgia Avançada', icon: 'Flame',
    description: 'Fornalhas de alta temperatura multiplicam o rendimento das jazidas.',
    cost: { conhecimento: 14, creditos: 65 }, requires: [],
    effects: { production: { materias: 0.15 } },
    unlocks: [{ building: 'extratora', level: 3 }],
    benefits: ['+15% receita de mineração', 'Extração nível III'],
  },
  in2: {
    id: 'in2', branch: 'industria', tier: 2, name: 'Redes Inteligentes', icon: 'Zap',
    description: 'Distribuição elétrica adaptativa reduz perdas e aumenta a oferta.',
    cost: { conhecimento: 28, creditos: 120 }, requires: ['in1'],
    effects: { production: { creditos: 0.06 } },
    unlocks: [{ building: 'usina', level: 3 }],
    benefits: ['+6% receita urbana', 'Centro de distribuição nível III'],
  },
  in3: {
    id: 'in3', branch: 'industria', tier: 3, name: 'Automação Pesada', icon: 'Bot',
    description: 'Braços mecânicos e controle de processos elevam a escala industrial.',
    cost: { conhecimento: 46, creditos: 205 }, requires: ['in2'],
    effects: { production: { bens: 0.22 } },
    unlocks: [{ building: 'industria', level: 3 }],
    benefits: ['+22% receita industrial', 'Indústria nível III'],
  },
  in4: {
    id: 'in4', branch: 'industria', tier: 4, name: 'Complexos Siderúrgicos', icon: 'Blocks',
    description: 'Cadeias integradas de aço e polímeros reduzem perdas e ampliam a oferta.',
    cost: { conhecimento: 70, creditos: 310 }, requires: ['in3'],
    effects: { production: { materias: 0.14, bens: 0.1 } },
    benefits: ['+14% receita de mineração', '+10% receita industrial'],
  },
  lg1: {
    id: 'lg1', branch: 'logistica', tier: 1, name: 'Estradas Troncais', icon: 'Route',
    description: 'Uma rede viária contínua encurta distâncias entre as praças.',
    cost: { conhecimento: 13, creditos: 60 }, requires: [],
    effects: { globalProduction: 0.08 },
    benefits: ['+8% de produção em todas as praças'],
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
    effects: { tradeMult: 0.1, operationsMult: 0.05 },
    benefits: ['+10% receita comercial', '+5% receita de unidades'],
  },
  lg4: {
    id: 'lg4', branch: 'logistica', tier: 4, name: 'Malha Integrada', icon: 'Network',
    description: 'Uma malha única de transporte e dados torna toda a praça mais produtiva.',
    cost: { conhecimento: 66, creditos: 275 }, requires: ['lg3'],
    effects: { globalProduction: 0.1, slotsBonus: 1 },
    benefits: ['+10% de produção global', '+1 espaço construível por praça'],
  },
  es1: {
    id: 'es1', branch: 'estado', tier: 1, name: 'Gestão Integrada', icon: 'Scale',
    description: 'Processos unificados e equipes treinadas dão alcance à companhia.',
    cost: { conhecimento: 15, creditos: 70 }, requires: [],
    effects: { unrestReduction: 0.2, adminCapacity: 1 },
    unlocks: [{ building: 'administrativo', level: 3 }],
    benefits: ['−20% desordem', '+1 capacidade administrativa', 'Administração nível III'],
  },
  es2: {
    id: 'es2', branch: 'estado', tier: 2, name: 'Relações Institucionais', icon: 'Handshake',
    description: 'Uma mesa de relações habilidosa transforma concessões pequenas em acordos duradouros.',
    cost: { conhecimento: 30, creditos: 130 }, requires: ['es1'],
    effects: { relationGainMult: 0.5, expansionCostMult: -0.1 },
    benefits: ['+50% ganho de relações', '−10% custo de expansão'],
  },
  es3: {
    id: 'es3', branch: 'estado', tier: 3, name: 'Gestão de Risco', icon: 'Shield',
    description: 'Auditoria, seguro e compliance reduzem perdas e protegem a receita.',
    cost: { conhecimento: 48, creditos: 215 }, requires: ['es2'],
    effects: { defenseMult: 0.25, unrestReduction: 0.12, operationsMult: 0.06 },
    unlocks: [{ building: 'defesa', level: 3 }],
    benefits: ['+25% proteção patrimonial', '−12% desordem', '+6% receita operacional', 'Segurança nível III'],
  },
  es4: {
    id: 'es4', branch: 'estado', tier: 4, name: 'Conselho de Administração', icon: 'Crown',
    description: 'O mercado reconhece sua governança. A companhia vira instituição global.',
    cost: { conhecimento: 72, creditos: 320 }, requires: ['es3'],
    effects: { operationsMult: 0.04, adminCapacity: 1 },
    unlocks: [{ building: 'pesquisa', level: 3 }],
    benefits: ['+4% receita de unidades', '+1 capacidade administrativa', 'P&D nível III'],
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
    id: 'concordia', name: 'Grupo Concórdia', short: 'Concórdia', epithet: 'Holding de infraestrutura',
    leader: 'Diretoria de Lisboa', motto: 'Crescer sem perder o lastro.',
    description: 'Holding de infraestrutura e serviços nascida no estuário do Tejo. Prefere contratos longos, logística e crédito barato à competição predatória.',
    color: '#3fd6c2', colorSoft: '#14685f', personality: 'mercantil', capitalName: 'Lisboa',
    aggression: 0.3, expansionBias: 0.7, industryBias: 0.7, techBias: 0.75, tradeBias: 0.9,
    diplomacyBias: 0.8, relationBaseline: 0, emblem: 'compass',
  },
  aurelia: {
    id: 'aurelia', name: 'Aurélia Capital', short: 'Aurélia', epithet: 'Banco de investimento',
    leader: 'Comitê Executivo de Roma', motto: 'Todo acordo tem seu preço justo.',
    description: 'Banco de investimento e mesa de câmbio em Roma. Compra participações antes que o mercado perceba e transforma informação em margem.',
    color: '#e4b566', colorSoft: '#6a5226', personality: 'tecnocrata', capitalName: 'Roma',
    aggression: 0.22, expansionBias: 0.55, industryBias: 0.55, techBias: 0.95, tradeBias: 0.95,
    diplomacyBias: 0.9, relationBaseline: 14, emblem: 'coin',
  },
  kestrel: {
    id: 'kestrel', name: 'Kestrel Indústrias', short: 'Kestrel', epithet: 'Consórcio industrial',
    leader: 'Diretoria de Londres', motto: 'O futuro é fundido, não herdado.',
    description: 'Consórcio de fundições, máquinas e manufatura sediado em Londres. Mede força em toneladas de aço e capacidade instalada.',
    color: '#a78cf8', colorSoft: '#4b3b82', personality: 'industrial', capitalName: 'Londres',
    aggression: 0.4, expansionBias: 0.72, industryBias: 0.95, techBias: 0.85, tradeBias: 0.55,
    diplomacyBias: 0.55, relationBaseline: 2, emblem: 'anvil',
  },
  vantor: {
    id: 'vantor', name: 'Vantor Logística', short: 'Vantor', epithet: 'Operadora logística',
    leader: 'Diretoria de Ancara', motto: 'A rota é o ativo.',
    description: 'Operadora de portos, ferrovias e frotas nascida no Bósforo. Cresce fechando corredores e comprando concorrentes.',
    color: '#e36d63', colorSoft: '#6b2e2b', personality: 'expansionista', capitalName: 'Ancara',
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
    id: 'capital', title: 'Sede de referência', target: 60, unit: 'dev.',
    description: 'Leve o desenvolvimento da sede a 60.',
    icon: 'Landmark',
    hint: 'Construa e melhore estruturas na sede. Logística e administração valorizam a praça.',
  },
  {
    id: 'operacoes', title: 'Rede de unidades', target: 8, unit: 'unidades',
    description: 'Abra 8 unidades de negócio em cidades diferentes.',
    icon: 'Building2',
    hint: 'Compre fazendas, lojas, portos e fábricas nas cidades das praças licenciadas.',
  },
  {
    id: 'territorios', title: 'Presença internacional', target: 8, unit: 'praças',
    description: 'Tenha licença em ao menos 8 praças.',
    icon: 'Map',
    hint: 'Abra licença em países vizinhos. Cada praça exige dinheiro e estrutura na base.',
  },
  {
    id: 'receita', title: 'Receita consolidada', target: 260, unit: 'R$/ciclo',
    description: 'Alcance R$ 260 de receita em um ciclo.',
    icon: 'Coins',
    hint: 'Some unidades, infraestrutura e acordos. Cidades grandes e participação alta rendem mais.',
  },
  {
    id: 'tecnologia', title: 'Vantagem tecnológica', target: 7, unit: 'tecnologias',
    description: 'Pesquise 7 tecnologias.',
    icon: 'FlaskConical',
    hint: 'Centros de P&D geram receita e reduzem o custo de pesquisa. Cada ramo abre caminhos diferentes.',
  },
  {
    id: 'relevancia', title: 'Marca reconhecida', target: 220, unit: 'relevância',
    description: 'Alcance 220 de relevância.',
    icon: 'Award',
    hint: 'Relevância soma praças, unidades, participação, receita, P&D e acordos.',
  },
  {
    id: 'acordos', title: 'Rede de parcerias', target: 2, unit: 'companhias',
    description: 'Tenha um acordo ativo com 2 companhias.',
    icon: 'Handshake',
    hint: 'Presentes e acordos comerciais elevam relações. Tréguas de concorrência contam para o objetivo.',
  },
];

/** Valor de referência de cada insumo dentro do caixa da companhia. */
export const RESOURCE_VALUE: Record<ResourceKey, number> = {
  creditos: 1,
  alimentos: 0.9,
  energia: 1.25,
  materias: 1.7,
  bens: 3.4,
  influencia: 5,
  conhecimento: 8,
};

export const MARKET_BASE: Record<MarketKey, number> = {
  alimentos: 1.4, energia: 2.6, materias: 2.4, bens: 5.8,
};

export const MARKET_LABELS: Record<MarketKey, string> = {
  alimentos: 'Alimentos', energia: 'Energia', materias: 'Matérias-primas', bens: 'Bens industriais',
};

export const STARTING_STOCKS: Stocks = {
  creditos: 380,
  alimentos: 0,
  energia: 0,
  materias: 0,
  bens: 0,
  influencia: 0,
  conhecimento: 0,
};

export const RANKS = [
  { min: 0, name: 'Companhia Emergente', note: 'Ainda uma voz entre muitas.' },
  { min: 120, name: 'Grupo Regional', note: 'Seu nome começa a pesar nas negociações.' },
  { min: 220, name: 'Grupo Continental', note: 'Presença consolidada em vários mercados.' },
  { min: 330, name: 'Líder Global', note: 'A companhia dita o ritmo do mercado.' },
];


// ── Unidades de negócio ─────────────────────────────────────────────────────

export interface SectorDef {
  key: SectorKey;
  name: string;
  short: string;
  icon: string;
  color: string;
  description: string;
  /** Multiplicador de receita sobre o mercado local. */
  revenue: number;
  /** Fração do mercado paga em insumos por unidade (indústria e fábrica). */
  supplyCost?: number;
  /** Receita extra por unidade já aberta no país (finanças). */
  networkBonus?: number;
  /** Bônus de receita para as demais unidades no mesmo país (porto). */
  portBonus?: number;
  /** Custo de abertura da primeira unidade, em dinheiro. */
  cost: number;
  /** Relevância mínima da companhia para abrir. */
  relevance: number;
}

export const SECTORS: Record<SectorKey, SectorDef> = {
  fazenda: {
    key: 'fazenda', name: 'Fazenda', short: 'Fazenda', icon: 'Wheat', color: '#82c97c',
    description: 'Produção agrícola e pecuária. Entrada barata, caixa previsível e pouca relevância.',
    revenue: 0.85, cost: 60, relevance: 0,
  },
  varejo: {
    key: 'varejo', name: 'Rede de varejo', short: 'Varejo', icon: 'Store', color: '#e4bd72',
    description: 'Lojas de rua e franquias. Receita rápida, escala junto com a população da cidade.',
    revenue: 1, cost: 80, relevance: 8,
  },
  porto: {
    key: 'porto', name: 'Porto', short: 'Porto', icon: 'Ship', color: '#74b7c7',
    description: 'Terminal marítimo. Além da receita própria, melhora o escoamento das outras unidades no país.',
    revenue: 1.15, portBonus: 0.05, cost: 120, relevance: 18,
  },
  industria: {
    key: 'industria', name: 'Indústria', short: 'Indústria', icon: 'Factory', color: '#c6a5ea',
    description: 'Planta de manufatura. Compra insumos e vende produtos de maior valor.',
    revenue: 1.4, supplyCost: 0.16, cost: 150, relevance: 32,
  },
  fabrica: {
    key: 'fabrica', name: 'Fábrica de automóveis', short: 'Automóveis', icon: 'Car', color: '#e39a80',
    description: 'Linha de montagem de veículos. Alto investimento, margem alta e vitrine de marca.',
    revenue: 1.95, supplyCost: 0.3, cost: 240, relevance: 60,
  },
  financas: {
    key: 'financas', name: 'Finanças', short: 'Finanças', icon: 'Landmark', color: '#93b7f4',
    description: 'Crédito, câmbio e seguros. Cresce com o tamanho da rede de unidades.',
    revenue: 0.95, networkBonus: 0.06, cost: 170, relevance: 45,
  },
};

export const SECTOR_ORDER: SectorKey[] = ['fazenda', 'varejo', 'porto', 'industria', 'fabrica', 'financas'];
