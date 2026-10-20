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
import { averageOperationShare, cityMarketSize, operationCost, operationOutput, operationsOf, operationsSummary } from '../game/operations';
import type { SectorKey } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { fmt } from './format';
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
    const seat = seatId ? pool.find((city) => city.id === seatId) : undefined;
    const shortlist = pool.slice(0, MAX_CITIES);
    // A sede da companhia nunca fica fora da lista, mesmo em países grandes.
    return seat && !shortlist.some((city) => city.id === seat.id) ? [seat, ...shortlist.slice(0, MAX_CITIES - 1)] : shortlist;
  }, [countryId, operations, detailReady, game.city]);
  const [cityId, setCityId] = useState('');
  useEffect(() => {
    if (!cities.some((city) => city.id === cityId)) setCityId(cities[0]?.id ?? '');
  }, [cities, cityId]);
  const city = cityById(cityId);
  const cost = city ? operationCost(city, sector, 1) : null;

  // Rivalidade: quem mais opera na cidade escolhida.
  const rivals = useMemo(() => {
    if (!city) return [];
    const counts = new Map<string, number>();
    for (const op of game.operations) {
      if (op.cityId !== city.id) continue;
      counts.set(op.factionId, (counts.get(op.factionId) ?? 0) + op.level);
    }
    return [...counts.entries()]
      .filter(([id]) => id !== playerId)
      .map(([id, level]) => ({ id, level }));
  }, [city, game.operations, playerId]);

  const margin = summary.revenue - summary.upkeep;
  const marginPct = summary.revenue > 0 ? margin / summary.revenue : 0;

  return (
    <ViewShell
      eyebrow="Rede de filiais"
      title="Empresas e operações"
      subtitle="Cada cidade é um mercado. Abra filiais nos países que administra, dispute participação com as rivais e transforme presença local em caixa por ciclo."
      icon="Store"
      actions={<Badge tone="gold" icon="Coins">{fmt(summary.revenue)} cr./ciclo</Badge>}
    >
      <div className="summary-grid summary-grid--4">
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Store" size={14} /> Filiais ativas</span>
          <strong>{operations.length}</strong>
          <span className="summary-card__delta">em {new Set(operations.map((op) => op.countryId)).size} países</span>
          <small>Cada cidade aceita uma filial por companhia.</small>
        </div>
        <div className="summary-card summary-card--gold">
          <span className="summary-card__label"><Icon name="Coins" size={14} /> Receita operacional</span>
          <strong>{fmt(summary.revenue)}</strong>
          <span className="summary-card__delta">{fmt(summary.upkeep)} de custo</span>
          <small>Margem de {Math.round(marginPct * 100)}% neste ciclo.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="TrendingUp" size={14} /> Resultado</span>
          <strong className={margin >= 0 ? 'tone-teal' : 'tone-red'}>{margin >= 0 ? '+' : ''}{fmt(margin)}</strong>
          <span className="summary-card__delta">créditos por ciclo</span>
          <small>Inclui insumos e manutenção das filiais.</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Handshake" size={14} /> Participação média</span>
          <strong>{Math.round(averageOperationShare(game, playerId) * 100)}%</strong>
          <span className="summary-card__delta">nos mercados ativos</span>
          <small>Filiais rivais dividem o mercado da cidade.</small>
        </div>
      </div>

      <div className="view-card">
        <SectionHeader
          eyebrow="Portfólio"
          title={operations.length ? 'Filiais da companhia' : 'Nenhuma filial aberta'}
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
              return (
                <div className="ops-row" key={operation.id}>
                  <span className="ops-row__icon" style={{ color: meta.color }}>
                    <Icon name={meta.icon} size={17} />
                  </span>
                  <div className="ops-row__name">
                    <strong>{host?.name ?? operation.cityId}</strong>
                    <small>{meta.name} · {country?.name ?? operation.countryId} · {Math.round(host?.pop ?? 0).toLocaleString('pt-BR')} hab</small>
                  </div>
                  <div className="ops-row__share">
                    <span className="muted tiny">participação</span>
                    <strong>{Math.round(out.share * 100)}%</strong>
                    <ProgressBar value={out.share * 100} max={100} tone="teal" thin />
                  </div>
                  <div className="ops-row__money">
                    <span className="muted tiny">receita / custo</span>
                    <strong className="tone-teal">{fmt(out.revenue)}</strong>
                    <small>−{fmt(out.upkeep)}</small>
                  </div>
                  <div className="ops-row__level">
                    <span className="muted tiny">nível</span>
                    <strong>{operation.level} / 3</strong>
                  </div>
                  <div className="ops-row__actions">
                    <button
                      className="button button--tiny"
                      type="button"
                      disabled={operation.level >= 3 || !host}
                      title={host ? `Custo: ${operationCost(host, operation.sector, operation.level + 1).creditos} créditos` : undefined}
                      onClick={() => upgradeOperation(operation.id)}
                    >
                      {operation.level >= 3 ? 'Máximo' : 'Expandir'}
                    </button>
                    <button
                      className="button button--tiny button--ghost"
                      type="button"
                      onClick={() => closeOperation(operation.id)}
                    >
                      Encerrar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="muted small">
            Abra a primeira filial abaixo. Varejo em cidades grandes costuma pagar o investimento em poucos ciclos.
          </p>
        )}
      </div>

      <div className="view-card">
        <SectionHeader eyebrow="Expansão" title="Abrir nova filial" icon="Plus" />
        <div className="ops-open">
          <label className="ops-field">
            <span className="eyebrow">País</span>
            <select value={countryId} onChange={(event) => setCountryId(event.target.value)}>
              {tiles.length ? tiles.map((tile) => (
                <option key={tile.id} value={tile.id}>{tile.name}</option>
              )) : <option value="">Nenhum país administrado</option>}
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
            <span className="eyebrow">Linha de negócio</span>
            <div className="ops-sectors">
              {SECTOR_ORDER.map((key) => {
                const def = SECTORS[key];
                return (
                  <button
                    key={key}
                    type="button"
                    className={cx('ops-sector', sector === key && 'is-active')}
                    onClick={() => setSector(key)}
                    title={def.description}
                  >
                    <Icon name={def.icon} size={15} />
                    <span>{def.short}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <p className="ops-hint">
            {SECTORS[sector].description} O seletor mostra as {MAX_CITIES} maiores cidades do país — a sua sede aparece sempre.
          </p>
          {city ? (
            <div className="ops-preview">
              <span><Icon name="Map" size={13} /> Mercado local estimado em <strong>{fmt(cityMarketSize(city))} cr./ciclo</strong></span>
              <span><Icon name="Users" size={13} /> {fmt(city.pop)} habitantes</span>
              {rivals.length ? (
                <span className="tone-red"><Icon name="AlertTriangle" size={13} /> {rivals.length} companhia(s) já operam aqui</span>
              ) : (
                <span className="tone-teal"><Icon name="Check" size={13} /> mercado sem concorrência</span>
              )}
            </div>
          ) : null}
          <div className="ops-submit">
            <Cost cost={cost} stocks={player.stocks} />
            <button
              className="button button--primary"
              type="button"
              disabled={!city || !cost}
              onClick={() => city && openOperation(city.id, sector)}
            >
              <Icon name="Plus" size={15} /> Abrir filial
            </button>
          </div>
        </div>
      </div>
    </ViewShell>
  );
}
