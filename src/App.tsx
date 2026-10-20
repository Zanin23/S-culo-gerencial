import { useEffect, useState } from 'react';
import { FACTIONS, RESOURCES, RESOURCE_KEYS } from './game/constants';
import { eventById, type EventEffect } from './game/events';
import { rankOf, scoreParts, VICTORY_TARGET } from './game/progress';
import type { CycleReport, ResourceKey } from './game/types';
import { CYCLE_SECONDS, useGameStore } from './store/gameStore';
import { ChroniclePanel } from './ui/ChroniclePanel';
import { ConstructionPanel } from './ui/ConstructionPanel';
import { DiplomacyPanel } from './ui/DiplomacyPanel';
import { EconomyPanel } from './ui/EconomyPanel';
import { ExpansionPanel } from './ui/ExpansionPanel';
import { fmt, fmtRate, trendClass } from './ui/format';
import { Icon } from './ui/Icon';
import { MapView } from './ui/MapView';
import { NavRail } from './ui/NavRail';
import { ObjectivesPanel } from './ui/ObjectivesPanel';
import { OverviewPanel } from './ui/OverviewPanel';
import { Badge, cx, Modal, ProgressBar } from './ui/primitives';
import { SettingsPanel } from './ui/SettingsPanel';
import { StartScreen } from './ui/StartScreen';
import { TechPanel } from './ui/TechPanel';
import { TerritoryPanel } from './ui/TerritoryPanel';
import { TopBar } from './ui/TopBar';

const VIEWS = {
  map: MapView,
  economy: EconomyPanel,
  construction: ConstructionPanel,
  tech: TechPanel,
  expansion: ExpansionPanel,
  diplomacy: DiplomacyPanel,
  objectives: ObjectivesPanel,
  chronicle: ChroniclePanel,
  settings: SettingsPanel,
} as const;

const TUTORIAL_STEPS: Array<{ title: string; body: string; icon: string; view: 'map' | 'economy' | 'construction' | 'tech' | 'diplomacy' | 'objectives'; hint: string }> = [
  {
    title: 'Sua Casa, seu mundo',
    body: 'Você governa a Casa Concórdia, dona de Portugal e Espanha no coração da Terra. Cada país tem solo, depósito natural, população e estruturas próprias — clique para ler a ficha antes de decidir. Aproxime para explorar províncias e cidades.',
    icon: 'Globe2',
    view: 'map',
    hint: 'Arraste para girar o globo, use a roda ou os botões para aproximar e clique em países, províncias e cidades. Duplo clique foca o país.',
  },
  {
    title: 'O ciclo move o mundo',
    body: `A cada ${CYCLE_SECONDS} segundos um ciclo fecha: produção entra, consumo sai, projetos avançam, a IA age e eventos podem surgir. Use Avançar para controlar o ritmo ou deixe o autoplay ligado — nada acontece fora do ciclo.`,
    icon: 'Play',
    view: 'map',
    hint: 'Espaço avança um ciclo. O autoplay pausa automaticamente ao abrir modais.',
  },
  {
    title: 'Construir também é expandir',
    body: 'Obras elevam o desenvolvimento local, desbloqueiam produção e sustentam fronteiras maiores. O capital é a âncora: quanto mais desenvolvido, mais longe você pode reivindicar sem guerra — e o objetivo de capital exige exatamente isso.',
    icon: 'Hammer',
    view: 'construction',
    hint: 'Cada território tem vagas limitadas. Obras ocupam uma vaga de projeto até concluir.',
  },
  {
    title: 'Ciência com trade-offs',
    body: 'A árvore tem quatro ramos e nenhuma trilha obrigatória. Economia acelera o mercado, expansão reduz o custo de fronteira, indústria melhora produtos e defesa aumenta o teto militar. Toda tecnologia custa conhecimento e créditos.',
    icon: 'FlaskConical',
    view: 'tech',
    hint: 'Pré-requisitos aparecem em cinza. O desconto de pesquisa é global e ajuda a alcançar tiers altos.',
  },
  {
    title: 'A guerra é uma decisão, não um botão',
    body: 'Expedições exigem guerra declarada, fronteira comum e poder militar. Operações custam créditos, materiais, bens e influência, resolvem por força relativa com risco e deixam consequências na região. Diplomacia costuma ser mais barata.',
    icon: 'Swords',
    view: 'diplomacy',
    hint: 'Pactos geram receita e estabilidade, mas limitam quem você pode atacar.',
  },
  {
    title: 'O objetivo é a hegemonia',
    body: `Vença alcançando ${VICTORY_TARGET} pontos ou cumprindo a meta de desenvolvimento do capital. Você perde se perder o capital ou ficar sem territórios. As quatro Casas adversárias perseguem doutrinas diferentes e não recebem vantagens ocultas.`,
    icon: 'Award',
    view: 'objectives',
    hint: 'A aba Campanha lista objetivos, ranking e a composição exata da sua pontuação.',
  },
];

