import { useEffect, useState } from 'react';
import { FACTIONS, GAME, RESOURCES } from './game/constants';
import { eventById, type EventEffect } from './game/events';
import { START_CASH } from './game/money';
import { rankOf, scoreParts, VICTORY_TARGET } from './game/progress';
import type { CycleReport, ResourceKey } from './game/types';
import { CYCLE_SECONDS, useGameStore } from './store/gameStore';
import { ChroniclePanel } from './ui/ChroniclePanel';
import { CompaniesPanel } from './ui/CompaniesPanel';
import { CityView } from './ui/CityView';
import { BuildPanel } from './ui/BuildPanel';
import { ConstructionPanel } from './ui/ConstructionPanel';
import { DiplomacyPanel } from './ui/DiplomacyPanel';
import { EconomyPanel } from './ui/EconomyPanel';
import { ExpansionPanel } from './ui/ExpansionPanel';
import { fmt, money, trendClass } from './ui/format';
import { Icon } from './ui/Icon';
import { MapView } from './ui/MapView';
import { NavRail } from './ui/NavRail';
import { ObjectivesPanel } from './ui/ObjectivesPanel';
import { OverviewPanel } from './ui/OverviewPanel';
import { Badge, cx, Modal, ProgressBar } from './ui/primitives';
import { SeatScreen } from './ui/SeatScreen';
import { SettingsPanel } from './ui/SettingsPanel';
import { StartScreen } from './ui/StartScreen';
import { TechPanel } from './ui/TechPanel';
import { TerritoryPanel } from './ui/TerritoryPanel';
import { TopBar } from './ui/TopBar';

const VIEWS = {
  map: MapView,
  city: CityView,
  units: BuildPanel,
  companies: CompaniesPanel,
  economy: EconomyPanel,
  construction: ConstructionPanel,
  tech: TechPanel,
  expansion: ExpansionPanel,
  diplomacy: DiplomacyPanel,
  objectives: ObjectivesPanel,
  chronicle: ChroniclePanel,
  settings: SettingsPanel,
} as const;

/** Teclas 1–6 percorrem as telas principais; 0 abre o relatório; U abre as obras. */
const KEY_VIEWS = ['map', 'city', 'companies', 'units', 'economy', 'objectives'] as const;

const TUTORIAL_STEPS: Array<{ title: string; body: string; icon: string; view: 'map' | 'city' | 'economy' | 'companies'; hint: string }> = [
  {
    title: 'Sua companhia, seu mercado',
    body: `Você dirige o Grupo Concórdia e começa com ${money(START_CASH)} em caixa. A campanha abre na escolha da cidade-sede: terreno real, ruas geradas e o lote onde a primeira operação será aberta.`,
    icon: 'Globe2',
    view: 'city',
    hint: 'A aba Cidade mostra a maquete da praça e a fachada da sede. O resto entra depois.',
  },
  {
    title: 'Abra a primeira unidade',
    body: 'Uma empresa só existe quando tem uma unidade aberta. Escolha cidade, ramo e invista: a loja passa a disputar participação com as rivais e começa a gerar receita no ciclo seguinte.',
    icon: 'Store',
    view: 'companies',
    hint: 'Empresas (tecla 3) lista o portfólio e o formulário de nova unidade. O investimento sai do caixa.',
  },
  {
    title: 'O ciclo move o mundo',
    body: `A cada ${CYCLE_SECONDS} segundos um ciclo fecha: a receita entra, as despesas saem, projetos avançam e eventos podem surgir. Use Avançar para controlar o ritmo ou deixe o autoplay ligado — os ciclos correm em qualquer tela.`,
    icon: 'Play',
    view: 'map',
    hint: 'Espaço avança um ciclo. O autoplay pausa em configurações e modais.',
  },
  {
    title: 'Cresça, depois expanda',
    body: 'Com caixa sobrando, amplie a unidade que já rende (Obras) ou licencie uma nova praça (Expansão). Primeiro a operação precisa ficar de pé; o painel do mapa sempre aponta o próximo passo.',
    icon: 'Blocks',
    view: 'economy',
    hint: 'O roteiro do painel acompanha quatro marcos: abrir unidade, virar o ciclo, ampliar e licenciar.',
  },
];

