import { useMemo, useState } from 'react';
import { FACTIONS } from '../game/constants';
import type { LogKind } from '../game/types';
import { useGameStore } from '../store/gameStore';
import { cycleLabel } from './format';
import { Icon } from './Icon';
import { Badge, EmptyState, cx } from './primitives';
import { ViewShell } from './ViewShell';

const KIND_META: Record<LogKind, { label: string; icon: string; tone: 'teal' | 'gold' | 'red' | 'blue' | 'purple' | 'neutral' }> = {
  economia: { label: 'Economia', icon: 'Coins', tone: 'gold' },
  construcao: { label: 'Construção', icon: 'Hammer', tone: 'teal' },
  expansao: { label: 'Expansão', icon: 'Map', tone: 'teal' },
  diplomacia: { label: 'Diplomacia', icon: 'Handshake', tone: 'blue' },
  operacoes: { label: 'Operações', icon: 'Store', tone: 'teal' },
  evento: { label: 'Evento', icon: 'Sparkles', tone: 'purple' },
  sistema: { label: 'Sistema', icon: 'Info', tone: 'neutral' },
  pesquisa: { label: 'Pesquisa', icon: 'FlaskConical', tone: 'purple' },
};

const FILTERS: Array<{ id: 'todos' | LogKind; label: string }> = [
  { id: 'todos', label: 'Tudo' },
  { id: 'economia', label: 'Economia' },
  { id: 'construcao', label: 'Obras' },
  { id: 'expansao', label: 'Expansão' },
  { id: 'diplomacia', label: 'Diplomacia' },
  { id: 'operacoes', label: 'Operações' },
  { id: 'pesquisa', label: 'Pesquisa' },
  { id: 'evento', label: 'Eventos' },
];

export function ChroniclePanel() {
  const game = useGameStore((state) => state.game);
  const toast = useGameStore((state) => state.toast);
  const [filter, setFilter] = useState<'todos' | LogKind>('todos');
  const [query, setQuery] = useState('');

  const entries = useMemo(() => {
    if (!game) return [];
    return game.log.filter((entry) => (filter === 'todos' || entry.kind === filter) && entry.text.toLowerCase().includes(query.toLowerCase()));
  }, [game, filter, query]);

  const groups = useMemo(() => {
    const map = new Map<number, typeof entries>();
    for (const entry of entries) {
      const list = map.get(entry.cycle) ?? [];
      list.push(entry);
      map.set(entry.cycle, list);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [entries]);

  const counts = useMemo(() => {
    const base: Record<string, number> = {};
    game?.log.forEach((entry) => { base[entry.kind] = (base[entry.kind] ?? 0) + 1; });
    return base;
  }, [game]);

  if (!game) return null;

  const download = () => {
    const lines = [
      'MANAGEMENT CENTURY — registro da campanha',
      `Seed ${game.seed} · ciclo atual ${game.cycle}`,
      '',
      ...[...game.log].reverse().map((entry) => `[c${String(entry.cycle).padStart(2, '0')}] ${KIND_META[entry.kind].label.toUpperCase()} — ${entry.factionId ? `${FACTIONS[entry.factionId].short}: ` : ''}${entry.text}`),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `management-century-registro-seed-${game.seed}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast('success', 'Registro exportado', 'O registro completo foi salvo como arquivo de texto.');
  };

  return (
    <ViewShell
      eyebrow="Arquivo da campanha"
      title="Registro da companhia"
      subtitle="Cada decisão relevante fica registrada aqui — o mesmo log que um servidor autoritativo usaria para auditar a partida."
      icon="ScrollText"
      actions={<button className="button button--ghost button--small" onClick={download} type="button"><Icon name="Download" size={14} /> Exportar .txt</button>}
    >
      <div className="chronicle-toolbar">
        <div className="chip-tabs" role="tablist" aria-label="Filtrar registros">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              className={cx('chip-tab', filter === item.id && 'is-active')}
              onClick={() => setFilter(item.id)}
              role="tab"
              aria-selected={filter === item.id}
              type="button"
            >
              {item.label}
              <span>{item.id === 'todos' ? game.log.length : counts[item.id] ?? 0}</span>
            </button>
          ))}
        </div>
        <label className="search-field">
          <Icon name="Search" size={14} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar no registro…" aria-label="Buscar no registro" />
          {query ? <button onClick={() => setQuery('')} type="button" aria-label="Limpar busca"><Icon name="X" size={12} /></button> : null}
        </label>
      </div>

      {groups.length ? (
        <div className="chronicle-list">
          {groups.map(([cycle, list]) => (
            <section className="chronicle-group" key={cycle}>
              <div className="chronicle-group__marker">
                <span>{cycleLabel(cycle)}</span>
                <i />
              </div>
              <div className="chronicle-entries">
                {list.map((entry) => {
                  const meta = KIND_META[entry.kind];
                  return (
                    <article className="chronicle-entry" key={entry.id}>
                      <span className={cx('chronicle-entry__icon', `chronicle-entry__icon--${meta.tone}`)}><Icon name={meta.icon} size={15} /></span>
                      <div className="chronicle-entry__body">
                        <div className="chronicle-entry__meta">
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                          {entry.factionId ? (
                            <span className="chronicle-entry__house" style={{ color: FACTIONS[entry.factionId].color }}>
                              <i style={{ background: FACTIONS[entry.factionId].color }} /> {FACTIONS[entry.factionId].name}
                            </span>
                          ) : <span className="chronicle-entry__house">Sistema</span>}
                        </div>
                        <p>{entry.text}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <EmptyState icon="ScrollText" title="Nada registrado com esse filtro">
          O registro cresce conforme a companhia opera. Avance ciclos, construa, negocie e abra unidades para gerar registros.
        </EmptyState>
      )}
    </ViewShell>
  );
}