const HELP_CARDS = [
  { icon: 'Map', title: 'Leia o território', body: 'Solo, depósito, população, estruturas e valor estratégico determinam o que cada país pode render. Clique para abrir a ficha completa.' },
  { icon: 'Play', title: 'Decida no ciclo', body: 'Produção, consumo, manutenção e projetos só mudam quando um ciclo fecha. Avance manualmente ou deixe o autoplay correr.' },
  { icon: 'Hammer', title: 'Desenvolver ou avançar', body: 'Um território rico e construído pode valer mais que dois pobres recém-reivindicados. O capital desenvolvido é a âncora da expansão.' },
  { icon: 'Handshake', title: 'Negocie antes de lutar', body: 'Acordos geram receita e segurança. Guerra custa caro, exige preparação e desestabiliza a região — mas resolve disputas que a diplomacia não resolve.' },
  { icon: 'FlaskConical', title: 'Escolha um caminho', body: 'São quatro ramos de pesquisa com pré-requisitos claros. Nenhuma tecnologia é obrigatória; cada uma troca custo por uma vantagem concreta.' },
  { icon: 'Award', title: 'Persiga a hegemonia', body: `${VICTORY_TARGET} pontos ou a meta de desenvolvimento do capital encerram a partida. Perder o capital ou ficar sem territórios é derrota.` },
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
      const index = Number.parseInt(event.key, 10);
      if (index >= 1 && index <= Object.keys(VIEWS).length) {
        event.preventDefault();
        store.setView(Object.keys(VIEWS)[index - 1] as keyof typeof VIEWS);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [helpOpen]);

  if (!booted) {
    return (
      <div className="boot-screen">
        <h1>TESSERA</h1>
        <p className="eyebrow">Crônicas do mundo</p>
        <div className="boot-screen__bar"><span /></div>
      </div>
    );
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
          <NavRail onHelp={() => setHelpOpen(true)} />
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
      title="Como governar o mundo"
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
          <strong>Recursos e atalhos</strong>
          <p>{RESOURCE_KEYS.map((key: ResourceKey) => RESOURCES[key].label).join(' · ')}. Teclas 1–9 trocam de tela, espaço avança um ciclo, Esc fecha modais e ? abre este manual.</p>
        </div>
        <div>
          <strong>Sem jogadores fictícios</strong>
          <p>As quatro Casas adversárias são IA declaradas, com doutrinas visíveis. O motor separa estado, comandos e ciclo para receber um servidor autoritativo em uma versão futura.</p>
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
      subtitle={`Ciclo ${game.cycle}. A decisão entra em vigor imediatamente e fica registrada nas crônicas.`}
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

function describeEffect(effect: EventEffect): string {
  const parts: string[] = [];
  if (effect.stockDelta) {
    for (const [key, value] of Object.entries(effect.stockDelta)) {
      if (!value) continue;
      parts.push(`${value > 0 ? '+' : '−'}${fmt(Math.abs(value))} ${RESOURCES[key as ResourceKey].short}`);
    }
  }
  if (effect.allStockDelta) {
    const entries = Object.entries(effect.allStockDelta).filter(([, value]) => value);
    if (entries.length) parts.push(entries.map(([key, value]) => `${(value ?? 0) > 0 ? '+' : '−'}${fmt(Math.abs(value ?? 0))} ${RESOURCES[key as ResourceKey].short}`).join(' · '));
  }
  if (effect.cost) {
    for (const [key, value] of Object.entries(effect.cost)) {
      if (!value) continue;
      parts.push(`custa ${fmt(Math.abs(value))} ${RESOURCES[key as ResourceKey].short}`);
    }
  }
  if (effect.unrest) parts.push(`desordem ${effect.unrest > 0 ? '+' : ''}${effect.unrest}`);
  if (effect.relations) parts.push(`relações ${effect.relations > 0 ? '+' : ''}${effect.relations}`);
  if (effect.military) parts.push(`poder militar ${effect.military > 0 ? '+' : ''}${fmt(effect.military)}`);
  if (effect.modifier) parts.push(`${effect.modifier.label} por ${effect.modifier.cycles} ciclos`);
  return parts.length ? parts.join(' · ') : effect.log;
}

function CycleDigest() {
  const digest = useGameStore((s) => s.digest);
  const dismiss = useGameStore((s) => s.dismissDigest);
  return (
    <Modal
      open={Boolean(digest)}
      onClose={dismiss}
      title={digest ? `Ciclo ${String(digest.cycle).padStart(2, '0')} concluído` : ''}
      eyebrow="Boletim do conselho"
      icon="Activity"
      size="md"
      footer={<button className="button button--primary" onClick={dismiss} type="button">Continuar governando</button>}
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
          <h4><Icon name="Activity" size={12} /> Fluxos do ciclo</h4>
          {RESOURCE_KEYS.map((key) => (
            <div className="digest-row" key={key}>
              <span><Icon name={RESOURCES[key].icon} size={12} /> {RESOURCES[key].short}</span>
              <strong className={trendClass(report.deltas[key])}>{fmtRate(report.deltas[key])}</strong>
              <span>{fmt(report.production[key])} / {fmt(report.consumption[key])}</span>
            </div>
          ))}
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
              Saldo de créditos projetado: <strong className={trendClass(report.deltas.creditos)}>{fmtRate(report.deltas.creditos)}</strong>
            </p>
          </div>
        </div>
      </div>
      {report.battles.length ? (
        <section className="digest-section digest-section--battle">
          <h4><Icon name="Swords" size={12} /> Frente militar</h4>
          {report.battles.map((battle) => (
            <p key={`${battle.tileId}-${battle.cycle}`}>
              <strong>{battle.tileName}</strong> · {FACTIONS[battle.attacker].short} × {FACTIONS[battle.defender].short} · {battle.success ? 'vitória' : 'derrota'} · perdas {Math.round(battle.attackerLoss)} / {Math.round(battle.defenderLoss)}
            </p>
          ))}
        </section>
      ) : null}
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
              {last ? 'Começar a governar' : 'Próximo'}
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
      title={victory ? 'O mundo reconhece sua hegemonia' : 'A Casa perdeu o mundo'}
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
        <h3>{victory ? 'Hegemonia consolidada' : 'Fim da linhagem'}</h3>
        <p>
          {victory
            ? `O conselho encerra a disputa com ${score} pontos. As Casas restantes reconhecem a nova ordem do mundo.`
            : 'O capital caiu e a campanha termina aqui. Um novo mundo pode ser fundado nas configurações ou na tela inicial.'}
        </p>
      </div>
      <div className="endgame-stats">
        <div><span>Pontuação</span><strong>{score}</strong></div>
        <div><span>Posição</span><strong>{rank.name}</strong></div>
        <div><span>Territórios</span><strong>{game.tiles ? Object.values(game.tiles).filter((tile) => tile.owner === game.playerFactionId).length : 0}</strong></div>
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
        <small>{score} de {VICTORY_TARGET} pontos para a vitória por hegemonia</small>
      </div>
    </Modal>
  );
}

function Toasts() {
  const toasts = useGameStore((s) => s.toasts);
  const remove = useGameStore((s) => s.removeToast);
  if (!toasts.length) return null;
  const icons: Record<string, string> = { success: 'Check', error: 'AlertTriangle', info: 'Info', warning: 'AlertTriangle', battle: 'Swords' };
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