const HELP_CARDS = [
  { icon: 'Map', title: 'Leia a praça', body: 'Solo, depósito, população, estruturas e valor estratégico determinam o que cada mercado pode render. Clique para abrir a ficha completa.' },
  { icon: 'Play', title: 'Decida no ciclo', body: 'Produção, consumo, manutenção e projetos só mudam quando um ciclo fecha. Avance manualmente ou deixe o autoplay correr.' },
  { icon: 'Store', title: 'Abra unidades', body: 'Cidades grandes sustentam mercados maiores. Cada unidade disputa participação com as rivais: comprar mais unidades na mesma cidade aumenta a sua fatia.' },
  { icon: 'Blocks', title: 'Cresça no lugar', body: 'No módulo Obras (tecla 4), cada filial compra expansões de construção e de ramo, e a sede sobe de escritório compacto a complexo matriz. Ampliar rende mais receita e presença, mas pesa na manutenção.' },
  { icon: 'Handshake', title: 'Negocie acordos', body: 'Acordos comerciais, tréguas de concorrência e parcerias estratégicas geram receita e estabilidade. Presentes e propostas custam caixa e melhoram a relação.' },
  { icon: 'FlaskConical', title: 'Escolha um caminho', body: 'São quatro ramos de pesquisa com pré-requisitos claros. Nenhuma tecnologia é obrigatória; cada uma troca custo por uma vantagem concreta.' },
  { icon: 'Award', title: 'Lidere o mercado', body: `${VICTORY_TARGET} pontos de relevância encerram a partida. Perder a sede, ficar sem praças ou entrar em insolvência é derrota.` },
];

