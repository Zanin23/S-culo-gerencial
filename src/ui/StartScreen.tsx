import type { CSSProperties } from 'react';
import { FACTIONS, GAME } from '../game/constants';
import { scoreOf, VICTORY_TARGET } from '../game/progress';
import { useGameStore } from '../store/gameStore';
import { fmt } from './format';
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
      <div className="start-screen__hexes" aria-hidden="true">
        {Array.from({ length: 17 }).map((_, index) => (
          <span key={index} style={{ '--i': index } as CSSProperties} />
        ))}
      </div>

      <div className="start-screen__content">
        <section className="start-hero">
          <div className="start-hero__brand">
            <span className="brand__mark brand__mark--xl" aria-hidden="true">
              <span /><span /><span />
            </span>
            <div>
              <div className="eyebrow">Estratégia territorial · {GAME.world}</div>
              <h1>{GAME.name}</h1>
              <p className="start-hero__subtitle">Crônicas da Partilha</p>
            </div>
          </div>
          <p className="start-hero__lede">
            Quatro Casas disputam a Terra. Escolha uma cidade real, erga a sede no lote que quiser e governe ruas, prédios e rotas até a hegemonia.
            Construa uma economia, negocie com rivais e transforme um porto pequeno na potência que
            dita a ordem do mundo.
          </p>
          <div className="start-hero__tagline">
            <span className="rule" />
            “Toda fronteira é uma decisão.”
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
              {saved ? 'Nova campanha' : 'Fundar Concórdia'}
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
            <span><Icon name="Building2" size={13} /> Cidade-sede em 3D</span>
            <span><Icon name="Save" size={13} /> Salvamento local no navegador</span>
            <span><Icon name="ScrollText" size={13} /> Campanha por ciclos</span>
            <span><Icon name="Swords" size={13} /> IA estratégica, sem trapaças</span>
          </div>
        </section>

        <aside className="briefing">
          <div className="briefing__top">
            <div>
              <div className="eyebrow">Briefing do Conselho</div>
              <h2>{saved ? 'Campanha em andamento' : 'O mundo aguarda'}</h2>
            </div>
            <span className={`briefing__seal ${saved ? 'is-live' : ''}`}>{saved ? 'ATIVA' : 'NOVO'}</span>
          </div>

          {saved && player ? (
            <div className="briefing__campaign">
              <div className="briefing__campaign-row">
                <div>
                  <span className="eyebrow">Casa</span>
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
                Você governa a <strong>Casa Concórdia</strong>: Portugal e Espanha, a rota do Atlântico e uma dívida de
                confiança com as outras Casas. O caminho até a hegemonia passa por escolhas — não por um único exército.
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
                    <small>{isPlayer ? 'Sua Casa · Equilíbrio' : house.epithet}</small>
                  </div>
                  <span className="house-row__leader">{isPlayer ? 'Você' : house.leader}</span>
                </div>
              );
            })}
          </div>

          <div className="briefing__foot">
            <Icon name="Compass" size={14} />
            <span>O mundo continua apenas quando você encerra o ciclo.</span>
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
