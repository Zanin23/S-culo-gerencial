import { useMemo } from 'react';
import { BUILDINGS, BUILDING_ORDER, NODES, TECHS, TERRAIN } from '../game/constants';
import {
  canAfford,
  developmentOf,
  hasTech,
  projectSlotsOf,
  slotsOf,
  territoryProduction,
  usedSlots,
} from '../game/economy';
import { tilesOfFaction } from '../game/map';
import { canBuild } from '../game/commands';
import type { BuildingKey, Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { fmt } from './format';
import { BuildingGlyph } from './art/Glyph';
import { Icon } from './Icon';
import { Badge, Cost, cx, EmptyState, LevelPips, ProgressBar, SectionHeader } from './primitives';
import { ViewShell } from './ViewShell';

function BuildingCard({ tile, building }: { tile: Tile; building: BuildingKey }) {
  const game = useGameStore((s) => s.game)!;
  const build = useGameStore((s) => s.build);
  const playerId = game.playerFactionId;
  const faction = game.factions[playerId];
  const def = BUILDINGS[building];
  const level = tile.buildings[building];
  const next = Math.min(3, level + 1);
  const check = canBuild(game, playerId, tile, building);
  const project = game.projects.find((p) => p.tileId === tile.id && p.building === building);
  const spec = def.levels[next - 1];
  const techRequired = def.techUnlock?.[next];
  const hasBonus = Boolean(
    def.terrainBonus &&
    (def.terrainBonus.nodes?.includes(tile.node) || def.terrainBonus.terrains?.includes(tile.terrain)),
  );

  return (
    <article className={cx('building-card', project && 'is-building', level > 0 && 'has-level', !check.ok && !project && 'is-locked')}>
      <div className="building-card__head">
        <span className="building-card__icon">
          <BuildingGlyph kind={building} size={40} />
        </span>
        <div className="building-card__title">
          <div className="eyebrow">{def.category}</div>
          <h3>{def.name}</h3>
        </div>
        <div className="building-card__level">
          <span>Nível {level}/3</span>
          <LevelPips level={level} />
        </div>
      </div>
      <p className="building-card__desc">{def.description}</p>
      <div className="building-card__effect">
        <Icon name="Zap" size={13} /> {def.effect}
        {def.defense ? <Badge tone="red" icon="Shield">+{def.defense * (level || 1)} defesa</Badge> : null}
        {def.slotsBonus ? <Badge tone="blue" icon="Map">+{def.slotsBonus * (level || 1)} espaços</Badge> : null}
      </div>
      {def.terrainBonus ? (
        <div className={cx('building-card__terrain', hasBonus && 'is-active')}>
          <Icon name={hasBonus ? 'Check' : 'Info'} size={12} />
          {hasBonus
            ? `Bônus local ativo: +${Math.round(def.terrainBonus.multiplier * 100)}% de ${def.terrainBonus.resource}`
            : `Bônus em ${def.terrainBonus.terrains?.map((t) => TERRAIN[t].name).join(' / ') ?? ''}${def.terrainBonus.nodes?.length ? ` · ${def.terrainBonus.nodes.map((n) => NODES[n].name).join(' / ')}` : ''}`}
        </div>
      ) : null}
      {techRequired && !hasTech(faction, techRequired) ? (
        <div className="building-card__locked"><Icon name="Lock" size={12} /> Nível {next} exige {TECHS[techRequired].name}</div>
      ) : null}
      {project ? (
        <div className="building-card__progress">
          <ProgressBar value={Math.max(0, game.cycle - project.startedCycle)} max={Math.max(1, project.completesCycle - project.startedCycle)} tone="teal" thin />
          <div><span>Conclui no ciclo {project.completesCycle}</span><strong>{Math.max(0, project.completesCycle - game.cycle)} ciclo(s)</strong></div>
        </div>
      ) : level >= 3 ? (
        <div className="building-card__max"><Icon name="Check" size={13} /> Nível máximo alcançado</div>
      ) : (
        <div className="building-card__foot">
          <div>
            <span className="muted tiny">Próximo nível {next} · {spec.cycles} ciclos</span>
            <Cost cost={spec.cost} stocks={faction.stocks} compact />
          </div>
          <button className="button button--small button--primary" disabled={!check.ok} onClick={() => build(tile.id, building)} type="button">
            <Icon name={level === 0 ? 'Plus' : 'ArrowUpRight'} size={13} />
            {level === 0 ? 'Construir' : 'Melhorar'}
          </button>
        </div>
      )}
      {!check.ok && check.reason && !project && level < 3 ? <div className="building-card__reason">{check.reason}</div> : null}
    </article>
  );
}

export function ConstructionPanel() {
  const game = useGameStore((s) => s.game)!;
  const selectedTileId = useGameStore((s) => s.selectedTileId);
  const selectTile = useGameStore((s) => s.selectTile);
  const setView = useGameStore((s) => s.setView);
  const playerId = game.playerFactionId;
  const player = game.factions[playerId];
  const owned = useMemo(() => tilesOfFaction(game.tiles, playerId), [game.tiles, playerId]);
  const activeTile = selectedTileId && game.tiles[selectedTileId]?.owner === playerId
    ? game.tiles[selectedTileId]
    : owned[0] ?? game.tiles[player.capitalId];
  const prod = activeTile ? territoryProduction(game, activeTile, player) : null;
  const used = activeTile ? usedSlots(activeTile) : 0;
  const slots = activeTile ? slotsOf(activeTile, player) : 0;
  const free = Math.max(0, slots - used);
  const activeProjects = game.projects.filter((project) => project.factionId === playerId);
  const projectSlots = projectSlotsOf(player);
  const affordableCount = activeTile
    ? BUILDING_ORDER.filter((building) => canBuild(game, playerId, activeTile, building).ok).length
    : 0;

  return (
    <ViewShell
      eyebrow="Gabinete de obras"
      title="Construção e desenvolvimento"
      subtitle="Cada território tem espaços limitados. Melhorar estruturas eleva o desenvolvimento, a produção e a pontuação de hegemonia."
      icon="Hammer"
      actions={<Badge tone={activeProjects.length >= projectSlots ? 'gold' : 'teal'} icon="Hammer">{activeProjects.length}/{projectSlots} projetos</Badge>}
    >
      <div className="construction-layout">
        <aside className="territory-list-panel">
          <SectionHeader eyebrow="Territórios" title="Suas bases" icon="Map" action={<Badge tone="neutral">{owned.length}</Badge>} />
          <div className="territory-list">
            {owned.map((tile) => {
              const isActive = activeTile?.id === tile.id;
              const tileUsed = usedSlots(tile);
              const tileSlots = slotsOf(tile, player);
              return (
                <button key={tile.id} className={cx('territory-item', isActive && 'is-active')} onClick={() => selectTile(tile.id)} type="button">
                  <span className="territory-item__sigil" style={{ borderColor: tile.isCapital ? 'var(--gold)' : 'rgba(255,255,255,.2)' }}>
                    <Icon name={tile.isCapital ? 'Crown' : 'Hexagon'} size={14} />
                  </span>
                  <div>
                    <strong>{tile.name}</strong>
                    <small>{developmentOf(tile)} dev · {TERRAIN[tile.terrain].name}</small>
                  </div>
                  <span className={cx('territory-item__slots', tileUsed >= tileSlots && 'is-full')}>{tileUsed}/{tileSlots}</span>
                </button>
              );
            })}
          </div>

          {activeTile ? (
            <div className="territory-summary">
              <div className="territory-summary__head">
                <div>
                  <div className="eyebrow">Território selecionado</div>
                  <h3>{activeTile.name}</h3>
                  <span>{TERRAIN[activeTile.terrain].name} · {NODES[activeTile.node].name}</span>
                </div>
                <span className="territory-summary__dev">{developmentOf(activeTile)}<small>dev</small></span>
              </div>
              <div className="territory-summary__stats">
                <div><span>Espaços livres</span><strong className={free ? 'tone-teal' : 'tone-gold'}>{free}</strong></div>
                <div><span>População</span><strong>{fmt(activeTile.pop)}</strong></div>
                <div><span>Desordem</span><strong className={activeTile.unrest >= 50 ? 'tone-red' : 'tone-teal'}>{Math.round(activeTile.unrest)}%</strong></div>
                <div><span>Manutenção</span><strong>{fmt(prod?.upkeep ?? 0)}</strong></div>
              </div>
              <div className="territory-summary__note">
                <Icon name="Info" size={12} />
                {free === 0
                  ? 'Todos os espaços estão ocupados. Melhore a Malha Logística ou pesquise Malha Integrada.'
                  : `${affordableCount} estrutura(s) disponíveis para construir agora.`}
              </div>
              <button className="button button--ghost button--block" onClick={() => { selectTile(activeTile.id); setView('map'); }} type="button">
                <Icon name="MousePointer2" size={13} /> Ver no mapa
              </button>
            </div>
          ) : null}
        </aside>

        <div className="construction-main">
          {activeTile ? (
            <>
              <div className="view-card construction-head">
                <div className="construction-head__body">
                  <div>
                    <span className="eyebrow">Slots construíveis</span>
                    <strong>{used}<small> / {slots}</small></strong>
                  </div>
                  <div>
                    <span className="eyebrow">Livre</span>
                    <strong className={free ? 'tone-teal' : 'tone-gold'}>{free}</strong>
                  </div>
                  <div>
                    <span className="eyebrow">Manutenção local</span>
                    <strong>{fmt(prod?.upkeep ?? 0)} <small>cr./ciclo</small></strong>
                  </div>
                  <div>
                    <span className="eyebrow">Mão de obra</span>
                    <strong>{prod?.jobs ?? 0} <small>postos</small></strong>
                  </div>
                </div>
                <ProgressBar value={used} max={slots} tone={free ? 'teal' : 'gold'} thin />
                <p className="table-note">Cada tipo de estrutura ocupa um espaço, independentemente do nível. O desenvolvimento do território cresce com níveis construídos e população.</p>
              </div>

              <div className="building-grid">
                {BUILDING_ORDER.map((building) => <BuildingCard key={building} building={building} tile={activeTile} />)}
              </div>

              <div className="panel-note">
                <Icon name="Info" size={14} />
                <p>Obras ocupam uma vaga de projeto e um espaço do território. Tecnologias liberam níveis superiores e novos bônus. Verifique a capacidade administrativa antes de expandir.</p>
              </div>
            </>
          ) : (
            <EmptyState icon="Map" title="Sem territórios">Selecione um território no mapa para gerenciar construções.</EmptyState>
          )}
        </div>
      </div>
    </ViewShell>
  );
}
