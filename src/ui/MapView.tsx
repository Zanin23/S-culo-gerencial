import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ATLAS_STATS,
  CITIES,
  cityById,
  COUNTRIES,
  COUNTRY_BY_ID,
  GLOBAL_CITIES,
  OUTLINE,
  PROVINCE_BY_ID,
  PROVINCES,
  loadCountryDetail,
  type CountryDetail,
} from '../game/atlas';
import { FACTIONS, GAME, TERRAIN } from '../game/constants';
import { claimableNeighbors, countryInfo, tilesOfFaction } from '../game/map';
import { capitalLabel, cityLabel } from '../game/names';
import type { FactionId, Tile } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { FACTION_HATCH_ANGLE, IllustratedAtlas, type IllustratedAtlasHandle } from './art/IllustratedAtlas';
import { FlatAtlas, type FlatAtlasHandle } from './FlatAtlas';
import { fmt } from './format';
import type { GlobeMap, GlobeHover } from './globe/globe';
import { supportsWebGL } from './globe/webgl';
import { TerrainGlyph } from './art/Glyph';
import { Icon } from './Icon';
import { cx } from './primitives';

type MapMode = 'atlas' | '3d' | '2d';
type GlobeModule = typeof import('./globe/globe');

interface TooltipState {
  kind: 'country' | 'province' | 'city';
  id: string;
  x: number;
  y: number;
}

function useCountryDetail(iso: string | null) {
  const [detail, setDetail] = useState<CountryDetail | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'failed'>('idle');

  useEffect(() => {
    if (!iso) {
      setDetail(null);
      setStatus('idle');
      return;
    }
    let alive = true;
    setDetail(null);
    setStatus('loading');
    loadCountryDetail(iso)
      .then((next) => {
        if (!alive) return;
        if (next) {
          setDetail(next);
          setStatus('ready');
        } else {
          setDetail(null);
          setStatus('failed');
        }
      })
      .catch(() => {
        if (!alive) return;
        setDetail(null);
        setStatus('failed');
      });
    return () => {
      alive = false;
    };
  }, [iso]);

  return { detail, status };
}

