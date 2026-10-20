import { create } from 'zustand';
import { createInitialState, exportSave, importSave, loadState, saveState } from '../game/state';
import { advanceCycle } from '../game/cycle';
import { chooseEvent } from '../game/events';
import { FACTIONS } from '../game/constants';
import { CITY_BY_ID, PROVINCE_BY_ID, cityById } from '../game/atlas';
import { scoreOf } from '../game/progress';
import type { CommandResult, CycleReport, FactionId, GameState, MarketKey, ResourceKey, TechId, BuildingKey } from '../game/types';
import {
  buyResource,
  declareWar,
  proposeTreaty,
  recruit,
  respondToOffer,
  sellResource,
  sendGift,
  startConstruction,
  startExpansion,
  startOperation,
  startResearch,
  foundSeat as foundSeatCommand,
} from '../game/commands';

export type ViewKey =
  | 'map'
  | 'city'
  | 'economy'
  | 'construction'
  | 'tech'
  | 'expansion'
  | 'diplomacy'
  | 'objectives'
  | 'chronicle'
  | 'settings';

export type ToastKind = 'success' | 'error' | 'info' | 'warning' | 'battle';

export interface Toast {
  id: number;
  kind: ToastKind;
  title: string;
  message?: string;
}

export interface ConfirmConfig {
  title: string;
  body: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
}

export type Screen = 'menu' | 'seat' | 'game';

export interface SeatDraft {
  cityId: string;
  plotId: string | null;
  district: 'Centro' | 'Expansão' | 'Periferia' | null;
}
export const CYCLE_SECONDS = 14;
let toastId = 1;

interface GameStore {
  booted: boolean;
  screen: Screen;
  savedGame: GameState | null;
  game: GameState | null;
  loadError: string | null;
  view: ViewKey;
  selectedTileId: string | null;
  selectedProvinceId: string | null;
  selectedCityId: string | null;
  focusCountryId: string | null;
  autoPlay: boolean;
  secondsLeft: number;
  digest: CycleReport | null;
  tutorialStep: number | null;
  confirm: ConfirmConfig | null;
  toasts: Toast[];
  savedAt: number | null;
  saveError: string | null;
  eventDismissed: boolean;
  openEvent: () => void;

  boot: () => void;
  seatDraft: SeatDraft;
  seatMode: 'new' | 'existing';
  cityMode: 'overview' | 'building' | 'interior';
  openSeat: (mode?: 'new' | 'existing') => void;
  chooseSeatCity: (cityId: string) => void;
  chooseSeatPlot: (plotId: string, district: SeatDraft['district']) => void;
  cancelSeat: () => void;
  foundSeat: () => void;
  setCityMode: (mode: 'overview' | 'building' | 'interior') => void;
  startNewGame: (seed?: number, seat?: { cityId: string; plotId: string; district: 'Centro' | 'Expansão' | 'Periferia' }) => void;
  continueGame: () => void;
  goToMenu: () => void;
  selectTile: (tileId: string | null) => void;
  selectCountry: (tileId: string | null, focus?: boolean) => void;
  selectProvince: (provinceId: string | null) => void;
  selectCity: (cityId: string | null) => void;
  focusCountry: (tileId: string | null) => void;
  clearSelection: () => void;
  setView: (view: ViewKey) => void;
  setAutoPlay: (playing: boolean) => void;
  toggleAutoPlay: () => void;
  tick: () => void;
  advance: () => void;
  dismissDigest: () => void;
  dismissEvent: () => void;
  run: (fn: (state: GameState) => CommandResult, silent?: boolean) => boolean;
  build: (tileId: string, building: BuildingKey) => boolean;
  research: (techId: TechId) => boolean;
  expand: (tileId: string) => boolean;
  attack: (tileId: string) => boolean;
  enlist: (batches: number) => boolean;
  trade: (resource: MarketKey, amount: number, side: 'buy' | 'sell') => boolean;
  gift: (target: FactionId) => boolean;
  treaty: (target: FactionId, kind: 'trade' | 'nonAggression' | 'alliance' | 'peace') => boolean;
  war: (target: FactionId) => boolean;
  answerOffer: (offerId: string, accept: boolean) => boolean;
  resolveEvent: (choiceId: string) => boolean;
  openTutorial: (step?: number) => void;
  setTutorialStep: (step: number) => void;
  finishTutorial: () => void;
  requestConfirm: (config: ConfirmConfig) => void;
  confirmAction: () => void;
  cancelConfirm: () => void;
  toast: (kind: ToastKind, title: string, message?: string) => void;
  removeToast: (id: number) => void;
  saveNow: () => void;
  exportGame: () => void;
  importGame: (text: string) => { ok: boolean; error: string | null };
  toggleDigest: () => void;
}

