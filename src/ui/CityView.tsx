import { useMemo, useState } from 'react';
import { COUNTRY_BY_ID, cityById } from '../game/atlas';
import { getCityPlan } from '../game/cityPlan';
import { FACTIONS, RESOURCES, RESOURCE_KEYS } from '../game/constants';
import { developmentOf, territoryProduction } from '../game/economy';
import { HQ_DISTRICTS } from '../game/hq';
import { cityLabel } from '../game/names';
import { useGameStore } from '../store/gameStore';
import { CityStage } from './city3d/CityStage';
import { fmt, fmtRate, trendClass } from './format';
import { ResourceGlyph } from './art/Glyph';
import { Icon } from './Icon';
import { Badge, cx, ProgressBar, SectionHeader } from './primitives';

/** Pisos do corte da sede: o número visível mostra até onde a maquete está aberta. */
const FLOOR_LABELS: Array<[number, string]> = [
  [1, 'Térreo'],
  [2, 'Escritório'],
  [3, 'Reuniões'],
  [4, 'Direção'],
];

export function CityView() {
  const game = useGameStore((s) => s.game);
  const cityMode = useGameStore((s) => s.cityMode);
  const setCityMode = useGameStore((s) => s.setCityMode);
  const setView = useGameStore((s) => s.setView);
  const openSeat = useGameStore((s) => s.openSeat);
  const [tab, setTab] = useState<'gestao' | 'sede'>('gestao');
  const [floor, setFloor] = useState(1);

  const seat = game?.city ?? null;
  const plan = useMemo(() => (seat ? getCityPlan(seat.cityId, 0) : null), [seat]);
  const plot = useMemo(
    () => (plan && seat ? plan.plots.find((candidate) => candidate.id === seat.plotId) ?? null : null),
    [plan, seat],
  );
  const city = seat ? cityById(seat.cityId) : null;
  const country = seat ? COUNTRY_BY_ID[seat.countryId] : null;

  if (!game) return null;

  if (!seat || !plan || !city) {
    return (
      <div className="view-workspace">
        <div className="city-empty">
          <Icon name="Building2" size={28} />
          <h2>Nenhuma sede fundada</h2>
          <p>
            Escolha uma cidade real no mapa-múndi, veja o terreno e as ruas geradas e marque o lote da sua
            primeira construção. O distrito escolhido altera comércio, indústria ou defesa da capital.
          </p>
          <button type="button" className="button button--primary" onClick={() => openSeat('existing')}>
            <Icon name="Landmark" size={15} /> Escolher cidade-sede
          </button>
        </div>
      </div>
    );
  }

  const capital = game.tiles[game.factions[game.playerFactionId].capitalId];
  const player = game.factions[game.playerFactionId];
  const production = capital ? territoryProduction(game, capital, player) : null;
  const dev = capital ? developmentOf(capital) : 0;
  const district = HQ_DISTRICTS[seat.district];
  const flow = production
    ? RESOURCE_KEYS.map((key) => ({
      key,
      value:
        (production.base[key] ?? 0) +
        (production.nodes[key] ?? 0) +
        (production.buildings[key] ?? 0) +
        (key === 'creditos' ? production.commerceBase : 0),
    })).sort((a, b) => b.value - a.value).slice(0, 4)
    : [];

  return (
    <div className="view-workspace city-view">
      <div className="city-layout">
        <section className="city-main">
          <CityStage
            cityId={seat.cityId}
            mode={cityMode}
            plotId={seat.plotId}
            floor={floor}
            onEnterBuilding={() => setCityMode('interior')}
            onFail={() => setCityMode('overview')}
          >
            <div className="city-toolbar">
              <div className="segmented" role="tablist" aria-label="Câmera da cidade">
                <button
                  type="button"
                  className={cx(cityMode === 'overview' && 'is-active')}
                  onClick={() => setCityMode('overview')}
                  role="tab"
                  aria-selected={cityMode === 'overview'}
                >
                  <Icon name="Map" size={13} /> Cidade
                </button>
                <button
                  type="button"
                  className={cx(cityMode === 'building' && 'is-active')}
                  onClick={() => setCityMode('building')}
                  role="tab"
                  aria-selected={cityMode === 'building'}
                >
                  <Icon name="Building2" size={13} /> Sede
                </button>
                <button
                  type="button"
                  className={cx(cityMode === 'interior' && 'is-active')}
                  onClick={() => setCityMode('interior')}
                  role="tab"
                  aria-selected={cityMode === 'interior'}
                >
                  <Icon name="DoorOpen" size={13} /> Interior
                </button>
              </div>
              <button type="button" className="button button--quiet button--small" onClick={() => setView('map')}>
                <Icon name="Globe2" size={13} /> Mapa-múndi
              </button>
            </div>

            <div className="city-caption">
              <strong>{cityLabel(city.name)}</strong>
              <span>
                {country?.name} · {seat.district} · lote {seat.plotId}
                {cityMode === 'building' ? ' · corte aberto' : ''}
              </span>
            </div>

            {cityMode === 'building' && (
              <div className="city-floors" role="group" aria-label="Pisos no corte da sede">
                <span className="city-floors__label">Pisos</span>
                {FLOOR_LABELS.map(([level, label]) => (
                  <button
                    key={level}
                    type="button"
                    className={cx('city-floors__button', floor === level && 'is-active')}
                    aria-pressed={floor === level}
                    title={`${label} — até ${level} ${level === 1 ? 'piso' : 'pisos'} visíveis`}
                    onClick={() => setFloor(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            )}

            {cityMode === 'interior' && (
              <div className="city-inside">
                <div>
                  <strong>Sala de comando</strong>
                  <span>Vista real para os prédios vizinhos através das janelas.</span>
                </div>
                <button type="button" className="button button--ghost button--small" onClick={() => setCityMode('building')}>
                  <Icon name="ChevronLeft" size={13} /> Voltar à fachada
                </button>
              </div>
            )}
          </CityStage>
        </section>

        <aside className="city-side">
          <header className="city-side__head">
            <div>
              <div className="eyebrow">Sede da Casa</div>
              <h2>{cityLabel(city.name)}</h2>
              <span>{country?.name} · fundada no ciclo {seat.foundedCycle}</span>
            </div>
            <span className="crest" style={{ borderColor: FACTIONS.concordia.color, color: FACTIONS.concordia.color }}>
              {FACTIONS.concordia.short.slice(0, 1)}
            </span>
          </header>

          <div className="context-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'gestao'}
              className={cx('context-tab', tab === 'gestao' && 'is-active')}
              onClick={() => setTab('gestao')}
            >
              Gestão
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'sede'}
              className={cx('context-tab', tab === 'sede' && 'is-active')}
              onClick={() => setTab('sede')}
            >
              Sede
            </button>
          </div>

          <div className="city-side__scroll">
            {tab === 'gestao' ? (
              <>
                <div className="city-kpis">
                  <div>
                    <span>Desenvolvimento</span>
                    <strong>{dev}</strong>
                    <ProgressBar value={dev} max={90} tone="teal" thin />
                  </div>
                  <div>
                    <span>População</span>
                    <strong>{fmt(capital?.pop ?? 0)}</strong>
                    <small>hab. no país-sede</small>
                  </div>
                  <div>
                    <span>Distrito</span>
                    <strong>{seat.district}</strong>
                    <small>{district.label}</small>
                  </div>
                </div>

                <section>
                  <SectionHeader eyebrow="Produção local" title="Fluxo da capital" icon="Factory" />
                  <div className="city-flow">
                    {flow.map((entry) => (
                      <div className="city-flow__row" key={entry.key}>
                        <span className="city-flow__icon" style={{ color: RESOURCES[entry.key].color }}>
                          <ResourceGlyph resource={entry.key} size={16} />
                        </span>
                        <span>{RESOURCES[entry.key].label}</span>
                        <b className={trendClass(entry.value)}>{fmtRate(entry.value)}</b>
                      </div>
                    ))}
                    {!flow.length && <p className="city-side__muted">Sem produção registrada neste ciclo.</p>}
                  </div>
                </section>

                <section>
                  <SectionHeader eyebrow="Estruturas" title="No país-sede" icon="Landmark" />
                  <div className="city-buildings">
                    {capital
                      ? (Object.entries(capital.buildings) as Array<[keyof typeof capital.buildings, number]>)
                        .filter(([, level]) => level > 0)
                        .sort((a, b) => b[1] - a[1])
                        .map(([key, level]) => (
                          <span key={key} className="city-building-chip">
                            {key}<b>{level}</b>
                          </span>
                        ))
                      : null}
                  </div>
                  <button type="button" className="button button--ghost button--block" onClick={() => setView('construction')}>
                    <Icon name="Hammer" size={14} /> Abrir obras
                  </button>
                </section>
              </>
            ) : (
              <>
                <section>
                  <SectionHeader eyebrow="Lote escolhido" title={seat.plotId} icon="Building2" />
                  <p className="city-side__text">{district.description}</p>
                  <ul className="seat-choice__effects">
                    <li className={district.commerce >= 0 ? 'is-pos' : 'is-neg'}>
                      {district.commerce >= 0 ? '+' : ''}{Math.round(district.commerce * 100)}% comércio
                    </li>
                    <li className={district.production > 0 ? 'is-pos' : 'is-neg'}>
                      {district.production >= 0 ? '+' : ''}{Math.round(district.production * 100)}% indústria e extração
                    </li>
                    <li className={district.defense >= 0 ? 'is-pos' : 'is-neg'}>
                      {district.defense >= 0 ? '+' : ''}{Math.round(district.defense * 100)}% defesa
                    </li>
                  </ul>
                </section>

                <section>
                  <SectionHeader eyebrow="Malha urbana" title="Dados da cidade" icon="Route" />
                  <div className="seat-facts seat-facts--stack">
                    <span><b>{fmt(plan.stats.roadKm)}</b> km de vias</span>
                    <span><b>{plan.stats.blocks}</b> quadras</span>
                    <span><b>{plan.stats.buildings}</b> edifícios</span>
                    <span><b>{Math.round(plan.stats.waterRatio * 100)}%</b> de água</span>
                    <span><b>{Math.round(plan.stats.parkArea / 10000)}</b> ha de áreas verdes</span>
                    <span><b>{Math.round(plan.stats.tallest)} m</b> edifício mais alto</span>
                  </div>
                </section>

                <section>
                  <SectionHeader eyebrow="Câmera" title="Ver de perto" icon="Eye" />
                  <div className="city-camera">
                    <button type="button" className="button button--ghost" onClick={() => setCityMode('building')}>
                      <Icon name="Building2" size={14} /> Abrir o corte da sede
                    </button>
                    <button type="button" className="button button--ghost" onClick={() => setCityMode('interior')}>
                      <Icon name="DoorOpen" size={14} /> Entrar no prédio
                    </button>
                  </div>
                </section>
              </>
            )}
          </div>

          <footer className="city-side__foot">
            <Badge tone="teal" icon="Map">{fmt(Object.keys(game.tiles).length)} países</Badge>
            <span className="city-side__muted">Sede real, regras reais: o distrito já entra no cálculo do ciclo.</span>
          </footer>
        </aside>
      </div>
    </div>
  );
}

export function MiniCityBadge({ cityId }: { cityId: string }) {
  const city = cityById(cityId);
  return <span className="mini-city">{cityLabel(city?.name)}</span>;
}
