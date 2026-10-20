import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { cityById, citiesOf } from '../game/atlas';
import { FACTIONS, SECTOR_ORDER, SECTORS } from '../game/constants';
import { techEffects } from '../game/economy';
import { tilesOfFaction } from '../game/map';
import {
  loadDetailCities,
  detailCitiesReady,
  subscribeDetailCities,
} from '../game/detailCities';
import {
  LOCAL_MARKET_UNITS,
  MAX_UNITS_PER_CITY,
  averageOperationShare,
  canOpenOperation,
  canOpenSector,
  cityMarketSize,
  operationCost,
  operationOutput,
  operationsOf,
  operationsSummary,
} from '../game/operations';
import { scoreOf } from '../game/progress';
import type { SectorKey } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { fmt, money, trendClass } from './format';
import { Icon } from './Icon';
import { Badge, Cost, ProgressBar, SectionHeader, cx } from './primitives';
import { ViewShell } from './ViewShell';

const MAX_CITIES = 26;

export function CompaniesPanel() {
  const game = useGameStore((s) => s.game)!;
  const openOperation = useGameStore((s) => s.openOperation);
  const upgradeOperation = useGameStore((s) => s.upgradeOperation);
  const closeOperation = useGameStore((s) => s.closeOperation);
  const playerId = game.playerFactionId;
  const player = game.factions[playerId];
  const tech = techEffects(player);
  const relevance = scoreOf(game, playerId);
  const tiles = useMemo(() => tilesOfFaction(game.tiles, playerId), [game.tiles, playerId]);
  const operations = useMemo(() => operationsOf(game, playerId), [game, playerId]);
  const summary = useMemo(
    () => operationsSummary(game, playerId, tech.operationsMult),
    [game, playerId, tech.operationsMult],
  );

  // O seletor de cidades usa o lote completo (5.759) assim que ele chega.
  const detailReady = useSyncExternalStore(subscribeDetailCities, detailCitiesReady, () => false);
  useEffect(() => { void loadDetailCities(); }, []);

  const [countryId, setCountryId] = useState(() => tiles[0]?.id ?? '');
  const [sector, setSector] = useState<SectorKey>('varejo');
  const cities = useMemo(() => {
    if (!countryId) return [];
    const ranked = citiesOf(countryId).slice().sort((a, b) => b.pop - a.pop);
    const pool = ranked.filter((city) => !operations.some((op) => op.cityId === city.id));
    const seatId = game.city?.countryId === countryId ? game.city.cityId : null;
    // A sede pode vir do lote detalhado (fora de `citiesOf`): entra sempre na lista.
    const seat = seatId
      ? pool.find((city) => city.id === seatId) ?? cityById(seatId)
      : undefined;
    const shortlist = pool.slice(0, MAX_CITIES);
    if (seat && !operations.some((op) => op.cityId === seat.id) && !shortlist.some((city) => city.id === seat.id)) {
      return [seat, ...shortlist.slice(0, MAX_CITIES - 1)];
    }
    return shortlist;
  }, [countryId, operations, detailReady, game.city]);
  const [cityId, setCityId] = useState('');
  useEffect(() => {
    if (!cities.some((city) => city.id === cityId)) setCityId(cities[0]?.id ?? '');
  }, [cities, cityId]);
  const city = cityById(cityId);
  const cost = city ? operationCost(city, sector, 1) : null;
  const blockReason = city
    ? canOpenOperation(game, playerId, city.id, relevance) ?? canOpenSector(game, playerId, city.id, sector, relevance)
    : 'Escolha uma cidade para abrir a unidade.';
  const projected = city && !blockReason ? operationOutput(game, {
    id: 'preview',
    cityId: city.id,
    countryId: city.countryId,
    factionId: playerId,
    sector,
    units: 1,
    openedCycle: game.cycle,
  }, tech.operationsMult) : null;
  // A prévia não está em `game.operations`: soma a unidade nova à concorrência local.
  const rivalsUnits = game.operations.filter((op) => op.cityId === city?.id).reduce((sum, op) => sum + op.units, 0);
  const projectedShare = city ? 1 / (rivalsUnits + LOCAL_MARKET_UNITS + 1) : 0;

  // Rivalidade: quem mais opera na cidade escolhida.
  const rivals = useMemo(() => {
    if (!city) return [];
    const counts = new Map<string, number>();
    for (const op of game.operations) {
      if (op.cityId !== city.id) continue;
      counts.set(op.factionId, (counts.get(op.factionId) ?? 0) + op.units);
    }
    return [...counts.entries()]
      .filter(([id]) => id !== playerId)
      .map(([id, units]) => ({ id, units }));
  }, [city, game.operations, playerId]);

  const countries = new Set(operations.map((op) => op.countryId)).size;
  const marginPct = summary.revenue > 0 ? summary.net / summary.revenue : 0;

  return (
    <ViewShell
      eyebrow="Portfólio de negócios"
      title="Sua companhia"
      subtitle="Cada unidade é um negócio aberto numa cidade real. Compre mais unidades na mesma praça, diversifique em novos ramos e deixe a companhia crescer de pequena operação a grupo relevante."
      icon="Building2"
      actions={<Badge tone="gold" icon="Coins">{money(summary.net, true)}/ciclo</Badge>}
    >
      <div className="summary-grid summary-grid--4">
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Store" size={14} /> Unidades</span>
          <strong>{summary.units}</strong>
          <span className="summary-card__delta">{operations.length} operaç{operations.length === 1 ? 'ão' : 'ões'} · {countries} {countries === 1 ? 'país' : 'países'}</span>
          <small>Até {MAX_UNITS_PER_CITY} unidades por cidade, cada uma com seu custo.</small>
        </div>
        <div className="summary-card summary-card--gold">
          <span className="summary-card__label"><Icon name="TrendingUp" size={14} /> Receita</span>
          <strong>{money(summary.revenue)}</strong>
          <span className="summary-card__delta">por ciclo</span>
          <small>{money(summary.upkeep)} de manutenção e {money(summary.supply)} de insumos.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Coins" size={14} /> Resultado</span>
          <strong className={cx(trendClass(summary.net))}>{money(summary.net, true)}</strong>
          <span className="summary-card__delta">margem de {Math.round(marginPct * 100)}%</span>
          <small>Fora daqui ficam salários e a estrutura da companhia.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Handshake" size={14} /> Participação</span>
          <strong>{Math.round(averageOperationShare(game, playerId) * 100)}%</strong>
          <span className="summary-card__delta">nos mercados ativos</span>
          <small>Rivais dividem o mercado; mais unidades, mais fatia.</small>
        </div>
      </div>

      <div className="view-card">
        <SectionHeader
          eyebrow="Portfólio"
          title={operations.length ? 'Unidades da companhia' : 'Nenhuma unidade aberta'}
          icon="Store"
          action={<span className="muted tiny">{FACTIONS[playerId].short} · {game.cycle}º ciclo</span>}
        />
        {operations.length ? (
          <div className="ops-grid">
            {operations.map((operation) => {
              const out = operationOutput(game, operation, tech.operationsMult);
              const host = cityById(operation.cityId);
              const country = game.tiles[operation.countryId];
              const meta = SECTORS[operation.sector];
              const upgradeCost = host ? operationCost(host, operation.sector, operation.units + 1) : null;
              return (
                <div className="ops-row" key={operation.id}>
                  <span className="ops-row__icon" style={{ color: meta.color }}>
                    <Icon name={meta.icon} size={17} />
                  </span>
                  <div className="ops-row__name">
                    <strong>{host?.name ?? operation.cityId}</strong>
                    <small>{meta.name} · {country?.name ?? operation.countryId} · {fmt(host?.pop ?? 0)} hab</small>
                  </div>
                  <div className="ops-row__share">
                    <span className="muted tiny">participação</span>
                    <strong>{Math.round(out.share * 100)}%</strong>
                    <ProgressBar value={out.share * 100} max={100} tone="teal" thin />
                  </div>
                  <div className="ops-row__money">
                    <span className="muted tiny">receita / custo</span>
                    <strong className="tone-teal">{money(out.revenue)}</strong>
                    <small>−{money(out.upkeep + out.supply)}</small>
                  </div>
                  <div className="ops-row__level">
                    <span className="muted tiny">unidades</span>
                    <strong>{operation.units} / {MAX_UNITS_PER_CITY}</strong>
                  </div>
                  <div className="ops-row__actions">
                    <button
                      className="button button--tiny"
                      type="button"
                      disabled={operation.units >= MAX_UNITS_PER_CITY || !host || !upgradeCost || player.stocks.creditos < upgradeCost.creditos}
                      title={upgradeCost ? `Comprar unidade por ${money(upgradeCost.creditos)}` : undefined}
                      onClick={() => upgradeOperation(operation.id)}
                    >
                      {operation.units >= MAX_UNITS_PER_CITY ? 'Máximo' : `Comprar +1`}
                    </button>
                    <button
                      className="button button--tiny button--ghost"
                      type="button"
                      onClick={() => closeOperation(operation.id)}
                    >
                      Vender
                    </button>
                  </div>
                  {operation.units < MAX_UNITS_PER_CITY && upgradeCost ? (
                    <span className="ops-row__cost muted tiny">
                      próxima unidade: <b>{money(upgradeCost.creditos)}</b>
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted small">
            Abra a primeira unidade abaixo. Uma fazenda custa pouco e cobre a operação; o varejo cresce
            com cidades grandes e o porto melhora o escoamento de todo o país.
          </p>
        )}
      </div>

      <div className="view-card">
        <SectionHeader eyebrow="Expansão" title="Abrir nova unidade" icon="Plus" />
        <div className="ops-open">
          <label className="ops-field">
            <span className="eyebrow">País</span>
            <select value={countryId} onChange={(event) => setCountryId(event.target.value)}>
              {tiles.length ? tiles.map((tile) => (
                <option key={tile.id} value={tile.id}>{tile.name}</option>
              )) : <option value="">Nenhuma praça com licença</option>}
            </select>
          </label>
          <label className="ops-field">
            <span className="eyebrow">Cidade</span>
            <select value={cityId} onChange={(event) => setCityId(event.target.value)} disabled={!cities.length}>
              {cities.length ? cities.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name} · {fmt(option.pop)} hab{game.city?.cityId === option.id ? ' · sede' : ''}
                </option>
              )) : <option value="">Nenhuma cidade livre nesta lista</option>}
            </select>
          </label>
          <div className="ops-field ops-field--wide">
            <span className="eyebrow">Ramo de negócio</span>
            <div className="ops-sectors">
              {SECTOR_ORDER.map((key) => {
                const def = SECTORS[key];
                const locked = relevance + 1e-9 < def.relevance;
                return (
                  <button
                    key={key}
                    type="button"
                    className={cx('ops-sector', sector === key && 'is-active', locked && 'is-locked')}
                    onClick={() => setSector(key)}
                    title={locked ? `${def.description} Exige relevância ${def.relevance}.` : def.description}
                  >
                    <Icon name={def.icon} size={15} />
                    <span>{def.short}</span>
                    {locked ? <small className="ops-sector__lock"><Icon name="Lock" size={9} />{def.relevance}</small> : null}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="ops-hint">
            {SECTORS[sector].description} A lista mostra as {MAX_CITIES} maiores cidades do país — a sede sempre aparece.
          </p>
          {city ? (
            <div className="ops-preview">
              <span><Icon name="Map" size={13} /> Mercado local de <strong>{money(cityMarketSize(city))}/ciclo</strong></span>
              <span><Icon name="Users" size={13} /> {fmt(city.pop)} habitantes</span>
              <span><Icon name="Store" size={13} /> sua fatia estimada: <strong>{Math.round(projectedShare * 100)}%</strong></span>
              {rivals.length ? (
                <span className="tone-red"><Icon name="AlertTriangle" size={13} /> {rivals.length} companhia(s) já operam aqui</span>
              ) : (
                <span className="tone-teal"><Icon name="Check" size={13} /> sem rivais na cidade</span>
              )}
              {projected ? (
                <span><Icon name="Coins" size={13} /> projeção: <strong className="tone-teal">{money(projected.net, true)}</strong>/ciclo</span>
              ) : null}
            </div>
          ) : null}
          {blockReason ? <p className="ops-block"><Icon name="Lock" size={13} /> {blockReason}</p> : null}
          <div className="ops-submit">
            <Cost cost={cost} stocks={player.stocks} />
            <button
              className="button button--primary"
              type="button"
              disabled={!city || !cost || Boolean(blockReason)}
              onClick={() => city && openOperation(city.id, sector)}
            >
              <Icon name="Plus" size={15} /> Abrir unidade
            </button>
          </div>
        </div>
      </div>
    </ViewShell>
  );
}
