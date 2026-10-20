import { useMemo, useState } from 'react';
import { CITY_BY_ID, COUNTRY_BY_ID } from '../game/atlas';
import { getCityPlan, type CityPlot } from '../game/cityPlan';
import { FACTIONS, GAME } from '../game/constants';
import { HQ_DISTRICTS } from '../game/hq';
import { cityLabel } from '../game/names';
import { SEAT_CITIES } from '../game/state';
import { useGameStore } from '../store/gameStore';
import { fmt } from './format';
import { Icon } from './Icon';
import { CityStage } from './city3d/CityStage';
import { Badge, cx } from './primitives';

export function SeatScreen() {
  const draft = useGameStore((s) => s.seatDraft);
  const chooseSeatCity = useGameStore((s) => s.chooseSeatCity);
  const chooseSeatPlot = useGameStore((s) => s.chooseSeatPlot);
  const cancelSeat = useGameStore((s) => s.cancelSeat);
  const seatMode = useGameStore((s) => s.seatMode);
  const foundSeat = useGameStore((s) => s.foundSeat);
  const [hover, setHover] = useState<{ plot: CityPlot; x: number; y: number } | null>(null);

  const plan = useMemo(() => getCityPlan(draft.cityId, 0), [draft.cityId]);
  const city = CITY_BY_ID[draft.cityId];
  const country = city ? COUNTRY_BY_ID[city.countryId] : null;
  const seatCities = useMemo(
    () => SEAT_CITIES.map((id) => CITY_BY_ID[id]).filter(Boolean),
    [],
  );
  const chosen = plan.plots.find((plot) => plot.id === draft.plotId) ?? null;
  const district = chosen ? HQ_DISTRICTS[chosen.district as keyof typeof HQ_DISTRICTS] : null;

  return (
    <div className="seat-screen">
      <header className="seat-head">
        <div className="seat-head__brand">
          <span className="brand__mark" aria-hidden="true"><span /><span /><span /></span>
          <div>
            <div className="eyebrow">{GAME.name} · {seatMode === 'existing' ? 'Nova sede' : GAME.subtitle}</div>
            <h1>Funde a sua sede</h1>
          </div>
        </div>
        <ol className="seat-steps">
          <li className={cx(draft.cityId && 'is-done')}><b>1</b> Cidade</li>
          <li className={cx(chosen && 'is-done')}><b>2</b> Lote</li>
          <li className={cx(chosen && 'is-next')}><b>3</b> Fundar</li>
        </ol>
        <button type="button" className="button button--quiet" onClick={cancelSeat}>
          <Icon name="ChevronLeft" size={15} /> Voltar
        </button>
      </header>

      <div className="seat-body">
        <aside className="seat-cities">
          <div className="seat-cities__title">
            <span>Cidades jogáveis</span>
            <Badge tone="neutral">{seatCities.length}</Badge>
          </div>
          {seatCities.map((option) => {
            const optionCountry = COUNTRY_BY_ID[option.countryId];
            const isActive = option.id === draft.cityId;
            return (
              <button
                key={option.id}
                type="button"
                className={cx('seat-city', isActive && 'is-active')}
                onClick={() => chooseSeatCity(option.id)}
              >
                <span className="seat-city__dot" style={{ background: FACTIONS.concordia.color }} />
                <span className="seat-city__body">
                  <strong>{cityLabel(option.name)}</strong>
                  <small>{optionCountry?.name ?? option.countryId} · {fmt(option.pop)} hab</small>
                </span>
                {option.capital ? <span className="seat-city__tag">capital</span> : null}
              </button>
            );
          })}
          <p className="seat-cities__hint">
            Só cidades dos países do Grupo Concórdia. A sede anexa o país escolhido e passa a comandar o comércio dele.
          </p>
        </aside>

        <section className="seat-stage">
          <CityStage
            cityId={draft.cityId}
            mode={chosen ? 'building' : 'select'}
            plotId={draft.plotId}
            onPickPlot={(plot) => chooseSeatPlot(plot.id, plot.district as 'Centro' | 'Expansão' | 'Periferia')}
            onHoverPlot={(plot, x, y) => setHover(plot ? { plot, x, y } : null)}
          >
            <div className="city-hud">
              <div className="city-hud__title">
                <strong>{cityLabel(city?.name)}</strong>
                <span>{country?.name} · {country?.continent} · {fmt(city?.pop ?? 0)} hab</span>
              </div>
              <div className="city-hud__stats">
                <span><b>{fmt(plan.stats.roadKm)}</b> km de vias</span>
                <span><b>{plan.stats.buildings}</b> edifícios</span>
                <span><b>{plan.stats.blocks}</b> quadras</span>
                <span><b>{Math.round(plan.stats.waterRatio * 100)}%</b> água</span>
              </div>
              {!chosen && (
                <div className="city-hud__prompt">
                  <Icon name="MousePointer2" size={13} />
                  Clique num lote dourado para escolher onde erguer a sede
                </div>
              )}
            </div>
            {hover && !chosen && (
              <div className="city-tooltip" style={{ left: hover.x + 14, top: hover.y + 12 }}>
                <strong>{hover.plot.id}</strong>
                <span>{hover.plot.district} · lote {hover.plot.w}×{hover.plot.d} m</span>
                <small>{HQ_DISTRICTS[hover.plot.district as keyof typeof HQ_DISTRICTS].description}</small>
              </div>
            )}
          </CityStage>
        </section>

        <aside className="seat-panel">
          <div className="seat-panel__section">
            <div className="eyebrow">Terreno real</div>
            <p className="seat-panel__text">
              Costa, rios e lagoas vêm do recorte geográfico de {cityLabel(city?.name)} (Natural Earth).
              Ruas locais, quadras e prédios são gerados de forma determinística a partir desse relevo.
            </p>
            <div className="seat-facts">
              <span><b>{plan.stats.blocks}</b> quadras</span>
              <span><b>{fmt(plan.stats.roadKm)}</b> km de ruas</span>
              <span><b>{plan.plots.length}</b> lotes livres</span>
              <span><b>{Math.round(plan.stats.parkArea / 10000)}</b> ha de parque</span>
            </div>
          </div>

          <div className="seat-panel__section">
            <div className="eyebrow">Lote da sede</div>
            {chosen && district ? (
              <div className="seat-choice">
                <div className="seat-choice__id">
                  <Icon name="Building2" size={16} />
                  <div>
                    <strong>{chosen.id}</strong>
                    <span>{chosen.district} · {chosen.w}×{chosen.d} m</span>
                  </div>
                </div>
                <p>{district.description}</p>
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
                <button type="button" className="button button--ghost button--block" onClick={() => chooseSeatCity(draft.cityId)}>
                  <Icon name="RotateCcw" size={14} /> Trocar de lote
                </button>
              </div>
            ) : (
              <p className="seat-panel__text seat-panel__text--muted">
                Nenhum lote escolhido. A sede define o distrito inicial e o bônus econômico permanente da capital.
              </p>
            )}
          </div>

          <div className="seat-panel__section seat-panel__section--foot">
            <button
              type="button"
              className="button button--primary button--large button--block"
              disabled={!chosen}
              onClick={foundSeat}
            >
              <Icon name="Landmark" size={16} />
              {seatMode === 'existing' ? 'Mudar a sede' : 'Fundar a sede'}
            </button>
            <small>
              {seatMode === 'existing'
                ? 'A sede muda de cidade e de distrito. A capital passa a ser o país de acolhimento.'
                : 'O país-sede é anexado ao Grupo Concórdia. O restante da Partilha segue igual.'}
            </small>
          </div>
        </aside>
      </div>
    </div>
  );
}
