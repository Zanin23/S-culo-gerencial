import { tilesOfFaction } from './map';
import { buildLevel, operationsOf, rangeLevel } from './operations';
import type { GameState } from './types';

/**
 * Roteiro do começo de carreira.
 *
 * A companhia nasce pequena: uma sede, duas praças e nenhuma unidade. Em vez de
 * abrir todas as ferramentas de uma vez, o painel sugere o próximo passo e
 * acompanha quatro marcos simples até a rotina de crescer, evoluir e expandir.
 */

export type CareerStepId = 'unidade' | 'ciclo' | 'ampliacao' | 'praca';

export interface CareerStep {
  id: CareerStepId;
  title: string;
  hint: string;
  done: boolean;
}

export type GuidanceView = 'companies' | 'units' | 'expansion' | 'map' | 'objectives';

export interface NextStep {
  id: CareerStepId | 'livre';
  title: string;
  body: string;
  action: string;
  view: GuidanceView;
  icon: string;
}

export function careerSteps(state: GameState): CareerStep[] {
  const playerId = state.playerFactionId;
  const operations = operationsOf(state, playerId);
  const units = operations.reduce((sum, op) => sum + op.units, 0);
  const expanded = operations.some((op) => buildLevel(op) + rangeLevel(op) > 0);
  const tiles = tilesOfFaction(state.tiles, playerId).length;
  return [
    {
      id: 'unidade',
      title: 'Abra a primeira unidade',
      hint: 'Uma loja na cidade-sede já gera receita.',
      done: operations.length > 0,
    },
    {
      id: 'ciclo',
      title: 'Avance um ciclo',
      hint: 'A receita entra quando o ciclo fecha.',
      done: state.cycle > 1,
    },
    {
      id: 'ampliacao',
      title: 'Amplie a unidade',
      hint: 'Mais área construída, mais receita.',
      done: expanded,
    },
    {
      id: 'praca',
      title: 'Licencie uma nova praça',
      hint: 'Cada país licenciado abre novas cidades.',
      done: tiles > 2 || units >= 3,
    },
  ];
}

export function careerComplete(state: GameState): boolean {
  return careerSteps(state).every((step) => step.done);
}

/** Próximo passo recomendado, na ordem em que o jogo faz sentido. */
export function nextStep(state: GameState): NextStep {
  const playerId = state.playerFactionId;
  const operations = operationsOf(state, playerId);
  const tiles = tilesOfFaction(state.tiles, playerId).length;

  if (!operations.length) {
    return {
      id: 'unidade',
      title: 'Abra a primeira unidade',
      body: 'Escolha uma cidade da praça, um ramo e confirme o investimento. A loja começa a render no próximo ciclo.',
      action: 'Abrir unidade',
      view: 'companies',
      icon: 'Store',
    };
  }

  if (state.cycle === 1) {
    return {
      id: 'ciclo',
      title: 'Avance um ciclo',
      body: 'A receita e as despesas só se movem quando o ciclo fecha. Avance uma vez e veja o primeiro resultado.',
      action: 'Ir para o mapa',
      view: 'map',
      icon: 'Play',
    };
  }

  if (!operations.some((op) => buildLevel(op) + rangeLevel(op) > 0)) {
    return {
      id: 'ampliacao',
      title: 'Amplie a unidade',
      body: 'Compre uma expansão de construção ou de ramo na unidade que já está aberta. O mesmo endereço passa a render mais.',
      action: 'Ver obras',
      view: 'units',
      icon: 'Blocks',
    };
  }

  if (operations.length < 2) {
    return {
      id: 'livre',
      title: 'Abra a segunda unidade',
      body: 'Duas unidades em cidades diferentes reduzem a dependência de um único mercado.',
      action: 'Abrir unidade',
      view: 'companies',
      icon: 'Store',
    };
  }

  if (tiles < 3) {
    return {
      id: 'praca',
      title: 'Licencie uma nova praça',
      body: 'Com a operação estável, compre a licença de um país vizinho e abra unidades nas cidades dele.',
      action: 'Ver expansão',
      view: 'expansion',
      icon: 'Target',
    };
  }

  return {
    id: 'livre',
    title: 'Cresça no lugar certo',
    body: 'Amplie as unidades que já rendem e acompanhe o resultado em Finanças antes do próximo investimento.',
    action: 'Ver metas',
    view: 'objectives',
    icon: 'Award',
  };
}
