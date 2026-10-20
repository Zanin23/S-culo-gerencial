import { MARKET_LABELS } from './constants';
import { getRelation, relationKey } from './diplomacy';
import { logEntry } from './state';
import type {
  CommandResult,
  FactionId,
  Flow,
  GameState,
  MarketKey,
  ResourceKey,
  Stocks,
} from './types';
import { clamp, nextRandom, round1 } from './rng';

export interface EventEffect {
  stockDelta?: Partial<Stocks>;
  allStockDelta?: Partial<Stocks>;
  cost?: Partial<Stocks>;
  unrest?: number;
  relations?: number;
  market?: Partial<Record<MarketKey, number>>;
  military?: number;
  modifier?: {
    label: string;
    description: string;
    cycles: number;
    production?: Partial<Flow>;
    researchDiscount?: number;
    tradeBonus?: number;
    unrestPerCycle?: number;
  };
  log: string;
}

export interface EventChoice {
  id: string;
  label: string;
  description: string;
  tone?: 'good' | 'neutral' | 'bad';
  effect: EventEffect;
}

export interface GameEvent {
  id: string;
  title: string;
  category: 'Mercado' | 'Clima' | 'Política' | 'Oportunidade' | 'Crise' | 'Ciência';
  icon: string;
  description: string;
  minCycle: number;
  weight: number;
  choices: EventChoice[];
}

