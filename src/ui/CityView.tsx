import { useMemo, useState } from 'react';
import { COUNTRY_BY_ID, cityById } from '../game/atlas';
import { getCityPlan } from '../game/cityPlan';
import { FACTIONS, HQ_STAGES, MAX_HQ_BUILD } from '../game/constants';
import { developmentOf, moneyOf, SALARY_PER_POP, TAX_PER_POP, territoryProduction } from '../game/economy';
import { HQ_DISTRICTS, seatBuildLevel } from '../game/hq';
import { cityLabel } from '../game/names';
import { useGameStore } from '../store/gameStore';
import { CityStage } from './city3d/CityStage';
import { fmt, money, trendClass } from './format';
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
  const hqLevel = game ? seatBuildLevel(game) : 0;
  const hqStage = HQ_STAGES[hqLevel];

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
    ? [
      { key: 'receita', label: 'Operação e edifícios', value: moneyOf(production.base) + moneyOf(production.nodes) + moneyOf(production.buildings), tone: 'teal' },
      { key: 'comercio', label: 'Rede comercial', value: production.commerceBase, tone: 'teal' },
      { key: 'vendas', label: 'Vendas urbanas', value: (capital?.pop ?? 0) * TAX_PER_POP, tone: 'teal' },
      { key: 'custos', label: 'Pessoal e manutenção', value: -(capital?.pop ?? 0) * SALARY_PER_POP - production.upkeep, tone: 'red' },
    ]
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
            stage={hqLevel}
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
              <div className="eyebrow">Sede do grupo</div>
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
                        <span className="city-flow__icon" style={{ color: entry.tone === 'red' ? '#e39a80' : 'var(--gold)' }}>
                          <Icon name={entry.tone === 'red' ? 'ArrowDownRight' : 'ArrowUpRight'} size={16} />
                        </span>
                        <span>{entry.label}</span>
                        <b className={trendClass(entry.value)}>{money(entry.value, true)}</b>
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
                    <Icon name="Hammer" size={14} /> Abrir estruturas
                  </button>
                </section>
              </>
            ) : (
              <>
                <section>
                  <SectionHeader
                    eyebrow="Construção da sede"
                    title={hqStage.name}
                    icon="Blocks"
                    action={<Badge tone="gold" icon="Building2">{hqStage.floors} pisos</Badge>}
                  />
                  <p className="city-side__text">{hqStage.description}</p>
                  <ProgressBar value={hqLevel} max={MAX_HQ_BUILD} tone="gold" thin />
                  <div className="seat-facts">
                    <span><b>+{Math.round(hqStage.commerce * 100)}%</b> comércio local</span>
                    <span><b>{HQ_STAGES.slice(0, hqLevel + 1).reduce((sum, item) => sum + item.admin, 0)}</b> vagas extras</span>
                  </div>
                  <button type="button" className="button button--gold button--block" onClick={() => setView('units')}>
                    <Icon name="Blocks" size={14} /> Abrir Construção
                  </button>
                </section>

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