function persist(state: GameState): boolean {
  return saveState(state);
}

export const useGameStore = create<GameStore>()((set, get) => {
  const notify = (kind: ToastKind, title: string, message?: string) => {
    const toast: Toast = { id: toastId++, kind, title, message };
    set((state) => ({ toasts: [...state.toasts.slice(-3), toast] }));
    window.setTimeout(() => get().removeToast(toast.id), 5200);
  };

  const commit = (game: GameState, message?: string, silent = false) => {
    const ok = persist(game);
    set({
      game,
      savedGame: game,
      savedAt: ok ? Date.now() : get().savedAt,
      saveError: ok ? null : 'Não foi possível gravar no armazenamento local.',
    });
    if (message && !silent) notify('success', message);
  };

  const run = (fn: (state: GameState) => CommandResult, silent = false) => {
    const game = get().game;
    if (!game) return false;
    const result = fn(game);
    if (!result.ok) {
      notify('error', 'Ação recusada', result.message);
      return false;
    }
    commit(result.state, silent ? undefined : result.message, silent);
    return true;
  };

  return {
    booted: false,
    screen: 'menu',
    savedGame: null,
    game: null,
    loadError: null,
    view: 'map',
    seatDraft: { cityId: 'c1044', plotId: null, district: null },
    seatMode: 'new',
    cityMode: 'overview',
    selectedTileId: null,
    selectedProvinceId: null,
    selectedCityId: null,
    focusCountryId: null,
    autoPlay: false,
    secondsLeft: CYCLE_SECONDS,
    digest: null,
    tutorialStep: null,
    confirm: null,
    toasts: [],
    savedAt: null,
    saveError: null,
    eventDismissed: false,

    boot: () => {
      const result = loadState();
      set({
        booted: true,
        savedGame: result.state,
        loadError: result.error,
        savedAt: result.state ? Date.now() : null,
      });
      if (result.state) {
        const capital = result.state.factions[result.state.playerFactionId].capitalId;
        set({ selectedTileId: capital, focusCountryId: null });
      }
    },

    openSeat: (mode = 'new') => set({
      screen: 'seat',
      seatMode: mode,
      seatDraft: {
        cityId: get().game?.city?.cityId ?? 'c1044',
        plotId: null,
        district: null,
      },
      cityMode: 'overview',
    }),
    chooseSeatCity: (cityId) => set({ seatDraft: { cityId, plotId: null, district: null } }),
    chooseSeatPlot: (plotId, district) => set((state) => ({
      seatDraft: { ...state.seatDraft, plotId, district },
      cityMode: 'building',
    })),
    cancelSeat: () => set((state) => ({
      screen: state.seatMode === 'existing' && state.game ? 'game' : 'menu',
      cityMode: 'overview',
    })),
    setCityMode: (mode) => set({ cityMode: mode }),
    foundSeat: () => {
      const draft = get().seatDraft;
      if (!draft.plotId || !draft.district) return;
      if (get().seatMode === 'existing' && get().game) {
        const ok = get().run(
          (state) => foundSeatCommand(state, draft.cityId, draft.plotId!, draft.district!),
          false,
        );
        if (!ok) return;
        set({ screen: 'game', view: 'city', cityMode: 'building' });
        return;
      }
      get().startNewGame(undefined, {
        cityId: draft.cityId,
        plotId: draft.plotId,
        district: draft.district,
      });
      set({ screen: 'game', view: 'city', cityMode: 'building' });
    },

    startNewGame: (seed, seat) => {
      const game = createInitialState(seed ?? (Date.now() % 1_000_000), Date.now(), seat);
      persist(game);
      set({
        game,
        savedGame: game,
        screen: 'game',
        view: seat ? 'city' : 'map',
        selectedTileId: game.factions[game.playerFactionId].capitalId,
        focusCountryId: null,
        selectedProvinceId: null,
        selectedCityId: null,
        autoPlay: false,
        secondsLeft: CYCLE_SECONDS,
        digest: null,
        tutorialStep: game.tutorial.seenIntro ? null : 0,
        confirm: null,
        savedAt: Date.now(),
        eventDismissed: false,
      });
      notify(
        'info',
        'Nova campanha',
        seat
          ? `Sede fundada em ${game.city?.cityName ?? 'sua cidade'}. O distrito ${seat.district} já influencia a economia.`
          : 'Lisboa aguarda suas decisões. Leia o tutorial para começar.',
      );
    },

    continueGame: () => {
      const saved = get().savedGame;
      if (!saved) {
        get().startNewGame();
        return;
      }
      set({
        game: saved,
        screen: 'game',
        view: 'map',
        selectedTileId: saved.factions[saved.playerFactionId].capitalId,
        focusCountryId: null,
        selectedProvinceId: null,
        selectedCityId: null,
        autoPlay: false,
        secondsLeft: CYCLE_SECONDS,
        digest: null,
        tutorialStep: saved.tutorial.seenIntro ? null : 0,
        confirm: null,
        eventDismissed: false,
      });
    },

    goToMenu: () => {
      const game = get().game;
      set({
        screen: 'menu',
        savedGame: game ?? get().savedGame,
        view: 'map',
        digest: null,
        tutorialStep: null,
        autoPlay: false,
        confirm: null,
      });
    },

    selectTile: (tileId) => set({
      selectedTileId: tileId,
      selectedProvinceId: null,
      selectedCityId: null,
      focusCountryId: tileId ?? null,
    }),
    selectCountry: (tileId, focus = false) => set((state) => ({
      selectedTileId: tileId,
      selectedProvinceId: null,
      selectedCityId: null,
      focusCountryId: focus ? tileId ?? null : (tileId ? state.focusCountryId : null),
    })),
    selectProvince: (provinceId) => {
      if (!provinceId) {
        set({ selectedProvinceId: null });
        return;
      }
      const province = PROVINCE_BY_ID[provinceId];
      set({
        selectedProvinceId: provinceId,
        selectedCityId: null,
        selectedTileId: province?.countryId ?? get().selectedTileId,
      });
    },
    selectCity: (cityId) => {
      if (!cityId) {
        set({ selectedCityId: null });
        return;
      }
      const city = cityById(cityId);
      set({
        selectedCityId: cityId,
        selectedProvinceId: null,
        selectedTileId: city?.countryId ?? get().selectedTileId,
      });
    },
    focusCountry: (tileId) => set({ focusCountryId: tileId }),
    clearSelection: () => set({ selectedTileId: null, selectedProvinceId: null, selectedCityId: null }),
    setView: (view) => set({ view }),
    setAutoPlay: (playing) => set({ autoPlay: playing }),
    toggleAutoPlay: () => set((state) => ({ autoPlay: !state.autoPlay })),

    tick: () => {
      const state = get();
      const game = state.game;
      if (!game || game.phase !== 'playing') return;
      if (!state.autoPlay || state.view !== 'map' || state.digest || state.tutorialStep !== null || state.confirm) return;
      if (game.pendingEventId) return;
      if (state.secondsLeft <= 1) {
        get().advance();
      } else {
        set({ secondsLeft: state.secondsLeft - 1 });
      }
    },

    advance: () => {
      const game = get().game;
      if (!game) return;
      if (game.pendingEventId) {
        set({ eventDismissed: false });
        notify('warning', 'Evento pendente', 'Resolva o evento antes de encerrar o ciclo.');
        return;
      }
      const result = advanceCycle(game);
      if (!result.ok) {
        notify('error', 'Ciclo bloqueado', result.message);
        return;
      }
      const next = result.state;
      const report = result.report;
      const previousOffers = new Set(game.offers.map((o) => o.id));
      const newOffers = next.offers.filter((o) => !previousOffers.has(o.id));
      const ok = persist(next);
      set({
        game: next,
        savedGame: next,
        secondsLeft: CYCLE_SECONDS,
        digest: next.phase === 'playing' && next.settings.showDigest && report?.notable && !next.pendingEventId ? report : null,
        eventDismissed: false,
        savedAt: ok ? Date.now() : get().savedAt,
      });
      if (next.phase === 'playing') {
        if (newOffers.length) {
          notify('info', 'Nova proposta diplomática', `${FACTIONS[newOffers[0].from].short} quer negociar. Veja a aba Diplomacia.`);
        } else if (!report?.notable) {
          notify('info', `Ciclo ${next.cycle}`, 'O mundo avançou. Seus indicadores foram atualizados.');
        }
        if (next.pendingEventId) set({ eventDismissed: false });
      }
    },

    dismissDigest: () => set({ digest: null }),
    dismissEvent: () => set({ eventDismissed: true }),
    openEvent: () => set({ eventDismissed: false }),

    run,

    build: (tileId, building) => run((state) => startConstruction(state, state.playerFactionId, tileId, building)),
    research: (techId) => run((state) => startResearch(state, state.playerFactionId, techId)),
    expand: (tileId) => run((state) => startExpansion(state, state.playerFactionId, tileId)),
    attack: (tileId) => run((state) => startOperation(state, state.playerFactionId, tileId)),
    enlist: (batches) => run((state) => recruit(state, state.playerFactionId, batches)),
    trade: (resource, amount, side) =>
      run((state) =>
        side === 'sell'
          ? sellResource(state, state.playerFactionId, resource, amount)
          : buyResource(state, state.playerFactionId, resource, amount),
      ),
    gift: (target) => run((state) => sendGift(state, state.playerFactionId, target)),
    treaty: (target, kind) => run((state) => proposeTreaty(state, state.playerFactionId, target, kind)),
    war: (target) => run((state) => declareWar(state, state.playerFactionId, target)),
    answerOffer: (offerId, accept) => run((state) => respondToOffer(state, state.playerFactionId, offerId, accept)),

    resolveEvent: (choiceId) => {
      const game = get().game;
      if (!game) return false;
      const result = chooseEvent(game, game.playerFactionId, choiceId);
      if (!result.ok) {
        notify('error', 'Escolha inválida', result.message);
        return false;
      }
      commit(result.state, undefined, true);
      notify('success', 'Decisão registrada', result.message);
      set({ eventDismissed: false });
      return true;
    },

    openTutorial: (step = 0) => set({ tutorialStep: step }),
    setTutorialStep: (step) => set({ tutorialStep: step }),
    finishTutorial: () => {
      const game = get().game;
      if (game) {
        const next = structuredClone(game);
        next.tutorial.seenIntro = true;
        next.tutorial.done = true;
        next.tutorial.step = 0;
        persist(next);
        set({ game: next, savedGame: next, tutorialStep: null, autoPlay: true });
      } else {
        set({ tutorialStep: null });
      }
    },

    requestConfirm: (config) => set({ confirm: config }),
    confirmAction: () => {
      const config = get().confirm;
      set({ confirm: null });
      config?.onConfirm();
    },
    cancelConfirm: () => set({ confirm: null }),

    toast: notify,
    removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

    saveNow: () => {
      const game = get().game;
      if (!game) return;
      const ok = persist(game);
      if (ok) {
        set({ savedAt: Date.now(), saveError: null, savedGame: game });
        notify('success', 'Progresso salvo', 'O mundo foi gravado no armazenamento local.');
      } else {
        set({ saveError: 'Falha ao gravar o save.' });
        notify('error', 'Falha ao salvar', 'O navegador bloqueou o armazenamento local.');
      }
    },

    exportGame: () => {
      const game = get().game;
      if (!game) return;
      const text = exportSave(game);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `management-century-ciclo-${game.cycle}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      notify('success', 'Mundo exportado', 'O arquivo JSON pode ser importado em outro navegador.');
    },

    importGame: (text) => {
      const result = importSave(text);
      if (!result.state) {
        return { ok: false, error: result.error ?? 'Save inválido.' };
      }
      persist(result.state);
      set({
        game: result.state,
        savedGame: result.state,
        screen: 'game',
        view: 'map',
        selectedTileId: result.state.factions[result.state.playerFactionId].capitalId,
        focusCountryId: null,
        selectedProvinceId: null,
        selectedCityId: null,
        autoPlay: false,
        tutorialStep: null,
        digest: null,
        savedAt: Date.now(),
      });
      notify('success', 'Save importado', `Campanha retomada no ciclo ${result.state.cycle}.`);
      return { ok: true, error: null };
    },

    toggleDigest: () => {
      const game = get().game;
      if (!game) return;
      const next = structuredClone(game);
      next.settings.showDigest = !next.settings.showDigest;
      commit(next, next.settings.showDigest ? 'Resumo de ciclo ativado' : 'Resumo de ciclo desativado');
    },
  };
});

// ── Selectors used across the UI ────────────────────────────────────────────

export function useGame(): GameState | null {
  return useGameStore((state) => state.game);
}

export function usePlayerId(): FactionId {
  return useGameStore((state) => state.game?.playerFactionId ?? 'concordia');
}