export const EVENTS: GameEvent[] = [
  {
    id: 'colheita',
    title: 'Colheita Excepcional',
    category: 'Clima',
    icon: 'Wheat',
    description: 'As chuvas chegaram na medida exata e os celeiros do planeta transbordam. Uma rara janela de abundância se abre.',
    minCycle: 4,
    weight: 10,
    choices: [
      {
        id: 'estoque',
        label: 'Estocar o excedente',
        description: 'Guarde parte da colheita nos celeiros nacionais: +18 alimentos.',
        tone: 'good',
        effect: {
          stockDelta: { alimentos: 18 },
          log: 'Os celeiros de Concórdia receberam 18 unidades extras da colheita.',
        },
      },
      {
        id: 'vender',
        label: 'Vender no mercado',
        description: 'Liquidez imediata, mas o preço dos alimentos cede: +75 créditos e −8% no preço.',
        tone: 'neutral',
        effect: {
          stockDelta: { creditos: 75 },
          market: { alimentos: 0.92 },
          log: 'Concórdia vendeu o excedente agrícola e pressionou os preços para baixo.',
        },
      },
      {
        id: 'distribuir',
        label: 'Distribuir à população',
        description: 'Alimento nas mesas, legitimidade nas ruas: −8 de desordem em seus territórios e +6 influência.',
        tone: 'good',
        effect: {
          unrest: -8,
          stockDelta: { influencia: 6 },
          log: 'A distribuição pública do excedente acalmou as ruas e rendeu capital político.',
        },
      },
    ],
  },
  {
    id: 'seca',
    title: 'Seca no mundo',
    category: 'Clima',
    icon: 'Sun',
    description: 'Três meses sem chuva. Os rios baixaram e os produtores rurais de todas as Casas alertam para perdas severas.',
    minCycle: 8,
    weight: 9,
    choices: [
      {
        id: 'importar',
        label: 'Importar suprimentos',
        description: 'Pague 90 créditos para compensar a quebra: +20 alimentos.',
        tone: 'neutral',
        effect: {
          cost: { creditos: 90 },
          stockDelta: { alimentos: 20 },
          log: 'Concórdia importou alimentos para atravessar a seca.',
        },
      },
      {
        id: 'pocos',
        label: 'Abrir poços artesianos',
        description: 'Investimento de 60 créditos e 20 matérias-primas: +20% de produção de alimentos por 3 ciclos.',
        tone: 'good',
        effect: {
          cost: { creditos: 60, materias: 20 },
          modifier: {
            label: 'Poços artesianos',
            description: 'A irrigação emergencial sustenta a produção agrícola.',
            cycles: 3,
            production: { alimentos: 0.2 },
          },
          log: 'Obras de irrigação emergencial foram concluídas em Concórdia.',
        },
      },
      {
        id: 'racionar',
        label: 'Racionar e esperar',
        description: 'Sem custos imediatos, mas a população sente: +7 de desordem e −5 alimentos.',
        tone: 'bad',
        effect: {
          stockDelta: { alimentos: -5 },
          unrest: 7,
          log: 'O racionamento oficial gerou filas e descontentamento em Concórdia.',
        },
      },
    ],
  },
  {
    id: 'demanda',
    title: 'Auge da Demanda Industrial',
    category: 'Mercado',
    icon: 'Factory',
    description: 'Os mercados do leste pagam qualquer preço por bens industriais. A demanda supera a oferta em todo o mundo.',
    minCycle: 10,
    weight: 9,
    choices: [
      {
        id: 'acelerar',
        label: 'Acelerar as linhas',
        description: 'Use 20 de energia estocada para produzir um lote extra: +12 bens.',
        tone: 'neutral',
        effect: {
          cost: { energia: 20 },
          stockDelta: { bens: 12 },
          log: 'Turnos extras nas fábricas de Concórdia produziram um lote emergencial de bens.',
        },
      },
      {
        id: 'exportar',
        label: 'Priorizar exportações',
        description: 'Venda parte do estoque à vista: −6 bens, +60 créditos. O preço dos bens sobe mais.',
        tone: 'neutral',
        effect: {
          stockDelta: { bens: -6, creditos: 60 },
          market: { bens: 1.12 },
          log: 'Concórdia embarcou bens para o leste e elevou o preço de mercado.',
        },
      },
      {
        id: 'domestico',
        label: 'Abastecer o mercado interno',
        description: 'Priorize a população: +6 influência e −5 de desordem.',
        tone: 'good',
        effect: {
          stockDelta: { influencia: 6 },
          unrest: -5,
          log: 'O abastecimento interno rendeu popularidade ao Conselho.',
        },
      },
    ],
  },
  {
    id: 'jazida',
    title: 'Jazida sob a Areia',
    category: 'Oportunidade',
    icon: 'Gem',
    description: 'Prospectores encontraram veios metálicos sob uma duna disputada. O achado pode financiar anos de obras.',
    minCycle: 6,
    weight: 8,
    choices: [
      {
        id: 'explorar',
        label: 'Explorar imediatamente',
        description: 'Exploração intensiva: +35 matérias-primas, mas +6 de desordem nas áreas próximas.',
        tone: 'neutral',
        effect: {
          stockDelta: { materias: 35 },
          unrest: 6,
          log: 'A mineração emergencial extraiu 35 matérias-primas, com custo social local.',
        },
      },
      {
        id: 'estudar',
        label: 'Financiar estudos geológicos',
        description: 'Ceda a jazida à pesquisa: +10 conhecimento e −20 matérias-primas.',
        tone: 'good',
        effect: {
          cost: { materias: 20 },
          stockDelta: { conhecimento: 10 },
          log: 'Os estudos geológicos de Concórdia mapearam novos filões.',
        },
      },
      {
        id: 'locais',
        label: 'Conceder às comunidades locais',
        description: 'Renuncie ao controle direto: +8 influência e +4 relações com todas as Casas.',
        tone: 'good',
        effect: {
          stockDelta: { influencia: 8 },
          relations: 4,
          log: 'A concessão comunitária da jazida melhorou a imagem de Concórdia.',
        },
      },
    ],
  },
  {
    id: 'greve',
    title: 'Greve nas Fundições',
    category: 'Crise',
    icon: 'Hammer',
    description: 'Os operários das fundições cruzaram os braços. A produção industrial de todo o mundo cai enquanto o impasse durar.',
    minCycle: 12,
    weight: 8,
    choices: [
      {
        id: 'negociar',
        label: 'Negociar aumentos',
        description: 'Pague 80 créditos e garanta +20% de produção de bens por 3 ciclos, compensando a paralisação.',
        tone: 'good',
        effect: {
          cost: { creditos: 80 },
          modifier: {
            label: 'Acordo das fundições',
            description: 'Salários melhores restauraram a produtividade.',
            cycles: 3,
            production: { bens: 0.2 },
          },
          log: 'Concórdia fechou um acordo salarial com as fundições.',
        },
      },
      {
        id: 'guarda',
        label: 'Mobilizar a guarda',
        description: 'Imponha a volta ao trabalho: −8 de poder militar, −10 de desordem, +3 influência.',
        tone: 'bad',
        effect: {
          military: -8,
          unrest: -10,
          stockDelta: { influencia: 3 },
          log: 'A guarda reabriu as fundições à força; o custo foi militar e político.',
        },
      },
      {
        id: 'esperar',
        label: 'Deixar o impasse se resolver',
        description: 'Sem custos e sem riscos imediatos. A indústria global segue paralisada.',
        tone: 'neutral',
        effect: {
          log: 'Concórdia aguardou o fim da greve sem intervir.',
        },
      },
    ],
  },
  {
    id: 'refugiados',
    title: 'Comboio de Refugiados',
    category: 'Política',
    icon: 'Users',
    description: 'Famílias deslocadas por uma disputa regional chegam às portas das cidades pedindo abrigo.',
    minCycle: 8,
    weight: 7,
    choices: [
      {
        id: 'acolher',
        label: 'Acolher os refugiados',
        description: '+2,5 de população em cada território, +5 de desordem e +4 influência.',
        tone: 'good',
        effect: {
          stockDelta: { influencia: 4 },
          unrest: 5,
          log: 'Concórdia abriu as fronteiras a um comboio de refugiados.',
        },
      },
      {
        id: 'ajuda',
        label: 'Enviar ajuda humanitária',
        description: 'Gaste 60 créditos sem abrir as fronteiras: +6 relações com todas as Casas e +3 influência.',
        tone: 'good',
        effect: {
          cost: { creditos: 60 },
          stockDelta: { influencia: 3 },
          relations: 6,
          log: 'A ajuda humanitária de Concórdia foi reconhecida pelas outras Casas.',
        },
      },
      {
        id: 'fechar',
        label: 'Fechar as fronteiras',
        description: 'Mantenha o controle: −4 de desordem, mas −6 relações com todas as Casas.',
        tone: 'bad',
        effect: {
          unrest: -4,
          relations: -6,
          log: 'Concórdia fechou as fronteiras ao comboio, irritando as demais Casas.',
        },
      },
    ],
  },
  {
    id: 'inovacao',
    title: 'Feira de Inovação Global',
    category: 'Ciência',
    icon: 'Lightbulb',
    description: 'Engenheiros, arquivistas e inventores reúnem-se no Coração do Mundo. O conhecimento circula como moeda.',
    minCycle: 10,
    weight: 7,
    choices: [
      {
        id: 'instituto',
        label: 'Financiar o instituto',
        description: 'Pague 70 créditos: −25% no custo de pesquisa por 4 ciclos e +5 conhecimento imediato.',
        tone: 'good',
        effect: {
          cost: { creditos: 70 },
          stockDelta: { conhecimento: 5 },
          modifier: {
            label: 'Instituto Global',
            description: 'Bolsas e laboratórios reduzem o custo das pesquisas.',
            cycles: 4,
            researchDiscount: 0.25,
          },
          log: 'Concórdia financiou o Instituto Global.',
        },
      },
      {
        id: 'artesaos',
        label: 'Patrocinar artesãos',
        description: 'Converta o evento em produtos: +8 bens industriais e +3 influência.',
        tone: 'neutral',
        effect: {
          stockDelta: { bens: 8, influencia: 3 },
          log: 'Os artesãos patentearam projetos em nome de Concórdia.',
        },
      },
      {
        id: 'observar',
        label: 'Enviar observadores',
        description: 'Ganhe apenas o essencial: +6 conhecimento.',
        tone: 'neutral',
        effect: {
          stockDelta: { conhecimento: 6 },
          log: 'Observadores de Concórdia registraram os avanços apresentados na feira.',
        },
      },
    ],
  },
  {
    id: 'corsarios',
    title: 'Corsários na Rota Sul',
    category: 'Crise',
    icon: 'Ship',
    description: 'Navios sem bandeira interceptaram carregamentos nas rotas do sul. Seguradoras elevam taxas e mercadores exigem escolta.',
    minCycle: 10,
    weight: 7,
    choices: [
      {
        id: 'resgate',
        label: 'Pagar o resgate',
        description: 'Recupere a carga por 60 créditos e evite perdas maiores.',
        tone: 'neutral',
        effect: {
          cost: { creditos: 60 },
          log: 'Concórdia pagou para liberar as cargas capturadas.',
        },
      },
      {
        id: 'patrulha',
        label: 'Reforçar as patrulhas',
        description: 'Gaste 20 matérias-primas e ganhe +6 de poder militar.',
        tone: 'good',
        effect: {
          cost: { materias: 20 },
          military: 6,
          log: 'Novas patrulhas foram equipadas com material de Concórdia.',
        },
      },
      {
        id: 'ignorar',
        label: 'Absorver as perdas',
        description: '−40 créditos, −8 alimentos e +5 de desordem.',
        tone: 'bad',
        effect: {
          stockDelta: { creditos: -40, alimentos: -8 },
          unrest: 5,
          log: 'Os corsários saquearam cargas de Concórdia sem resposta.',
        },
      },
    ],
  },
  {
    id: 'credito',
    title: 'Boom de Crédito',
    category: 'Mercado',
    icon: 'Coins',
    description: 'Bancos de Ourovil oferecem linhas de crédito generosas. O dinheiro é barato — e cobra juros depois.',
    minCycle: 14,
    weight: 6,
    choices: [
      {
        id: 'emprestimo',
        label: 'Contrair empréstimo',
        description: '+120 créditos agora, mas −15% de receita de créditos por 4 ciclos.',
        tone: 'neutral',
        effect: {
          stockDelta: { creditos: 120 },
          modifier: {
            label: 'Serviço da dívida',
            description: 'Os juros do empréstimo consomem parte da receita.',
            cycles: 4,
            production: { creditos: -0.15 },
          },
          log: 'Concórdia tomou 120 créditos emprestados em Ourovil.',
        },
      },
      {
        id: 'prudencia',
        label: 'Recusar e poupar',
        description: 'Sem dívida: +4 influência entre os banqueiros pela disciplina fiscal.',
        tone: 'good',
        effect: {
          stockDelta: { influencia: 4 },
          log: 'A recusa prudente de Concórdia foi notada pelos banqueiros de Ourovil.',
        },
      },
    ],
  },
  {
    id: 'conselho',
    title: 'Conselho das Casas',
    category: 'Política',
    icon: 'Landmark',
    description: 'As quatro Casas enviam enviados ao Coração do Mundo. A pauta é a segurança das rotas e o futuro da Partilha.',
    minCycle: 15,
    weight: 6,
    choices: [
      {
        id: 'sediar',
        label: 'Sediar o conselho',
        description: 'Pague 100 créditos: +12 influência e +10 relações com todas as Casas.',
        tone: 'good',
        effect: {
          cost: { creditos: 100 },
          stockDelta: { influencia: 12 },
          relations: 10,
          log: 'Concórdia sediou o Conselho das Casas e colheu prestígio.',
        },
      },
      {
        id: 'observadores',
        label: 'Enviar uma delegação discreta',
        description: '+6 conhecimento e +4 relações, sem custos.',
        tone: 'neutral',
        effect: {
          stockDelta: { conhecimento: 6 },
          relations: 4,
          log: 'A delegação de Concórdia trocou mapas e relatórios no conselho.',
        },
      },
      {
        id: 'ausentar',
        label: 'Não comparecer',
        description: 'Economize recursos, mas as Casas notam a ausência: −5 relações.',
        tone: 'bad',
        effect: {
          relations: -5,
          log: 'A ausência de Concórdia no Conselho das Casas foi mal recebida.',
        },
      },
    ],
  },
  {
    id: 'eclipse',
    title: 'O Eclipse',
    category: 'Ciência',
    icon: 'Moon',
    description: 'Uma sombra dupla cruza o mundo. Arquivistas preveem um fenômeno raro; a população vê um presságio.',
    minCycle: 9,
    weight: 5,
    choices: [
      {
        id: 'estudar',
        label: 'Estudar o fenômeno',
        description: '+10 conhecimento, mas +5 de desordem por boatos.',
        tone: 'neutral',
        effect: {
          stockDelta: { conhecimento: 10 },
          unrest: 5,
          log: 'A rede de observadores de Concórdia registrou o eclipse.',
        },
      },
      {
        id: 'acalmar',
        label: 'Acalmar a população',
        description: '−7 de desordem e +2 influência.',
        tone: 'good',
        effect: {
          unrest: -7,
          stockDelta: { influencia: 2 },
          log: 'Procissões e avisos oficiais acalmaram a população de Concórdia.',
        },
      },
    ],
  },
];