export function App() {
  const booted = useGameStore((s) => s.booted);
  const screen = useGameStore((s) => s.screen);
  const boot = useGameStore((s) => s.boot);
  const view = useGameStore((s) => s.view);
  const selectedTileId = useGameStore((s) => s.selectedTileId);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const store = useGameStore.getState();
      if (store.screen !== 'game') return;
      if (event.key === '?') {
        event.preventDefault();
        setHelpOpen((open) => !open);
        return;
      }
      if (event.key === 'Escape') {
        if (store.selectedTileId) store.selectTile(null);
        return;
      }
      if (event.key === ' ' || event.code === 'Space') {
        if (helpOpen || store.digest || store.confirm || store.tutorialStep !== null) return;
        event.preventDefault();
        if (store.game?.phase === 'playing' && !store.game?.pendingEventId) store.advance();
        return;
      }
      if (event.key.toLowerCase() === 'u') {
        event.preventDefault();
        store.setView('units');
        return;
      }
      if (/^[0-9]$/.test(event.key)) {
        event.preventDefault();
        const keyView = event.key === '0' ? 'chronicle' : KEY_VIEWS[Number(event.key) - 1];
        if (keyView) store.setView(keyView);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  if (!booted) {
    return (
      <div className="boot-screen">
        <h1>{GAME.name}</h1>
        <p className="eyebrow">Registro da companhia</p>
        <div className="boot-screen__bar"><span /></div>
      </div>
    );
  }

  if (screen === 'seat') {
    return <SeatScreen />;
  }

  if (screen === 'menu') {
    return (
      <>
        <StartScreen onHelp={() => setHelpOpen(true)} />
        <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      </>
    );
  }

  const View = VIEWS[view];

  return (
    <>
      <div className="game-shell">
        <TopBar onHelp={() => setHelpOpen(true)} />
        <div className="game-body">
          <NavRail />
          <main className={cx('game-main', `game-main--${view}`)}>
            {view === 'map' ? (
              <div className="map-workspace">
                <MapView />
                <aside className="context-slot">{selectedTileId ? <TerritoryPanel /> : <OverviewPanel />}</aside>
              </div>
            ) : (
              <div className="view-workspace"><View /></div>
            )}
          </main>
        </div>
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ConfirmDialog />
      <EventModal />
      <CycleDigest />
      <EndGameModal />
      <TutorialOverlay />
      <Toasts />
    </>
  );
}

function HelpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Como gerir a companhia"
      eyebrow="Manual de campo"
      icon="BookOpen"
      subtitle="Tudo o que o MVP oferece, sem letras miúdas."
      size="lg"
    >
      <div className="help-grid">
        {HELP_CARDS.map((card) => (
          <section className="help-card" key={card.title}>
            <span className="help-card__icon"><Icon name={card.icon} size={16} /></span>
            <h3>{card.title}</h3>
            <p>{card.body}</p>
          </section>
        ))}
      </div>
      <div className="help-footer">
        <div>
          <strong>Indicadores e atalhos</strong>
          <p>Teclas 1–6 abrem as telas essenciais, 0 abre o relatório e U abre as obras. Espaço avança um ciclo, Esc fecha modais e ? abre este manual.</p>
        </div>
        <div>
          <strong>Sem jogadores fictícios</strong>
          <p>As três companhias rivais são IA declaradas, com doutrinas visíveis. O motor separa estado, comandos e ciclo para receber um servidor autoritativo em uma versão futura.</p>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDialog() {
  const confirm = useGameStore((s) => s.confirm);
  const cancel = useGameStore((s) => s.cancelConfirm);
  const accept = useGameStore((s) => s.confirmAction);
  return (
    <Modal
      open={Boolean(confirm)}
      onClose={cancel}
      title={confirm?.title}
      eyebrow="Confirmação"
      icon="AlertTriangle"
      size="sm"
      footer={
        <>
          <button className="button button--ghost" onClick={cancel} type="button">Cancelar</button>
          <button className={cx('button', confirm?.tone === 'danger' ? 'button--danger' : 'button--primary')} onClick={accept} type="button">
            {confirm?.confirmLabel ?? 'Confirmar'}
          </button>
        </>
      }
    >
      <p className="muted">{confirm?.body}</p>
    </Modal>
  );
}

function EventModal() {
  const game = useGameStore((s) => s.game);
  const dismissed = useGameStore((s) => s.eventDismissed);
  const dismiss = useGameStore((s) => s.dismissEvent);
  const resolve = useGameStore((s) => s.resolveEvent);
  if (!game?.pendingEventId || dismissed) return null;
  const event = eventById(game.pendingEventId);
  if (!event) return null;

  return (
    <Modal
      open
      onClose={dismiss}
      title={event.title}
      eyebrow={`Evento · ${event.category}`}
      icon={event.icon}
      subtitle={`Ciclo ${game.cycle}. A decisão entra em vigor imediatamente e fica registrada no histórico da companhia.`}
      size="md"
    >
      <div className="event-prose">
        <p>{event.description}</p>
      </div>
      <div className="event-choices">
        {event.choices.map((choice) => (
          <button
            key={choice.id}
            className={cx('event-choice', `event-choice--${choice.tone ?? 'neutral'}`)}
            onClick={() => resolve(choice.id)}
            type="button"
          >
            <span className="event-choice__marker" aria-hidden="true" />
            <span className="event-choice__body">
              <strong>{choice.label}</strong>
              <span>{choice.description}</span>
              <small className="event-choice__effect">{describeEffect(choice.effect)}</small>
            </span>
            <span className="event-choice__tone">{choice.tone === 'good' ? 'Favorável' : choice.tone === 'bad' ? 'Arriscado' : 'Neutro'}</span>
          </button>
        ))}
      </div>
      <button className="button button--ghost button--block" onClick={dismiss} type="button">
        <Icon name="Moon" size={13} /> Deixar para depois
      </button>
    </Modal>
  );
}

function CycleDigest() {
  const digest = useGameStore((s) => s.digest);
  const dismiss = useGameStore((s) => s.dismissDigest);
  return (
    <Modal
      open={Boolean(digest)}
      onClose={dismiss}
      title={digest ? `Ciclo ${String(digest.cycle).padStart(2, '0')} concluído` : ''}
      eyebrow="Boletim da diretoria"
      icon="Activity"
      size="md"
      footer={<button className="button button--primary" onClick={dismiss} type="button">Continuar operando</button>}
    >
      {digest ? <DigestBody report={digest} /> : null}
    </Modal>
  );
}

function DigestBody({ report }: { report: CycleReport }) {
  return (
    <div>
      <div className="digest-grid">
        <div className="digest-panel">
          <h4><Icon name="Activity" size={12} /> Resultado do ciclo</h4>
          <div className="digest-row">
            <span><Icon name="TrendingUp" size={12} /> Receita</span>
            <strong className="tone-teal">{money(report.income ?? 0)}</strong>
            <span>entradas em caixa</span>
          </div>
          <div className="digest-row">
            <span><Icon name="TrendingDown" size={12} /> Despesas</span>
            <strong className="tone-red">{money(report.expenses ?? 0)}</strong>
            <span>custos e manutenção</span>
          </div>
          <div className="digest-row">
            <span><Icon name="Coins" size={12} /> Resultado</span>
            <strong className={trendClass(report.deltas.creditos)}>{money(report.deltas.creditos, true)}</strong>
            <span>saldo do ciclo</span>
          </div>
          <div className="digest-row">
            <span><Icon name="Coins" size={12} /> Caixa</span>
            <strong>{money(report.cash ?? 0)}</strong>
            <span>disponível</span>
          </div>
        </div>
        <div>
          <div className="digest-panel">
            <h4><Icon name="Check" size={12} /> Concluído</h4>
            {report.completed.length ? (
              <ul className="digest-list">{report.completed.map((line, index) => <li key={index}>{line}</li>)}</ul>
            ) : <p className="muted small">Nenhum projeto concluído neste ciclo.</p>}
          </div>
          <div className="digest-panel" style={{ marginTop: 10 }}>
            <h4><Icon name="Target" size={12} /> Próximo ciclo</h4>
            <p className="muted small">
              Resultado projetado: <strong className={trendClass(report.deltas.creditos)}>{money(report.deltas.creditos, true)}</strong>
            </p>
          </div>
        </div>
      </div>
      {report.events.length ? (
        <section className="digest-section">
          <h4><Icon name="Sparkles" size={12} /> Eventos</h4>
          {report.events.map((line, index) => <p key={index}>{line}</p>)}
        </section>
      ) : null}
      {report.alerts.length ? (
        <section className="digest-section digest-section--alert">
          <h4><Icon name="AlertTriangle" size={12} /> Alertas</h4>
          {report.alerts.map((line, index) => <p key={index}>{line}</p>)}
        </section>
      ) : null}
    </div>
  );
}

function describeEffect(effect: EventEffect): string {
  const parts: string[] = [];
  // Dinheiro usa a mesma forma curta dos painéis (R$ 1,2 mi); insumos vão em unidades.
  const delta = (key: string, value: number) => (
    key === 'creditos'
      ? money(value, true)
      : `${value > 0 ? '+' : '−'}${fmt(Math.abs(value))} ${RESOURCES[key as ResourceKey].short}`
  );
  const cost = (key: string, value: number) => (
    key === 'creditos' ? money(Math.abs(value)) : `${fmt(Math.abs(value))} ${RESOURCES[key as ResourceKey].short}`
  );
  if (effect.stockDelta) {
    for (const [key, value] of Object.entries(effect.stockDelta)) {
      if (!value) continue;
      parts.push(delta(key, value));
    }
  }
  if (effect.allStockDelta) {
    const entries = Object.entries(effect.allStockDelta).filter(([, value]) => value);
    if (entries.length) parts.push(entries.map(([key, value]) => delta(key, value ?? 0)).join(' · '));
  }
  if (effect.cost) {
    for (const [key, value] of Object.entries(effect.cost)) {
      if (!value) continue;
      parts.push(`custa ${cost(key, value)}`);
    }
  }
  if (effect.unrest) parts.push(`desordem ${effect.unrest > 0 ? '+' : ''}${effect.unrest}`);
  if (effect.relations) parts.push(`relações ${effect.relations > 0 ? '+' : ''}${effect.relations}`);
  if (effect.modifier) parts.push(`${effect.modifier.label} por ${effect.modifier.cycles} ciclos`);
  return parts.length ? parts.join(' · ') : effect.log;
}

function TutorialOverlay() {
  const step = useGameStore((s) => s.tutorialStep);
  const setStep = useGameStore((s) => s.setTutorialStep);
  const finish = useGameStore((s) => s.finishTutorial);
  const setView = useGameStore((s) => s.setView);
  if (step === null) return null;
  const data = TUTORIAL_STEPS[Math.min(step, TUTORIAL_STEPS.length - 1)];
  const last = step >= TUTORIAL_STEPS.length - 1;
  return (
    <div className="tutorial-backdrop" role="dialog" aria-modal="true" aria-label={data.title}>
      <div className="tutorial-card">
        <div className="tutorial-card__head">
          <span className="tutorial-card__icon"><Icon name={data.icon} size={22} /></span>
          <div>
            <div className="eyebrow">Onboarding · passo {step + 1} de {TUTORIAL_STEPS.length}</div>
            <h2>{data.title}</h2>
          </div>
          <button className="icon-button" onClick={finish} aria-label="Fechar tutorial" type="button"><Icon name="X" size={16} /></button>
        </div>
        <p className="tutorial-card__body">{data.body}</p>
        <div className="tutorial-card__hint"><Icon name="Lightbulb" size={14} /> {data.hint}</div>
        <div className="tutorial-card__actions">
          <button className="button button--ghost" onClick={finish} type="button">Pular tutorial</button>
          <div>
            <button className="button button--ghost" onClick={() => setView(data.view)} type="button"><Icon name="Eye" size={13} /> Ver tela</button>
            <button className="button button--primary" onClick={() => { if (last) finish(); else setStep(step + 1); }} type="button">
              {last ? 'Começar a operar' : 'Próximo'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EndGameModal() {
  const game = useGameStore((s) => s.game);
  const startNewGame = useGameStore((s) => s.startNewGame);
  const goToMenu = useGameStore((s) => s.goToMenu);
  if (!game || game.phase === 'playing') return null;
  const playerDef = FACTIONS[game.playerFactionId];
  const parts = scoreParts(game, game.playerFactionId);
  const score = parts.reduce((sum, part) => sum + part.value, 0);
  const rank = rankOf(score);
  const victory = game.phase === 'victory';
  return (
    <Modal
      open
      title={victory ? 'O mercado reconhece a nova líder' : 'A companhia encerrou as atividades'}
      eyebrow={victory ? 'Campanha vencida' : 'Campanha encerrada'}
      icon={victory ? 'Crown' : 'Flame'}
      size="md"
      hideClose
      footer={
        <>
          <button className="button button--ghost" onClick={goToMenu} type="button">Voltar ao menu</button>
          <button className="button button--primary" onClick={() => startNewGame()} type="button"><Icon name="RotateCcw" size={14} /> Nova campanha</button>
        </>
      }
    >
      <div className="endgame-card">
        <span className="endgame-card__icon" style={{ color: playerDef.color }}><Icon name={victory ? 'Crown' : 'Flame'} size={38} /></span>
        <div className="eyebrow">{playerDef.name} · ciclo {game.cycle}</div>
        <h3>{victory ? 'Liderança consolidada' : 'Fim da companhia'}</h3>
        <p>
          {victory
            ? `O conselho encerra a disputa com ${score} pontos. As rivais reconhecem a nova líder do setor.`
            : 'O capital caiu e a campanha termina aqui. Um novo mundo pode ser fundado nas configurações ou na tela inicial.'}
        </p>
      </div>
      <div className="endgame-stats">
        <div><span>Pontuação</span><strong>{score}</strong></div>
        <div><span>Posição</span><strong>{rank.name}</strong></div>
        <div><span>Praças</span><strong>{game.tiles ? Object.values(game.tiles).filter((tile) => tile.owner === game.playerFactionId).length : 0}</strong></div>
        <div><span>Ciclos</span><strong>{game.cycle}</strong></div>
      </div>
      <div className="endgame-rules">
        {parts.slice(0, 4).map((part) => (
          <div className="endgame-rule" key={part.label}>
            <span><Icon name="TrendingUp" size={14} /></span>
            <div><strong>{part.label} · {part.value}</strong><p>{part.detail}</p></div>
          </div>
        ))}
      </div>
      <div className="endgame-progress">
        <ProgressBar value={score} max={VICTORY_TARGET} tone={victory ? 'teal' : 'gold'} />
        <small>{score} de {VICTORY_TARGET} pontos de relevância para a vitória</small>
      </div>
    </Modal>
  );
}

function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  const remove = useGameStore((s) => s.removeToast);
  if (!toasts.length) return null;
  const icons: Record<string, string> = { success: 'Check', error: 'AlertTriangle', info: 'Info', warning: 'AlertTriangle', operation: 'Store' };
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((toast) => (
        <div className={cx('toast', `toast--${toast.kind}`)} key={toast.id}>
          <span className="toast__icon"><Icon name={icons[toast.kind] ?? 'Info'} size={15} /></span>
          <div className="toast__body">
            <strong>{toast.title}</strong>
            {toast.message ? <p>{toast.message}</p> : null}
          </div>
          <button className="toast__close" onClick={() => remove(toast.id)} aria-label="Dispensar" type="button"><Icon name="X" size={12} /></button>
        </div>
      ))}
    </div>
  );
}