export function MapView() {
  const tiles = useGameStore((s) => s.game?.tiles);
  const playerId = useGameStore((s) => s.game?.playerFactionId);
  const selectedTileId = useGameStore((s) => s.selectedTileId);
  const selectedProvinceId = useGameStore((s) => s.selectedProvinceId);
  const selectedCityId = useGameStore((s) => s.selectedCityId);
  const focusCountryId = useGameStore((s) => s.focusCountryId);
  const selectCountry = useGameStore((s) => s.selectCountry);
  const selectProvince = useGameStore((s) => s.selectProvince);
  const selectCity = useGameStore((s) => s.selectCity);
  const clearSelection = useGameStore((s) => s.clearSelection);
  const focusCountry = useGameStore((s) => s.focusCountry);

  const [webgl] = useState(() => supportsWebGL());
  // O atlas ilustrado é a tela principal do jogo; globo e carta ficam como
  // leituras alternativas do mesmo estado.
  const [mode, setMode] = useState<MapMode>('atlas');
  const [globeModule, setGlobeModule] = useState<GlobeModule | null>(null);
  const [showCities, setShowCities] = useState(true);
  const [showBorders, setShowBorders] = useState(true);
  const [hover, setHover] = useState<TooltipState | null>(null);
  const [globeFailed, setGlobeFailed] = useState(false);

  const viewRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const globeRef = useRef<GlobeMap | null>(null);
  const flatRef = useRef<FlatAtlasHandle | null>(null);
  const atlasRef = useRef<IllustratedAtlasHandle | null>(null);

  // three.js pesa ~600 kB: carrega só quando há WebGL e o globo está visível.
  useEffect(() => {
    if (!webgl || globeFailed || mode !== '3d' || globeModule) return;
    let cancelled = false;
    import('./globe/globe')
      .then((module) => {
        if (!cancelled) setGlobeModule(() => module);
      })
      .catch(() => {
        if (!cancelled) setGlobeFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [webgl, globeFailed, mode, globeModule]);

  const resolvedFocus = focusCountryId;
  const { detail, status: detailStatus } = useCountryDetail(resolvedFocus);

  const claimable = useMemo(
    () => new Set((tiles && playerId ? claimableNeighbors(tiles, playerId) : []).map((tile) => tile.id)),
    [tiles, playerId],
  );

  const globeState = useMemo(() => {
    if (!tiles || !playerId) return null;
    return {
      tiles,
      shapes: OUTLINE,
      focusCountryId: resolvedFocus,
      selectedCountryId: selectedTileId,
      selectedProvinceId,
      selectedCityId,
      detail,
      playerId,
      claimable,
      showCities,
      showBorders,
    };
  }, [tiles, resolvedFocus, selectedTileId, selectedProvinceId, selectedCityId, detail, playerId, claimable, showCities, showBorders]);

  const globeReady = mode === '3d' && !globeFailed && Boolean(globeState) && Boolean(globeModule);
  const globePending = mode === '3d' && !globeFailed && webgl && !globeModule;
  const active = globeReady;

  useEffect(() => {
    if (!active || !globeModule || !mountRef.current) return;
    let globe: GlobeMap;
    try {
      globe = new globeModule.GlobeMap(mountRef.current, {
        onSelectCountry: (id, focus) => selectCountry(id, focus),
        onSelectProvince: (id) => selectProvince(id),
        onSelectCity: (id) => selectCity(id),
        onClear: () => clearSelection(),
        onHover: (next: GlobeHover | null) => {
          setHover(next ? { kind: next.kind, id: next.id, x: next.x, y: next.y } : null);
        },
        onFail: () => setGlobeFailed(true),
      });
    } catch {
      mountRef.current?.replaceChildren();
      setGlobeFailed(true);
      return;
    }
    globeRef.current = globe;
    return () => {
      globe.dispose();
      globeRef.current = null;
    };
  }, [active, globeModule, selectCountry, selectProvince, selectCity, clearSelection]);

  useEffect(() => {
    if (!globeState || !globeRef.current) return;
    globeRef.current.setState(globeState);
  }, [globeState, active]);

  const zoom = useCallback((factor: number) => {
    if (mode === '3d') globeRef.current?.zoomBy(factor);
    else if (mode === '2d') flatRef.current?.zoom(factor);
    else atlasRef.current?.zoom(factor);
  }, [mode]);

  const reset = useCallback(() => {
    if (mode === '3d') globeRef.current?.resetView();
    else if (mode === '2d') flatRef.current?.reset();
    else atlasRef.current?.reset();
    focusCountry(null);
  }, [mode, focusCountry]);

  const owner = selectedTileId && tiles ? tiles[selectedTileId]?.owner ?? null : null;
  const playerFaction = playerId ? FACTIONS[playerId] : null;
  const ownCount = tiles && playerId ? tilesOfFaction(tiles, playerId).length : 0;

  const tooltip = useMemo(() => {
    if (!hover || !tiles) return null;
    if (hover.kind === 'country') {
      const tile = tiles[hover.id];
      const info = countryInfo(hover.id);
      if (!tile || !info) return null;
      return {
        x: hover.x,
        y: hover.y,
        title: tile.name,
        subtitle: `${info.continent} · ${capitalLabel(info.capital)}`,
        accent: tile.owner ? FACTIONS[tile.owner].color : '#6a7883',
        meta: `${fmt(tile.pop)} hab · ${info.provinces} províncias`,
        text: tile.owner ? FACTIONS[tile.owner].name : claimable.has(hover.id) ? 'Elegível para expansão' : 'Território neutro',
        foot: `${TERRAIN[tile.terrain].name} · valor estratégico ${tile.strategic}/3`,
        terrain: tile.terrain,
        claim: claimable.has(hover.id),
      };
    }
    if (hover.kind === 'province') {
      const province = PROVINCE_BY_ID[hover.id];
      if (!province) return null;
      const parent = tiles[province.countryId];
      return {
        x: hover.x,
        y: hover.y,
        title: province.name,
        subtitle: `${parent?.name ?? province.countryId}${province.capital ? ' · capital' : ''}`,
        accent: '#d8b46a',
        meta: `${fmt(province.pop)} hab · ${province.cities} cidades`,
        text: 'Província / estado',
        foot: 'Clique para inspecionar a divisão interna',
        terrain: null,
        claim: false,
      };
    }
    const city = cityById(hover.id);
    if (!city) return null;
    return {
      x: hover.x,
      y: hover.y,
      title: cityLabel(city.name),
      subtitle: `${tiles[city.countryId]?.name ?? ''}${city.capital ? ' · capital nacional' : ''}`,
      accent: '#7bb2e8',
      meta: `${fmt(city.pop)} hab`,
      text: 'Cidade',
      foot: 'Clique para abrir a ficha da cidade',
      terrain: null,
      claim: false,
    };
  }, [hover, tiles, claimable]);

  const sortedCountries = useMemo(() => [...COUNTRIES].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')), []);
  // O localizador enxerga o país selecionado mesmo sem foco (clique simples),
  // mas só carrega a malha interna do país focado.
  const locateCountry = focusCountryId ?? selectedTileId;
  const focusProvinces = useMemo(
    () => (locateCountry
      ? PROVINCES.filter((province) => province.countryId === locateCountry)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
      : []),
    [locateCountry],
  );
  const focusCities = useMemo(
    () => (locateCountry ? CITIES.filter((city) => city.countryId === locateCountry).sort((a, b) => b.pop - a.pop) : []),
    [locateCountry],
  );
  const ensureFocus = () => {
    if (!focusCountryId && locateCountry) focusCountry(locateCountry);
  };

  const provinceInfo = selectedProvinceId ? PROVINCE_BY_ID[selectedProvinceId] : null;
  const cityInfo = selectedCityId ? cityById(selectedCityId) ?? null : null;
  const drill = provinceInfo ?? cityInfo;
  const drillName = provinceInfo ? provinceInfo.name : cityLabel(cityInfo?.name);

  if (!tiles || !playerId || !globeState) {
    return (
      <div className="map-view map-view--loading">
        <div className="globe-loading">
          <span className="globe-loading__orbit" />
          <strong>Preparando o mapa-múndi</strong>
          <span>Montando países, províncias e cidades…</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={viewRef} className={cx('map-view', mode === '3d' && 'map-view--3d')}>
      <div
        ref={mountRef}
        className={cx('globe-stage', (!active || globeFailed) && 'is-hidden')}
        aria-hidden={!active}
      />

      {mode === 'atlas' && (
        <IllustratedAtlas
          ref={atlasRef}
          tiles={tiles}
          shapes={OUTLINE}
          detail={detail}
          focusCountryId={resolvedFocus}
          selectedCountryId={selectedTileId}
          selectedProvinceId={selectedProvinceId}
          selectedCityId={selectedCityId}
          playerId={playerId}
          claimable={claimable}
          showCities={showCities}
          onSelectCountry={(id, focus) => selectCountry(id, focus)}
          onSelectProvince={(id) => selectProvince(id)}
          onSelectCity={(id) => selectCity(id)}
          onHover={(next) => setHover(next)}
          onClear={() => clearSelection()}
        />
      )}

      {mode === '2d' && (
        <FlatAtlas
          ref={flatRef}
          tiles={tiles}
          shapes={OUTLINE}
          detail={detail}
          focusCountryId={resolvedFocus}
          selectedCountryId={selectedTileId}
          selectedProvinceId={selectedProvinceId}
          selectedCityId={selectedCityId}
          playerId={playerId}
          claimable={claimable}
          showCities={showCities}
          onSelectCountry={(id, focus) => selectCountry(id, focus)}
          onSelectProvince={(id) => selectProvince(id)}
          onSelectCity={(id) => selectCity(id)}
          onClear={() => clearSelection()}
        />
      )}

      {mode === '3d' && globePending && (
        <div className="globe-loading">
          <span className="globe-loading__orbit" />
          <strong>Montando o globo</strong>
          <span>Carregando relevo e fronteiras…</span>
        </div>
      )}

      <div className="map-title">
        <strong>{GAME.world}</strong>
        <span>
          {mode === '3d' ? 'Globo interativo' : mode === '2d' ? 'Carta plana' : 'Atlas ilustrado'} · {fmt(Object.keys(tiles).length)} países ·{' '}
          {fmt(PROVINCES.length)} províncias · {fmt(ATLAS_STATS.cities)} cidades
        </span>
      </div>

      <div className="map-locate">
        <label>
          <span>País</span>
          <select
            value={selectedTileId ?? ''}
            onChange={(event) => {
              const iso = event.target.value;
              if (iso) selectCountry(iso, true);
            }}
            aria-label="Localizar país"
          >
            <option value="">Selecionar país…</option>
            {sortedCountries.map((country) => (
              <option key={country.id} value={country.id}>{country.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Província</span>
          <select
            value={selectedProvinceId ?? ''}
            disabled={!locateCountry || !focusProvinces.length}
            onChange={(event) => {
              ensureFocus();
              selectProvince(event.target.value || null);
            }}
            aria-label="Localizar província ou estado"
          >
            <option value="">{`Selecionar província… (${focusProvinces.length})`}</option>
            {focusProvinces.map((province) => (
              <option key={province.id} value={province.id}>{province.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Cidade</span>
          <select
            value={selectedCityId ?? ''}
            disabled={!locateCountry || !focusCities.length}
            onChange={(event) => {
              ensureFocus();
              selectCity(event.target.value || null);
            }}
            aria-label="Localizar cidade"
          >
            <option value="">{focusCities.length ? 'Selecionar cidade…' : 'Sem cidades'}</option>
            {focusCities.map((city) => (
              <option key={city.id} value={city.id}>{cityLabel(city.name)}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="map-controls" role="toolbar" aria-label="Controles do mapa">
        <button type="button" className="map-control" onClick={() => zoom(1.22)} aria-label="Aproximar" title="Aproximar">
          <Icon name="Plus" size={15} />
        </button>
        <button type="button" className="map-control" onClick={() => zoom(0.82)} aria-label="Afastar" title="Afastar">
          <Icon name="Minus" size={15} />
        </button>
        <button type="button" className="map-control" onClick={reset} aria-label="Recentrar" title="Recentrar">
          <Icon name="Compass" size={15} />
        </button>
        <button
          type="button"
          className={cx('map-control', showCities && 'is-active')}
          onClick={() => setShowCities((value) => !value)}
          aria-pressed={showCities}
          aria-label="Mostrar cidades"
          title="Mostrar cidades"
        >
          <Icon name="MapPin" size={15} />
        </button>
        <button
          type="button"
          className={cx('map-control', showBorders && 'is-active')}
          onClick={() => setShowBorders((value) => !value)}
          aria-pressed={showBorders}
          aria-label="Mostrar fronteiras internas"
          title="Mostrar fronteiras internas"
        >
          <Icon name="Layers" size={15} />
        </button>
      </div>

      <div className="map-modes" role="tablist" aria-label="Leitura do mapa">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'atlas'}
          className={cx(mode === 'atlas' && 'is-active')}
          onClick={() => setMode('atlas')}
        >
          <Icon name="Map" size={13} /> Atlas
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === '3d'}
          className={cx(mode === '3d' && 'is-active')}
          onClick={() => setMode('3d')}
          disabled={!webgl}
          title={webgl ? 'Globo tridimensional' : 'WebGL indisponível neste navegador'}
        >
          <Icon name="Globe2" size={13} /> Globo
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === '2d'}
          className={cx(mode === '2d' && 'is-active')}
          onClick={() => setMode('2d')}
        >
          <Icon name="Layers" size={13} /> Carta
        </button>
      </div>

      {(!webgl || globeFailed) && mode === '3d' && (
        <div className="map-fallback-note" role="status">
          <Icon name="Info" size={13} /> WebGL indisponível: exibindo a carta plana com os mesmos dados e seleção.
        </div>
      )}

      <div className="map-legend">
        <div className="map-legend__title">Legenda</div>
        <div className="map-legend__grid">
          {playerFaction && (
            <span className="legend-item">
              <i
                style={{
                  background: playerFaction.color,
                  backgroundImage: `repeating-linear-gradient(${FACTION_HATCH_ANGLE[playerFaction.id] ?? 38}deg, rgba(255,255,255,.55) 0 1px, transparent 1px 3px)`,
                }}
              />{' '}
              Seu grupo
            </span>
          )}
          {Object.values(FACTIONS)
            .filter((faction) => faction.id !== playerId)
            .map((faction) => (
              <span className="legend-item" key={faction.id}>
                <i
                  style={{
                    background: faction.color,
                    backgroundImage: `repeating-linear-gradient(${FACTION_HATCH_ANGLE[faction.id] ?? 38}deg, rgba(255,255,255,.45) 0 1px, transparent 1px 3px)`,
                  }}
                />{' '}
                {faction.short}
              </span>
            ))}
          <span className="legend-item"><i className="is-neutral" /> Neutro</span>
          <span className="legend-item"><i className="is-claimable" /> Reivindicável</span>
        </div>
      </div>

      {detailStatus === 'loading' && (
        <div className="map-detail-status" role="status">Carregando províncias de {COUNTRY_BY_ID[resolvedFocus ?? '']?.name ?? resolvedFocus}…</div>
      )}
      {detailStatus === 'failed' && resolvedFocus && (
        <div className="map-detail-status is-failed" role="status">
          Geometria detalhada indisponível para {COUNTRY_BY_ID[resolvedFocus]?.name ?? resolvedFocus}. O país segue selecionável.
        </div>
      )}

      {drill && (
        <div className="map-drill">
          <div className="map-drill__head">
            <Icon name={provinceInfo ? 'Hexagon' : 'MapPin'} size={14} />
            <div>
              <strong>{drillName}</strong>
              <span>
                {provinceInfo
                  ? `${COUNTRY_BY_ID[provinceInfo.countryId]?.name ?? provinceInfo.countryId} · província`
                  : `${COUNTRY_BY_ID[cityInfo!.countryId]?.name ?? cityInfo!.countryId} · cidade`}
              </span>
            </div>
            <button type="button" className="map-drill__close" onClick={() => { selectProvince(null); selectCity(null); }} aria-label="Fechar detalhe">
              ×
            </button>
          </div>
          <div className="map-drill__stats">
            <span><b>{fmt(drill.pop)}</b> habitantes</span>
            {provinceInfo ? (
              <span><b>{provinceInfo.cities}</b> cidades {provinceInfo.capital ? '· capital nacional' : ''}</span>
            ) : (
              <span>{cityInfo!.capital ? 'Capital nacional' : `Raio de influência ${cityInfo!.rank}`}</span>
            )}
          </div>
          <button
            type="button"
            className="map-drill__action"
            onClick={() => {
              const iso = provinceInfo ? provinceInfo.countryId : cityInfo!.countryId;
              selectCountry(iso, true);
            }}
          >
            Abrir país no painel <Icon name="ChevronRight" size={13} />
          </button>
        </div>
      )}

      {tooltip && (
        <div
          className="map-tooltip"
          style={{
            left: Math.max(8, tooltip.x + 16 + 246 > (viewRef.current?.clientWidth ?? 0) ? tooltip.x - 254 : tooltip.x + 16),
            top: Math.max(8, Math.min(tooltip.y + 14, (viewRef.current?.clientHeight ?? 400) - 150)),
          }}
        >
          <div className="map-tooltip__top">
            {tooltip.terrain ? (
              <span className="map-tooltip__glyph"><TerrainGlyph terrain={tooltip.terrain} size={30} /></span>
            ) : null}
            <span className="map-tooltip__owner" style={{ background: tooltip.accent }} />
            <div>
              <strong>{tooltip.title}</strong>
              <span>{tooltip.subtitle}</span>
            </div>
          </div>
          <div className="map-tooltip__row">
            <span>{tooltip.meta}</span>
          </div>
          <div className="map-tooltip__row">{tooltip.text}</div>
          <div className="map-tooltip__row">{tooltip.foot}</div>
          {tooltip.claim && (
            <div className="map-tooltip__claim"><Icon name="Sparkles" size={12} /> Pode ser reivindicado pelo painel de expansão</div>
          )}
        </div>
      )}

      <div className="map-hint">
        <Icon name="MousePointer2" size={12} />
        {mode === '3d' && active
          ? 'Arraste para girar · roda ou pinça para aproximar · clique no país, na província ou na cidade · duplo clique foca'
          : mode === 'atlas'
            ? 'Arraste o atlas · roda para aproximar · clique no território, na província ou na cidade · duplo clique foca o país'
            : 'Arraste para navegar · roda do mouse para aproximar · clique no país, na província ou na cidade'}
      </div>

      <div className="map-owner-badge">
        <span className="map-owner-badge__dot" style={{ background: owner ? FACTIONS[owner].color : '#6a7883' }} />
        {owner ? FACTIONS[owner].name : selectedTileId ? 'Neutro' : `${ownCount} países sob sua soberania`}
        <span className="map-owner-badge__sep">·</span>
        <span>{GLOBAL_CITIES.length} cidades marcadas no atlas</span>
      </div>

      <div className="map-scale">
        <span className="map-scale__line"><i /> {mode === '3d' && active ? 'projeção esférica' : mode === 'atlas' ? 'carta ilustrada · equirretangular' : 'projeção equirretangular'}</span>
        <span>atlas Natural Earth</span>
      </div>
    </div>
  );
}
