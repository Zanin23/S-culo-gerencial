import { useMemo } from 'react';
import { NODES, RESOURCES } from '../game/constants';
import { adminCapacityOfState, projectSlotsOf } from '../game/economy';
import { neighborsOf, tilesOfFaction } from '../game/map';
import { expansionPreview } from '../game/commands';
import type { Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { fmt } from './format';
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
  const rarest = targets.filter((target) => target.tile.node === 'raro').length;

  return (
    <ViewShell
      eyebrow="Gabinete de fronteiras"
      title="Expansão territorial"
      subtitle="Reivindique países neutros que fazem fronteira com os seus. O país de partida precisa de desenvolvimento suficiente, e o custo cresce com o tamanho da nação."
      icon="Target"
      actions={<Badge tone="teal" icon="Crown">{fmt(player.stocks.influencia)} relações</Badge>}
    >
      <div className="summary-grid summary-grid--4">
        <div className="summary-card summary-card--teal">
          <span className="summary-card__label"><Icon name="Map" size={14} /> Capacidade administrativa</span>
          <strong>{reserved} <small>/ {capacity}</small></strong>
          <ProgressBar value={reserved} max={capacity} tone={reserved >= capacity ? 'red' : 'teal'} thin />
          <small>{reserved >= capacity ? 'Limite atingido: construa administração ou pesquise' : `${Math.max(0, capacity - reserved)} expansões reserváveis`}</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Target" size={14} /> Fronteiras livres</span>
          <strong>{targets.length}</strong>
          <span className="summary-card__delta">{readyCount} prontas para expedição</span>
          <small>Países neutros vizinhos dos seus</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Handshake" size={14} /> Relações</span>
          <strong>{fmt(player.stocks.influencia)}</strong>
          <span className="summary-card__delta">custo cresce com territórios</span>
          <small>Cada expansão consome relações institucionais</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Hammer" size={14} /> Vagas de projeto</span>
          <strong>{activeProjects.length} <small>/ {projectSlots}</small></strong>
          <ProgressBar value={activeProjects.length} max={projectSlots} tone="blue" thin />
          <small>{activeExpansions.length} expedição(ões) em andamento</small>
        </div>
      </div>

      {reserved >= capacity ? (
        <div className="warning-banner">
          <Icon name="AlertTriangle" size={18} />
          <div>
            <strong>Capacidade administrativa no limite</strong>
            <p>Sem novos centros administrativos ou a tecnologia Administração Civil, novas expedições serão bloqueadas e o excedente reduz a produção.</p>
          </div>
          <button className="button button--tiny button--gold" onClick={() => setView('construction')} type="button">Construir administração</button>
        </div>
      ) : null}

      {rarest ? (
        <div className="callout callout--gold">
          <Icon name="Gem" size={17} />
          <span><strong>{rarest} depósito(s) raro(s) ao alcance</strong><small>Territórios raros produzem créditos e relações extras. Priorize-os se puder arcar com o custo.</small></span>
        </div>
      ) : null}

      {activeExpansions.length ? (
        <section className="view-card">
          <SectionHeader eyebrow="Expedições" title="Soberania em preparação" icon="Target" />
          <div className="project-grid">
            {activeExpansions.map((project) => (
              <div className="project-card" key={project.id}>
                <span className="project-card__icon"><Icon name="Target" size={17} /></span>
                <div>
                  <strong>{project.label}</strong>
                  <ProgressBar value={Math.max(0, game.cycle - project.startedCycle)} max={Math.max(1, project.completesCycle - project.startedCycle)} tone="teal" thin />
                  <small>Proclamação no ciclo {project.completesCycle} · {Math.max(0, project.completesCycle - game.cycle)} ciclo(s)</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionHeader eyebrow="Fronteira global" title="Alvos de expansão" icon="Map" action={<Badge tone="neutral">{targets.length} países</Badge>} />
        {targets.length ? (
          <div className="claim-grid">
            {targets.map(({ tile }) => <ClaimCard key={tile.id} tile={tile} game={game} />)}
          </div>
        ) : (
          <EmptyState icon="Map" title="Nenhuma fronteira livre">Todos os países vizinhos têm soberano. Considere diplomacia, desenvolvimento interno ou uma campanha militar.</EmptyState>
        )}
      </section>

      <section className="view-card expansion-rules">
        <SectionHeader eyebrow="Doutrina" title="Como funciona a expansão" icon="Info" />
        <div className="rules-grid">
          <div><span>1</span><strong>Fronteira</strong><p>O alvo precisa fazer fronteira com um país seu.</p></div>
          <div><span>2</span><strong>Base desenvolvida</strong><p>O território de partida precisa atingir o desenvolvimento exigido pelo alvo.</p></div>
          <div><span>3</span><strong>Custo crescente</strong><p>Créditos, matérias-primas e relações aumentam com o número de territórios.</p></div>
          <div><span>4</span><strong>Proclamação</strong><p>A soberania chega em 2 ciclos e gera desordem inicial. Se outro poder chegar antes, parte do custo é reembolsada.</p></div>
        </div>
      </section>

      <div className="supply-chips">
        {Object.entries(NODES).filter(([key]) => key !== 'nenhum').map(([key, node]) => (
          <span className="supply-chip" key={key} title={node.description}>
            <i style={{ background: node.color }} /> {node.name}
            <small>{Object.entries(node.bonus).map(([resource, value]) => `${fmt(value ?? 0)} ${RESOURCES[resource as keyof typeof RESOURCES]?.short ?? resource}`).join(' · ')}</small>
          </span>
        ))}
      </div>
    </ViewShell>
  );
}
