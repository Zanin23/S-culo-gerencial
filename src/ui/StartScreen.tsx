import { FACTIONS, GAME } from '../game/constants';
import { scoreOf, VICTORY_TARGET } from '../game/progress';
import { useGameStore } from '../store/gameStore';
import { fmt } from './format';
import { WaxSeal } from './art/Glyph';
import { Icon } from './Icon';
import { ProgressBar } from './primitives';

export function StartScreen({ onHelp }: { onHelp: () => void }) {
  const saved = useGameStore((s) => s.savedGame);
  const loadError = useGameStore((s) => s.loadError);
  const openSeat = useGameStore((s) => s.openSeat);
  const continueGame = useGameStore((s) => s.continueGame);
  const requestConfirm = useGameStore((s) => s.requestConfirm);

  const score = saved ? scoreOf(saved, saved.playerFactionId) : 0;
  const cycle = saved?.cycle ?? 1;
  const player = saved?.factions[saved.playerFactionId];

  const newCampaign = () => {
    if (saved) {
      requestConfirm({
        title: 'Fundar um novo mundo',
        body: 'A campanha salva será substituída por um novo Terra. Exporte o save atual nas configurações se quiser preservá-lo.',
        confirmLabel: 'Iniciar nova campanha',
        tone: 'danger',
        onConfirm: openSeat,
      });
    } else {
      openSeat();
    }
  };

  return (
    <div className="start-screen">
      <div className="start-screen__grain" aria-hidden="true" />
      {/* Carta de fundo: rose dos ventos e meridianos, no lugar dos hexágonos. */}
      <svg className="start-screen__chart" viewBox="0 0 400 400" aria-hidden="true">
        <g fill="none" stroke="currentColor" strokeWidth="1">
          {Array.from({ length: 9 }).map((_, index) => (
            <circle key={index} cx="200" cy="200" r={38 + index * 20} opacity={0.5 - index * 0.04} strokeDasharray={index % 2 ? '2 6' : undefined} />
          ))}
          {Array.from({ length: 12 }).map((_, index) => {
            const angle = (index * Math.PI) / 6;
            return <line key={`r${index}`} x1={200 + Math.cos(angle) * 34} y1={200 + Math.sin(angle) * 34} x2={200 + Math.cos(angle) * 198} y2={200 + Math.sin(angle) * 198} opacity={0.22} />;
          })}
        </g>
        <path d="M200 44 232 200 200 356 168 200Z" fill="currentColor" opacity="0.16" />
        <path d="M44 200 200 168 356 200 200 232Z" fill="currentColor" opacity="0.1" />
        <circle cx="200" cy="200" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.5" />
      </svg>

      <div className="start-screen__content">
        <section className="start-hero">
          <div className="start-hero__brand">
            <WaxSeal size={78} letter="M" />
            <div>
              <div className="eyebrow">Gestão de companhias · {GAME.world}</div>
              <h1>{GAME.name}</h1>
              <p className="start-hero__subtitle">Crônicas do mercado</p>
            </div>
          </div>
          <p className="start-hero__lede">
            Quatro companhias disputam o mundo. Escolha uma cidade real, erga a sede no lote que quiser e administre filiais, obras e rotas até a hegemonia.
            Construa uma economia, negocie com rivais e transforme um porto pequeno no grupo que
            dita a ordem do mercado.
          </p>
          <div className="start-hero__tagline">
            <span className="rule" />
            “Todo mercado é uma decisão.”
          </div>

          <div className="start-actions">
            {saved ? (
              <button className="button button--primary button--large" onClick={continueGame} type="button">
                <Icon name="Play" size={17} />
                Retomar campanha
                <span className="button__meta">Ciclo {cycle}</span>
              </button>
            ) : null}
            <button className={saved ? 'button button--ghost button--large' : 'button button--primary button--large'} onClick={newCampaign} type="button">
              <Icon name="Landmark" size={17} />
              {saved ? 'Nova campanha' : 'Fundar o grupo'}
            </button>
            <button className="button button--quiet button--large" onClick={onHelp} type="button">
              <Icon name="HelpCircle" size={17} />
              Como jogar
            </button>
          </div>

          {loadError ? (
            <div className="start-warning" role="alert">
              <Icon name="AlertTriangle" size={16} />
              <span>{loadError} Um novo mundo ainda pode ser criado.</span>
            </div>
          ) : null}

          <div className="start-meta">
            <span><Icon name="Building2" size={13} /> Sede em 3D</span>
            <span><Icon name="Save" size={13} /> Salvamento local no navegador</span>
            <span><Icon name="ScrollText" size={13} /> Campanha por ciclos</span>
            <span><Icon name="Store" size={13} /> Rivais com doutrina própria</span>
          </div>
        </section>

        <aside className="briefing">
          <div className="briefing__top">
            <div>
              <div className="eyebrow">Briefing da diretoria</div>
              <h2>{saved ? 'Campanha em andamento' : 'O mercado aguarda'}</h2>
            </div>
            <span className={`briefing__seal ${saved ? 'is-live' : ''}`}>{saved ? 'ATIVA' : 'NOVO'}</span>
          </div>

          {saved && player ? (
            <div className="briefing__campaign">
              <div className="briefing__campaign-row">
                <div>
                  <span className="eyebrow">Companhia</span>
                  <strong>{FACTIONS[saved.playerFactionId].name}</strong>
                  <small>{FACTIONS[saved.playerFactionId].epithet}</small>
                </div>
                <div className="briefing__score">
                  <span className="eyebrow">Hegemonia</span>
                  <strong>{fmt(score)}<small> / {VICTORY_TARGET}</small></strong>
                </div>
              </div>
              <ProgressBar value={score} max={VICTORY_TARGET} tone="gold" />
              <div className="briefing__stats">
                <span><b>{cycle}</b> ciclo</span>
                <span><b>{fmt(player.stocks.creditos)}</b> créditos</span>
                <span><b>{Object.values(saved.tiles).filter((t) => t.owner === saved.playerFactionId).length}</b> países</span>
                <span><b>{player.techs.length}</b> tecnologias</span>
              </div>
            </div>
          ) : (
            <div className="briefing__campaign briefing__campaign--intro">
              <p>
                Você dirige o <strong>Grupo Concórdia</strong>: Portugal e Espanha, a rota do Atlântico e uma dívida de
                confiança com as outras companhias. O caminho até a hegemonia passa por decisões de gestão — não por uma única jogada.
              </p>
              <div className="briefing__pills">
                <span><Icon name="Target" size={13} /> 360 de hegemonia</span>
                <span><Icon name="Handshake" size={13} /> 3 rivais com doutrinas próprias</span>
                <span><Icon name="FlaskConical" size={13} /> 16 tecnologias</span>
              </div>
            </div>
          )}

          <div className="briefing__houses">
            {(Object.keys(FACTIONS) as Array<keyof typeof FACTIONS>).map((id) => {
              const house = FACTIONS[id];
              const isPlayer = id === 'concordia';
              return (
                <div className={`house-row ${isPlayer ? 'is-player' : ''}`} key={id}>
                  <span className="house-row__sigil" style={{ borderColor: house.color, color: house.color }}>
                    {house.short.slice(0, 1)}
                  </span>
                  <div className="house-row__body">
                    <strong>{house.short}</strong>
                    <small>{isPlayer ? 'Sua companhia · Equilíbrio' : house.epithet}</small>
                  </div>
                  <span className="house-row__leader">{isPlayer ? 'Você' : house.leader}</span>
                </div>
              );
            })}
          </div>

          <div className="briefing__foot">
            <Icon name="Compass" size={14} />
            <span>O mercado só se move quando você encerra o ciclo.</span>
          </div>
        </aside>
      </div>
      <footer className="start-footer">
        <span>{GAME.name} · build {GAME.version}.0 · MVP jogável</span>
        <span>Dados e regras processados localmente. Nenhuma conta necessária.</span>
      </footer>
    </div>
  );
}