export function eventById(id: string | null): GameEvent | null {
  if (!id) return null;
  return EVENTS.find((event) => event.id === id) ?? null;
}

export function pickEvent(state: GameState): string | null {
  const eligible = EVENTS.filter(
    (event) =>
      state.cycle >= event.minCycle &&
      !state.pendingEventId &&
      !state.usedEvents.slice(-8).includes(event.id),
  );
  if (!eligible.length) return null;
  const total = eligible.reduce((sum, event) => sum + event.weight, 0);
  let roll = nextRandom(state) * total;
  for (const event of eligible) {
    roll -= event.weight;
    if (roll <= 0) return event.id;
  }
  return eligible[eligible.length - 1].id;
}

export function chooseEvent(state: GameState, factionId: FactionId, choiceId: string): CommandResult {
  const next = structuredClone(state);
  const event = eventById(next.pendingEventId);
  if (!event) {
    return { ok: false, state, message: 'Não há evento aguardando decisão.' };
  }
  const choice = event.choices.find((c) => c.id === choiceId);
  if (!choice) {
    return { ok: false, state, message: 'Escolha inválida para este evento.' };
  }
  const player = next.factions[factionId];
  const effect = choice.effect;
  if (effect.cost) {
    for (const [key, value] of Object.entries(effect.cost) as Array<[ResourceKey, number]>) {
      if (player.stocks[key] + 1e-9 < value) {
        return { ok: false, state, message: 'Recursos insuficientes para esta escolha.' };
      }
    }
    for (const [key, value] of Object.entries(effect.cost) as Array<[ResourceKey, number]>) {
      player.stocks[key] = round1(player.stocks[key] - value);
    }
  }
  if (effect.stockDelta) {
    for (const [key, value] of Object.entries(effect.stockDelta) as Array<[ResourceKey, number]>) {
      player.stocks[key] = round1(clamp(player.stocks[key] + value, 0, 100000));
    }
  }
  if (effect.allStockDelta) {
    for (const faction of Object.values(next.factions)) {
      for (const [key, value] of Object.entries(effect.allStockDelta) as Array<[ResourceKey, number]>) {
        faction.stocks[key] = round1(clamp(faction.stocks[key] + value, 0, 100000));
      }
    }
  }
  if (effect.unrest) {
    for (const tile of Object.values(next.tiles)) {
      if (tile.owner === factionId) tile.unrest = clamp(tile.unrest + effect.unrest, 0, 100);
    }
  }
  if (effect.military) {
    player.military = round1(clamp(player.military + effect.military, 0, 999));
  }
  if (effect.relations) {
    for (const other of Object.keys(next.factions) as FactionId[]) {
      if (other === factionId) continue;
      const key = relationKey(factionId, other);
      const rel = getRelation(next, factionId, other);
      next.diplomacy[key] = { ...rel, relation: clamp(rel.relation + effect.relations, -100, 100) };
    }
  }
  if (effect.market) {
    for (const [key, factor] of Object.entries(effect.market) as Array<[MarketKey, number]>) {
      next.market.prices[key] = Math.round(next.market.prices[key] * factor * 100) / 100;
      logEntry(
        next,
        'evento',
        `Mercado: preço de ${MARKET_LABELS[key]} ${factor >= 1 ? 'subiu' : 'caiu'} para ${next.market.prices[key].toFixed(2)} créditos.`,
      );
    }
  }
  if (effect.modifier) {
    next.modifiers.push({
      id: `mod_${++next.nextId}`,
      label: effect.modifier.label,
      description: effect.modifier.description,
      untilCycle: next.cycle + effect.modifier.cycles,
      scope: 'faction',
      factionId,
      production: effect.modifier.production,
      researchDiscount: effect.modifier.researchDiscount,
      tradeBonus: effect.modifier.tradeBonus,
      unrestPerCycle: effect.modifier.unrestPerCycle,
    });
    logEntry(
      next,
      'evento',
      `${effect.modifier.label}: ${effect.modifier.description} (até o ciclo ${next.cycle + effect.modifier.cycles}).`,
    );
  }
  logEntry(next, 'evento', `${event.title}: ${effect.log}`);
  next.usedEvents.push(event.id);
  next.pendingEventId = null;
  return {
    ok: true,
    state: next,
    message: `${event.title} — ${choice.label}.`,
  };
}
