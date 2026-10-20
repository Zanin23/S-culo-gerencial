import { useMemo } from 'react';
import { adminCapacityOfState, projectSlotsOf } from '../game/economy';
import { neighborsOf, tilesOfFaction } from '../game/map';
import { expansionPreview } from '../game/commands';
import type { Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { money } from './format';
import { Icon } from './Icon';
import { Badge, EmptyState, ProgressBar, SectionHeader } from './primitives';
import { ClaimCard } from './TerritoryPanel';
import { ViewShell } from './ViewShell';

export function ExpansionPanel() {
  const game = useGameStore((s) => s.game)!;
  const setView = useGameStore((s) => s.setView);
  const playerId = game.playerFactionId;
  const player = game.factions[playerId];
  const owned = useMemo(() => tilesOfFaction(game.tiles, playerId), [game.tiles, playerId]);
  const capacity = adminCapacityOfState(game, playerId);
  const activeExpansions = game.projects.filter((project) => project.factionId === playerId && project.kind === 'expansao');
  const reserved = owned.length + activeExpansions.length;
  const projectSlots = projectSlotsOf(player);
  const activeProjects = game.projects.filter((project) => project.factionId === playerId);

  const targets = useMemo(() => {
    const seen = new Set<string>();
    const list: Array<{ tile: Tile; preview: ReturnType<typeof expansionPreview> }> = [];
    for (const tile of owned) {
      for (const neighbor of neighborsOf(tile, game.tiles)) {
        if (neighbor.owner !== null || seen.has(neighbor.id)) continue;
        seen.add(neighbor.id);
        list.push({ tile: neighbor, preview: expansionPreview(game, playerId, neighbor) });
      }
    }
    return list.sort((a, b) => {
      const readyA = a.preview.adjacent && a.preview.dev >= a.preview.required && a.preview.canAfford ? 1 : 0;
      const readyB = b.preview.adjacent && b.preview.dev >= b.preview.required && b.preview.canAfford ? 1 : 0;
      return readyB - readyA || b.tile.strategic - a.tile.strategic || (b.tile.node === 'raro' ? 1 : 0) - (a.tile.node === 'raro' ? 1 : 0);
    });
  }, [game, owned, playerId]);

  const readyCount = targets.filter((target) => target.preview.adjacent && target.preview.dev >= target.preview.required && target.preview.canAfford).length;

  return (
    <ViewShell
      eyebrow="Diretoria de expansão"
      title="Licenças de praça"
      subtitle="Sua companhia compra licenças para operar em novas praças. A praça vizinha precisa de uma base desenvolvida e a licença é paga em caixa, em duas etapas de ciclo."
      icon="Target"
      actions={<Badge tone="teal" icon="Coins">{money(player.stocks.creditos)} em caixa</Badge>}
    >
      <div className="summary-grid summary-grid--4">
        <div className="summary-card summary-card--teal">
          <span className="summary-card__label"><Icon name="Map" size={14} /> Capacidade administrativa</span>
          <strong>{reserved} <small>/ {capacity}</small></strong>
          <ProgressBar value={reserved} max={capacity} tone={reserved >= capacity ? 'red' : 'teal'} thin />
          <small>{reserved >= capacity ? 'Limite atingido: construa escritórios centrais ou pesquise' : `${Math.max(0, capacity - reserved)} licenças reserváveis`}</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Target" size={14} /> Praças vizinhas livres</span>
          <strong>{targets.length}</strong>
          <span className="summary-card__delta">{readyCount} prontas para licenciar</span>
          <small>Praças sem licença que fazem fronteira com as suas</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Coins" size={14} /> Caixa</span>
          <strong>{money(player.stocks.creditos)}</strong>
          <span className="summary-card__delta">licenças pagas à vista</span>
          <small>O custo cresce com o número de praças e com o valor do mercado</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Hammer" size={14} /> Vagas de projeto</span>
          <strong>{activeProjects.length} <small>/ {projectSlots}</small></strong>
          <ProgressBar value={activeProjects.length} max={projectSlots} tone="blue" thin />
          <small>{activeExpansions.length} licenciamento(s) em andamento</small>
        </div>
      </div>

      {reserved >= capacity ? (
        <div className="warning-banner">
          <Icon name="AlertTriangle" size={18} />
          <div>
            <strong>Capacidade administrativa no limite</strong>
            <p>Sem novos escritórios centrais ou a tecnologia de gestão, novas licenças ficam bloqueadas e o excedente reduz a receita.</p>
          </div>
          <button className="button button--tiny button--gold" onClick={() => setView('construction')} type="button">Construir escritório</button>
        </div>
      ) : null}

      {activeExpansions.length ? (
        <section className="view-card">
          <SectionHeader eyebrow="Licenciamento" title="Praças em preparação" icon="Target" />
          <div className="project-grid">
            {activeExpansions.map((project) => (
              <div className="project-card" key={project.id}>
                <span className="project-card__icon"><Icon name="Target" size={17} /></span>
                <div>
                  <strong>{project.label}</strong>
                  <ProgressBar value={Math.max(0, game.cycle - project.startedCycle)} max={Math.max(1, project.completesCycle - project.startedCycle)} tone="teal" thin />
                  <small>Licença no ciclo {project.completesCycle} · {Math.max(0, project.completesCycle - game.cycle)} ciclo(s)</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader eyebrow="Fronteira comercial" title="Praças disponíveis" icon="Map" action={<Badge tone="neutral">{targets.length} praças</Badge>} />
        {targets.length ? (
          <div className="claim-grid">
            {targets.map(({ tile }) => <ClaimCard key={tile.id} tile={tile} game={game} />)}
          </div>
        ) : (
          <EmptyState icon="Map" title="Nenhuma praça livre na fronteira">Todas as praças vizinhas já têm licença. Considere desenvolver a base, negociar acordos ou melhorar a rede existente.</EmptyState>
        )}
      </section>

      <section className="view-card expansion-rules">
        <SectionHeader eyebrow="Protocolo" title="Como funciona a licença" icon="Info" />
        <div className="rules-grid">
          <div><span>1</span><strong>Fronteira</strong><p>A praça-alvo precisa fazer fronteira com uma praça sua.</p></div>
          <div><span>2</span><strong>Base desenvolvida</strong><p>A praça de partida precisa atingir o desenvolvimento exigido pelo alvo.</p></div>
          <div><span>3</span><strong>Custo crescente</strong><p>O valor da licença aumenta com o número de praças da companhia.</p></div>
          <div><span>4</span><strong>Licenciamento</strong><p>A licença chega em 2 ciclos e traz desordem inicial. Se outra companhia chegar antes, parte do custo é reembolsada.</p></div>
        </div>
      </section>
    </ViewShell>
  );
}
