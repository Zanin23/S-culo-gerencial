import { useMemo, useState } from 'react';
import { BUILDINGS, TECH_BRANCHES, TECHS, TECH_ORDER, type TechBranch, type TechDef } from '../game/constants';
import { computeEconomy, moneyOf, projectSlotsOf, researchDiscountFor } from '../game/economy';
import type { TechId } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { fmt, money } from './format';
import { Icon } from './Icon';
import { Badge, Cost, cx, Modal, ProgressBar, SectionHeader } from './primitives';
import { ViewShell } from './ViewShell';

/** Pesquisa é paga em caixa: conhecimento e créditos entram convertidos. */
function cashCost(conhecimento: number, creditos: number, discount: number): number {
  return Math.round(moneyOf({
    conhecimento: Math.max(1, Math.round(conhecimento * (1 - discount))),
    creditos: Math.max(1, Math.round(creditos * (1 - discount))),
  }));
}

const BRANCH_ORDER: TechBranch[] = ['economia', 'industria', 'logistica', 'estado'];

function TechCard({
  tech,
  selected,
  onSelect,
}: {
  tech: TechDef;
  selected: boolean;
  onSelect: () => void;
}) {
  const game = useGameStore((s) => s.game)!;
  const research = useGameStore((s) => s.research);
  const setView = useGameStore((s) => s.setView);
  const playerId = game.playerFactionId;
  const faction = game.factions[playerId];
  const done = faction.techs.includes(tech.id);
  const project = game.projects.find((p) => p.factionId === playerId && p.techId === tech.id);
  const missingPrereqs = tech.requires.filter((req) => !faction.techs.includes(req));
  const discount = researchDiscountFor(game, playerId);
  const cost = { creditos: cashCost(tech.cost.conhecimento, tech.cost.creditos, discount) };
  const affordable = faction.stocks.creditos >= cost.creditos;
  const hasSlot = game.projects.filter((p) => p.factionId === playerId).length < projectSlotsOf(faction);
  const status = done ? 'done' : project ? 'researching' : missingPrereqs.length ? 'locked' : 'available';
  const branch = TECH_BRANCHES[tech.branch];

  return (
    <article className={cx('tech-card', `is-${status}`, selected && 'is-selected')}>
      <button className="tech-card__main" onClick={onSelect} type="button" aria-label={`Detalhes de ${tech.name}`}>
        <div className="tech-card__head">
          <span className="tech-card__icon" style={{ color: done ? branch.color : undefined }}><Icon name={tech.icon} size={17} /></span>
          <div>
            <span className="tech-card__tier">Nível {tech.tier}</span>
            <strong>{tech.name}</strong>
          </div>
          {done ? <span className="tech-card__status is-done"><Icon name="Check" size={12} /></span> : status === 'locked' ? <span className="tech-card__status"><Icon name="Lock" size={12} /></span> : null}
        </div>
        <p>{tech.description}</p>
        <div className="tech-card__benefits">
          {tech.benefits.slice(0, 2).map((benefit) => <span key={benefit}><i /> {benefit}</span>)}
        </div>
      </button>
      <div className="tech-card__foot">
        {done ? (
          <Badge tone="teal" icon="Check">Pesquisada</Badge>
        ) : project ? (
          <div className="tech-card__progress">
            <ProgressBar value={Math.max(0, game.cycle - project.startedCycle)} max={Math.max(1, project.completesCycle - project.startedCycle)} tone="blue" thin />
            <span>Ciclo {project.completesCycle}</span>
          </div>
        ) : (
          <>
            <Cost cost={cost} stocks={faction.stocks} compact />
            <button
              className="button button--tiny button--primary"
              disabled={status === 'locked' || !affordable || !hasSlot}
              onClick={(event) => { event.stopPropagation(); research(tech.id); }}
              title={status === 'locked' ? `Requer ${missingPrereqs.map((id) => TECHS[id].name).join(', ')}` : !hasSlot ? 'Sem vagas de projeto' : !affordable ? 'Recursos insuficientes' : 'Iniciar pesquisa'}
              type="button"
            >
              Pesquisar
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export function TechPanel() {
  const game = useGameStore((s) => s.game)!;
  const research = useGameStore((s) => s.research);
  const setView = useGameStore((s) => s.setView);
  const playerId = game.playerFactionId;
  const faction = game.factions[playerId];
  const eco = useMemo(() => computeEconomy(game, playerId), [game, playerId]);
  const [selected, setSelected] = useState<TechId | null>(null);
  const [branchFilter, setBranchFilter] = useState<TechBranch | 'all'>('all');
  const selectedTech = selected ? TECHS[selected] : null;
  const discount = researchDiscountFor(game, playerId);
  const slots = projectSlotsOf(faction);
  const activeResearch = game.projects.filter((p) => p.factionId === playerId && p.kind === 'pesquisa');
  const completed = faction.techs.length;
  const completedByBranch = BRANCH_ORDER.map((branch) => ({
    branch,
    done: faction.techs.filter((id) => TECHS[id].branch === branch).length,
    total: TECH_ORDER.filter((id) => TECHS[id].branch === branch).length,
  }));

  return (
    <ViewShell
      eyebrow="Conselho de ciência"
      title="Árvore tecnológica"
      subtitle="Cada ramo abre caminhos diferentes. Pesquisas ocupam vagas de projeto e são pagas em caixa, com desconto dos centros de P&D."
      icon="FlaskConical"
      actions={<Badge tone="blue" icon="Lock">{completed}/{TECH_ORDER.length} concluídas</Badge>}
    >
      {eco.production.conhecimento < 1 ? (
        <div className="callout callout--gold">
          <Icon name="FlaskConical" size={17} />
          <span>
            <strong>Sua companhia ainda não tem centro de P&D</strong>
            <small>Pesquisas são pagas em caixa, mas cada Centro de P&D também converte pesquisa em receita e reduz o custo dos projetos.</small>
          </span>
          <button className="button button--tiny button--gold" onClick={() => setView('construction')} type="button">Ir às obras</button>
        </div>
      ) : null}

      <div className="summary-grid summary-grid--4">
        <div className="summary-card summary-card--blue">
          <span className="summary-card__label"><Icon name="Coins" size={14} /> Caixa para pesquisa</span>
          <strong>{money(faction.stocks.creditos)}</strong>
          <span className="summary-card__delta">{money(eco.finance.income)}/ciclo</span>
          <small>Centros de P&amp;D entram na receita e reduzem o custo dos projetos</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Hammer" size={14} /> Vagas de projeto</span>
          <strong>{game.projects.filter((p) => p.factionId === playerId).length} <small>/ {slots}</small></strong>
          <ProgressBar value={game.projects.filter((p) => p.factionId === playerId).length} max={slots} tone="teal" thin />
          <small>Pesquisas e obras compartilham as mesmas vagas</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Lightbulb" size={14} /> Desconto de pesquisa</span>
          <strong>{Math.round(discount * 100)}%</strong>
          <span className="summary-card__delta">modificadores ativos</span>
          <small>Eventos e o Instituto Global reduzem custos</small>
        </div>
        <div className="summary-card">
          <span className="summary-card__label"><Icon name="Shield" size={14} /> Poder científico</span>
          <strong>{faction.techs.length}</strong>
          <span className="summary-card__delta">tecnologias ativas</span>
          <small>Bônus de gestão e de mercado combinados</small>
        </div>
      </div>

      {activeResearch.length ? (
        <section className="view-card">
          <SectionHeader eyebrow="Em andamento" title="Pesquisas ativas" icon="FlaskConical" />
          <div className="project-grid">
            {activeResearch.map((project) => (
              <div className="project-card" key={project.id}>
                <span className="project-card__icon"><Icon name="FlaskConical" size={17} /></span>
                <div>
                  <strong>{project.label}</strong>
                  <ProgressBar value={Math.max(0, game.cycle - project.startedCycle)} max={Math.max(1, project.completesCycle - project.startedCycle)} tone="blue" thin />
                  <small>Conclui no ciclo {project.completesCycle} · {Math.max(0, project.completesCycle - game.cycle)} ciclo(s)</small>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="branch-progress">
        {completedByBranch.map((row) => {
          const branch = TECH_BRANCHES[row.branch];
          return (
            <button
              key={row.branch}
              className={cx('branch-pill', branchFilter === row.branch && 'is-active')}
              onClick={() => setBranchFilter(branchFilter === row.branch ? 'all' : row.branch)}
              type="button"
            >
              <span style={{ color: branch.color }}><Icon name={branch.icon} size={14} /></span>
              {branch.name}
              <b>{row.done}/{row.total}</b>
            </button>
          );
        })}
        {branchFilter !== 'all' ? (
          <button className="branch-pill branch-pill--clear" onClick={() => setBranchFilter('all')} type="button">
            <Icon name="X" size={12} /> limpar filtro
          </button>
        ) : null}
      </div>

      <div className={cx('tech-branches', branchFilter !== 'all' && 'tech-branches--single')}>
        {BRANCH_ORDER.filter((branch) => branchFilter === 'all' || branchFilter === branch).map((branch) => {
          const meta = TECH_BRANCHES[branch];
          return (
            <section className="tech-branch" key={branch}>
              <header className="tech-branch__head">
                <span className="tech-branch__icon" style={{ color: meta.color, borderColor: `${meta.color}44`, background: `${meta.color}12` }}>
                  <Icon name={meta.icon} size={18} />
                </span>
                <div>
                  <h3>{meta.name}</h3>
                  <p>{meta.description}</p>
                </div>
              </header>
              <div className="tech-branch__list">
                {TECH_ORDER.filter((id) => TECHS[id].branch === branch).map((id) => (
                  <TechCard key={id} tech={TECHS[id]} selected={selected === id} onSelect={() => setSelected(id)} />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="panel-note">
        <Icon name="Info" size={14} />
        <p>Pré-requisitos são obrigatórios. Pesquisar não exige que a tecnologia anterior esteja na mesma praça. Os pontos de P&amp;D acumulam entre ciclos e não é gasto por manutenção.</p>
      </div>

      <Modal
        open={Boolean(selectedTech)}
        onClose={() => setSelected(null)}
        title={selectedTech?.name}
        eyebrow={selectedTech ? `${TECH_BRANCHES[selectedTech.branch].name} · Nível ${selectedTech.tier}` : undefined}
        icon={selectedTech?.icon}
        subtitle={selectedTech?.description}
        size="md"
        footer={
          selectedTech ? (
            <>
              <button className="button button--ghost" onClick={() => setSelected(null)} type="button">Fechar</button>
              {faction.techs.includes(selectedTech.id) ? (
                <span className="modal-done"><Icon name="Check" size={15} /> Tecnologia concluída</span>
              ) : game.projects.some((p) => p.techId === selectedTech.id) ? (
                <span className="modal-done"><Icon name="FlaskConical" size={15} /> Pesquisa em andamento</span>
              ) : (
                <button
                  className="button button--primary"
                  disabled={selectedTech.requires.some((req) => !faction.techs.includes(req)) || faction.stocks.creditos < cashCost(selectedTech.cost.conhecimento, selectedTech.cost.creditos, discount) || game.projects.filter((p) => p.factionId === playerId).length >= slots}
                  onClick={() => { if (research(selectedTech.id)) setSelected(null); }}
                  type="button"
                >
                  <Icon name="FlaskConical" size={15} /> Iniciar pesquisa
                </button>
              )}
            </>
          ) : null
        }
      >
        {selectedTech ? (
          <div className="tech-detail">
            <div className="tech-detail__status">
              <Badge tone={faction.techs.includes(selectedTech.id) ? 'teal' : 'blue'}>
                {faction.techs.includes(selectedTech.id) ? 'Pesquisada' : selectedTech.requires.length ? 'Requer pré-requisitos' : 'Disponível'}
              </Badge>
              <span className="muted small">Custo base: {money(selectedTech.cost.creditos + moneyOf({ conhecimento: selectedTech.cost.conhecimento }))}</span>
            </div>
            <div className="tech-detail__grid">
              <div>
                <h4>Benefícios</h4>
                <ul className="benefit-list">
                  {selectedTech.benefits.map((benefit) => <li key={benefit}><Icon name="Check" size={13} />{benefit}</li>)}
                </ul>
              </div>
              <div>
                <h4>Pré-requisitos</h4>
                {selectedTech.requires.length ? (
                  <ul className="benefit-list benefit-list--muted">
                    {selectedTech.requires.map((req) => (
                      <li key={req} className={faction.techs.includes(req) ? 'is-done' : ''}>
                        <Icon name={faction.techs.includes(req) ? 'Check' : 'Lock'} size={13} />
                        {TECHS[req].name}
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted small">Nenhum. Basta ter recursos e uma vaga de projeto.</p>}
                {selectedTech.unlocks?.length ? (
                  <>
                    <h4>Desbloqueia</h4>
                    <ul className="benefit-list">
                      {selectedTech.unlocks.map((unlock) => <li key={`${unlock.building}-${unlock.level}`}><Icon name="Lock" size={13} />{BUILDINGS[unlock.building].short} nível {unlock.level}</li>)}
                    </ul>
                  </>
                ) : null}
              </div>
            </div>
            <div className="tech-detail__cost">
              <span>Custo com desconto atual ({Math.round(discount * 100)}%)</span>
              <Cost cost={{ creditos: cashCost(selectedTech.cost.conhecimento, selectedTech.cost.creditos, discount) }} stocks={faction.stocks} />
            </div>
            <p className="table-note">O custo é pago na abertura do projeto. A conclusão leva {selectedTech.tier >= 3 ? 3 : 2} ciclos e não pode ser acelerada por dinheiro.</p>
          </div>
        ) : null}
      </Modal>
    </ViewShell>
  );
}
