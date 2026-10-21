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
    title: 'Safra recorde no cinturão agrícola',
    category: 'Clima',
    icon: 'Wheat',
    description: 'Chuvas na medida certa e uma colheita acima do previsto derrubaram o preço dos grãos. Fazendas e agroindústrias do continente têm uma janela rara de margem.',
    minCycle: 4,
    weight: 10,
    choices: [
      {
        id: 'estoque',
        label: 'Comprar o excedente',
        description: 'Garanta insumo barato para os próximos ciclos: R$ 800 mil do caixa e +6 de relações com os fornecedores.',
        tone: 'good',
        effect: {
          cost: { creditos: 800_000 },
          relations: 6,
          log: 'A companhia comprou o excedente agrícola e fechou contratos de fornecimento.',
        },
      },
      {
        id: 'vender',
        label: 'Vender a produção no atacado',
        description: 'Liquidez imediata: +R$ 1,8 mi em caixa.',
        tone: 'neutral',
        effect: {
          stockDelta: { creditos: 1_800_000 },
          log: 'A companhia vendeu a produção no atacado e reforçou o caixa.',
        },
      },
      {
        id: 'distribuir',
        label: 'Repassar ao varejo próprio',
        description: 'Margem menor, operação mais estável: −8 de desordem nas praças e +4 de relações.',
        tone: 'good',
        effect: {
          unrest: -8,
          relations: 4,
          log: 'O excedente foi repassado às lojas próprias e acalmou as praças.',
        },
      },
    ],
  },
  {
    id: 'seca',
    title: 'Seca no interior',
    category: 'Clima',
    icon: 'Sun',
    description: 'Três meses sem chuva. Os rios baixaram e os produtores rurais de todas as companhias alertam para perdas severas na safra.',
    minCycle: 8,
    weight: 9,
    choices: [
      {
        id: 'importar',
        label: 'Importar suprimentos',
        description: 'Compre de outro continente: R$ 1,8 mi e +6 de relações com os fornecedores.',
        tone: 'neutral',
        effect: {
          cost: { creditos: 1_800_000 },
          relations: 6,
          log: 'A companhia importou suprimentos para atravessar a seca.',
        },
      },
      {
        id: 'pocos',
        label: 'Financiar irrigação',
        description: 'R$ 1,2 mi em obras próprias: −20% no custo de pesquisa por 3 ciclos, com processo mais enxuto.',
        tone: 'good',
        effect: {
          cost: { creditos: 1_200_000 },
          modifier: {
            label: 'Irrigação própria',
            description: 'A produção irrigada estabilizou o abastecimento.',
            cycles: 3,
            researchDiscount: 0.2,
          },
          log: 'A companhia financiou poços e irrigação nas fazendas parceiras.',
        },
      },
      {
        id: 'racionar',
        label: 'Racionar e esperar',
        description: 'Sem custos imediatos, mas as praças sentem: +7 de desordem.',
        tone: 'bad',
        effect: {
          unrest: 7,
          log: 'O racionamento gerou filas e descontentamento nas praças.',
        },
      },
    ],
  },
  {
    id: 'demanda',
    title: 'Demanda por veículos dispara',
    category: 'Mercado',
    icon: 'Car',
    description: 'Os mercados do leste pagam qualquer preço por veículos. As concessionárias vendem antes de o caminhão chegar ao pátio.',
    minCycle: 10,
    weight: 9,
    choices: [
      {
        id: 'acelerar',
        label: 'Acelerar as linhas',
        description: 'R$ 1 mi em turnos extras: +8% na produção de créditos por 3 ciclos.',
        tone: 'neutral',
        effect: {
          cost: { creditos: 1_000_000 },
          modifier: {
            label: 'Turnos extras',
            description: 'As linhas de montagem rodam em três turnos.',
            cycles: 3,
            production: { creditos: 0.08 },
          },
          log: 'As fábricas rodaram turnos extras para atender os pedidos.',
        },
      },
      {
        id: 'exportar',
        label: 'Priorizar exportações',
        description: 'Venda a produção à vista: +R$ 1,7 mi em caixa e +3 de relações.',
        tone: 'neutral',
        effect: {
          stockDelta: { creditos: 1_700_000 },
          relations: 3,
          log: 'A companhia embarcou veículos para o leste e elevou o caixa.',
        },
      },
      {
        id: 'domestico',
        label: 'Abastecer as lojas próprias',
        description: 'Priorize a rede: +6 de relações e −5 de desordem.',
        tone: 'good',
        effect: {
          relations: 6,
          unrest: -5,
          log: 'As concessionárias próprias receberam os primeiros lotes.',
        },
      },
    ],
  },
  {
    id: 'jazida',
    title: 'Jazida sob a areia',
    category: 'Oportunidade',
    icon: 'Gem',
    description: 'Prospectores encontraram veios metálicos sob uma duna disputada. O achado pode financiar anos de expansão industrial.',
    minCycle: 6,
    weight: 8,
    choices: [
      {
        id: 'explorar',
        label: 'Explorar imediatamente',
        description: 'Extraia e venda rápido: +R$ 2,4 mi em caixa, mas +6 de desordem nas praças vizinhas.',
        tone: 'neutral',
        effect: {
          stockDelta: { creditos: 2_400_000 },
          unrest: 6,
          log: 'A mineração emergencial rendeu caixa rápido, com custo social local.',
        },
      },
      {
        id: 'estudar',
        label: 'Financiar estudos geológicos',
        description: 'R$ 600 mil em estudos: −15% no custo de pesquisa por 4 ciclos.',
        tone: 'good',
        effect: {
          cost: { creditos: 600_000 },
          modifier: {
            label: 'Mapa geológico',
            description: 'O levantamento do subsolo orienta novas plantas industriais.',
            cycles: 4,
            researchDiscount: 0.15,
          },
          log: 'Os estudos geológicos da companhia mapearam novos filões.',
        },
      },
      {
        id: 'locais',
        label: 'Conceder às comunidades locais',
        description: 'Renuncie à exploração direta: +8 de relações com todas as companhias.',
        tone: 'good',
        effect: {
          relations: 8,
          log: 'A concessão comunitária da jazida melhorou a imagem da companhia.',
        },
      },
    ],
  },
  {
    id: 'greve',
    title: 'Greve nas linhas de montagem',
    category: 'Crise',
    icon: 'Hammer',
    description: 'Os operários das montadoras cruzaram os braços. A produção de veículos e componentes para enquanto o impasse durar.',
    minCycle: 12,
    weight: 8,
    choices: [
      {
        id: 'negociar',
        label: 'Negociar aumentos',
        description: 'Pague R$ 1,6 mi e garanta +20% de produção de créditos por 3 ciclos.',
        tone: 'good',
        effect: {
          cost: { creditos: 1_600_000 },
          modifier: {
            label: 'Acordo das montadoras',
            description: 'Salários melhores restauraram a produtividade.',
            cycles: 3,
            production: { creditos: 0.2 },
          },
          log: 'A companhia fechou um acordo salarial com as montadoras.',
        },
      },
      {
        id: 'seguranca',
        label: 'Contratar segurança temporária',
        description: 'Pague R$ 1,2 mi para conter os piquetes: −10 de desordem, +3 de relações.',
        tone: 'bad',
        effect: {
          cost: { creditos: 1_200_000 },
          unrest: -10,
          relations: 3,
          log: 'Segurança contratada reabriu as linhas; o custo foi financeiro e reputacional.',
        },
      },
      {
        id: 'esperar',
        label: 'Deixar o impasse se resolver',
        description: 'Sem custos e sem riscos imediatos. A produção segue parada.',
        tone: 'neutral',
        effect: {
          log: 'A companhia aguardou o fim da greve sem intervir.',
        },
      },
    ],
  },
  {
    id: 'refugiados',
    title: 'Novo polo industrial',
    category: 'Oportunidade',
    icon: 'Factory',
    description: 'Uma região vizinha abriu incentivos para instalar plantas e galpões. O prazo é curto e as outras companhias já estão negociando.',
    minCycle: 8,
    weight: 7,
    choices: [
      {
        id: 'acolher',
        label: 'Instalar uma planta',
        description: 'R$ 2,2 mi de investimento: +8 de relações com a região e −5 de desordem.',
        tone: 'good',
        effect: {
          cost: { creditos: 2_200_000 },
          relations: 8,
          unrest: -5,
          log: 'A companhia inaugurou uma planta no novo polo industrial.',
        },
      },
      {
        id: 'ajuda',
        label: 'Financiar fornecedores locais',
        description: 'Gaste R$ 1,2 mi sem abrir unidade: +6 de relações com todas as companhias.',
        tone: 'good',
        effect: {
          cost: { creditos: 1_200_000 },
          relations: 6,
          log: 'O financiamento a fornecedores locais foi reconhecido pelas outras companhias.',
        },
      },
      {
        id: 'fechar',
        label: 'Manter a operação atual',
        description: 'Sem custos, mas a rede perde terreno: −6 de relações.',
        tone: 'bad',
        effect: {
          relations: -6,
          log: 'A companhia ficou de fora do novo polo industrial.',
        },
      },
    ],
  },
  {
    id: 'inovacao',
    title: 'Feira de tecnologia industrial',
    category: 'Ciência',
    icon: 'Lightbulb',
    description: 'Engenheiros e fornecedores de automação se reúnem no centro do continente. Quem sai da feira com os melhores contratos ganha ciclos de vantagem.',
    minCycle: 10,
    weight: 7,
    choices: [
      {
        id: 'instituto',
        label: 'Financiar o instituto',
        description: 'Pague R$ 1,4 mi: −25% no custo de pesquisa por 4 ciclos.',
        tone: 'good',
        effect: {
          cost: { creditos: 1_400_000 },
          modifier: {
            label: 'Instituto próprio',
            description: 'Bolsas e laboratórios reduzem o custo das pesquisas.',
            cycles: 4,
            researchDiscount: 0.25,
          },
          log: 'A companhia financiou um instituto de pesquisa aplicada.',
        },
      },
      {
        id: 'artesaos',
        label: 'Contratar os projetistas',
        description: 'Converta o evento em caixa: +R$ 1,2 mi e +3 de relações.',
        tone: 'neutral',
        effect: {
          stockDelta: { creditos: 1_200_000 },
          relations: 3,
          log: 'Os projetistas da feira assinaram contratos com a companhia.',
        },
      },
      {
        id: 'observar',
        label: 'Enviar observadores',
        description: 'Ganhe apenas o essencial: +R$ 400 mil e −10% no custo de pesquisa por 2 ciclos.',
        tone: 'neutral',
        effect: {
          stockDelta: { creditos: 400_000 },
          modifier: {
            label: 'Relatório da feira',
            description: 'Os relatórios técnicos orientam os próximos projetos.',
            cycles: 2,
            researchDiscount: 0.1,
          },
          log: 'Observadores da companhia registraram os avanços apresentados na feira.',
        },
      },
    ],
  },
  {
    id: 'corsarios',
    title: 'Cargas desviadas',
    category: 'Crise',
    icon: 'Ship',
    description: 'Carregamentos desapareceram nas rotas do sul. As seguradoras elevam o prêmio e os clientes exigem garantias.',
    minCycle: 10,
    weight: 7,
    choices: [
      {
        id: 'resgate',
        label: 'Pagar o resgate',
        description: 'Recupere a carga por R$ 1,2 mi e evite perdas maiores.',
        tone: 'neutral',
        effect: {
          cost: { creditos: 1_200_000 },
          log: 'A companhia pagou para liberar as cargas capturadas.',
        },
      },
      {
        id: 'escolta',
        label: 'Contratar escolta privada',
        description: 'Gaste R$ 1 mi: as cargas seguem e a rede ganha confiança (+6 de relações).',
        tone: 'good',
        effect: {
          cost: { creditos: 1_000_000 },
          relations: 6,
          log: 'Escoltas privadas mantiveram as entregas da companhia no prazo.',
        },
      },
      {
        id: 'ignorar',
        label: 'Absorver as perdas',
        description: '−R$ 800 mil em caixa e +5 de desordem nas praças.',
        tone: 'bad',
        effect: {
          stockDelta: { creditos: -800_000 },
          unrest: 5,
          log: 'Cargas da companhia foram perdidas sem resposta.',
        },
      },
    ],
  },
  {
    id: 'credito',
    title: 'Crédito barato no mercado financeiro',
    category: 'Mercado',
    icon: 'Coins',
    description: 'Bancos de Ourovil oferecem linhas de crédito generosas para expansão. O dinheiro é barato — e cobra juros depois.',
    minCycle: 14,
    weight: 6,
    choices: [
      {
        id: 'emprestimo',
        label: 'Contrair empréstimo',
        description: '+R$ 2,4 mi agora, mas −15% de receita de créditos por 4 ciclos.',
        tone: 'neutral',
        effect: {
          stockDelta: { creditos: 2_400_000 },
          modifier: {
            label: 'Serviço da dívida',
            description: 'Os juros do empréstimo consomem parte da receita.',
            cycles: 4,
            production: { creditos: -0.15 },
          },
          log: 'A companhia tomou R$ 2,4 mi emprestados em Ourovil.',
        },
      },
      {
        id: 'prudencia',
        label: 'Recusar e poupar',
        description: 'Sem dívida: +4 de relações pela disciplina fiscal.',
        tone: 'good',
        effect: {
          relations: 4,
          log: 'A recusa prudente foi notada pelos banqueiros de Ourovil.',
        },
      },
    ],
  },
  {
    id: 'conselho',
    title: 'Cúpula do setor',
    category: 'Política',
    icon: 'Landmark',
    description: 'As quatro companhias se reúnem para discutir rotas, tarifas e padrões de governança. A pauta é o futuro do mercado global.',
    minCycle: 15,
    weight: 6,
    choices: [
      {
        id: 'sediar',
        label: 'Sediar o conselho',
        description: 'Pague R$ 2 mi: +12 de relações com todas as companhias.',
        tone: 'good',
        effect: {
          cost: { creditos: 2_000_000 },
          relations: 12,
          log: 'A companhia sediou a Cúpula do setor e colheu prestígio.',
        },
      },
      {
        id: 'observadores',
        label: 'Enviar uma delegação discreta',
        description: '+R$ 400 mil e +4 de relações, sem custos.',
        tone: 'neutral',
        effect: {
          stockDelta: { creditos: 400_000 },
          relations: 4,
          log: 'A delegação da companhia trocou mapas e relatórios no conselho.',
        },
      },
      {
        id: 'ausentar',
        label: 'Não comparecer',
        description: 'Economize recursos, mas as companhias notam a ausência: −5 de relações.',
        tone: 'bad',
        effect: {
          relations: -5,
          log: 'A ausência da companhia na Cúpula do setor foi mal recebida.',
        },
      },
    ],
  },
  {
    id: 'concessoes',
    title: 'Leilão de licenças portuárias',
    category: 'Oportunidade',
    icon: 'Ship',
    description: 'O regulador abre licenças de terminais e armazéns: portos, pátios e centros de distribuição. O prazo é curto e a concorrência já está na sala.',
    minCycle: 9,
    weight: 6,
    choices: [
      {
        id: 'arrematar',
        label: 'Arrematar a licença',
        description: 'Pague R$ 1,8 mi: +12 de relações com o regulador e −5 de desordem na praça.',
        tone: 'good',
        effect: {
          cost: { creditos: 1_800_000 },
          relations: 12,
          unrest: -5,
          log: 'A companhia arrematou uma licença portuária no leilão.',
        },
      },
      {
        id: 'consorcio',
        label: 'Entrar em consórcio',
        description: 'Pague R$ 800 mil: +6 de relações e −10% no custo de pesquisa por 2 ciclos.',
        tone: 'neutral',
        effect: {
          cost: { creditos: 800_000 },
          relations: 6,
          modifier: {
            label: 'Consórcio portuário',
            description: 'O consórcio divide o risco e abre acesso a projetos.',
            cycles: 2,
            researchDiscount: 0.1,
          },
          log: 'A companhia entrou num consórcio para dividir o risco da licença.',
        },
      },
      {
        id: 'passar',
        label: 'Deixar passar',
        description: 'Sem custos. A concorrência leva a licença e o assunto esfria.',
        tone: 'bad',
        effect: {
          log: 'A companhia preferiu preservar caixa e ficou fora do leilão.',
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

/** Caixa não tem teto simbólico; os demais estoques seguem limitados. */
function stockCap(key: ResourceKey): number {
  return key === 'creditos' ? 1e12 : 100_000;
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
      player.stocks[key] = round1(clamp(player.stocks[key] + value, 0, stockCap(key)));
    }
  }
  if (effect.allStockDelta) {
    for (const faction of Object.values(next.factions)) {
      for (const [key, value] of Object.entries(effect.allStockDelta) as Array<[ResourceKey, number]>) {
        faction.stocks[key] = round1(clamp(faction.stocks[key] + value, 0, stockCap(key)));
      }
    }
  }
  if (effect.unrest) {
    for (const tile of Object.values(next.tiles)) {
      if (tile.owner === factionId) tile.unrest = clamp(tile.unrest + effect.unrest, 0, 100);
    }
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
