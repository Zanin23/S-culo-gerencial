import { useRef, useState } from 'react';
import { GAME } from '../game/constants';
import { useGameStore } from '../store/gameStore';
import { Icon } from './Icon';
import { Badge, cx, SectionHeader } from './primitives';
import { ViewShell } from './ViewShell';

export function SettingsPanel() {
  const game = useGameStore((state) => state.game);
  const savedAt = useGameStore((state) => state.savedAt);
  const saveError = useGameStore((state) => state.saveError);
  const saveNow = useGameStore((state) => state.saveNow);
  const exportGame = useGameStore((state) => state.exportGame);
  const importGame = useGameStore((state) => state.importGame);
  const toggleDigest = useGameStore((state) => state.toggleDigest);
  const startNewGame = useGameStore((state) => state.startNewGame);
  const requestConfirm = useGameStore((state) => state.requestConfirm);
  const openTutorial = useGameStore((state) => state.openTutorial);
  const toast = useGameStore((state) => state.toast);
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);

  if (!game) return null;

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const result = importGame(text);
      if (result.ok) toast('success', 'Partida importada', 'O estado carregado substituiu a campanha atual.');
      else toast('error', 'Arquivo recusado', result.error ?? 'O save não pôde ser lido.');
    } catch {
      toast('error', 'Falha ao ler o arquivo', 'O arquivo selecionado não pôde ser aberto.');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <ViewShell
      eyebrow="Preferências e dados"
      title="Ajustes da campanha"
      subtitle="Persistência local, exportação de saves e controles de interface. Nada aqui envia dados para fora do seu navegador."
      icon="Settings"
    >
      <div className="settings-layout">
        <section className="card">
          <SectionHeader eyebrow="Armazenamento" title="Save local" icon="Save" />
          <div className="settings-save">
            <span className="settings-save__seal"><Icon name={saveError ? 'AlertTriangle' : 'Database'} size={20} /></span>
            <div className="settings-save__body">
              <strong>{saveError ? 'O último salvamento falhou' : savedAt ? 'Campanha guardada neste navegador' : 'Salvamento automático ativo'}</strong>
              <span>
                {savedAt
                  ? `Último registro às ${new Date(savedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ciclo ${game.cycle}`
                  : 'Um snapshot é gravado ao final de cada ciclo e ao fechar a aba.'}
              </span>
            </div>
          </div>
          {saveError ? <p className="callout callout--danger"><Icon name="AlertTriangle" size={14} /> {saveError}</p> : null}
          <div className="settings-actions">
            <button className="button button--primary button--small" onClick={saveNow} type="button"><Icon name="Save" size={13} /> Salvar agora</button>
            <button className="button button--ghost button--small" onClick={exportGame} type="button"><Icon name="Download" size={13} /> Exportar JSON</button>
            <button className="button button--ghost button--small" onClick={() => fileRef.current?.click()} disabled={importing} type="button">
              <Icon name="Upload" size={13} /> {importing ? 'Lendo…' : 'Importar JSON'}
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => void onFile(event.target.files?.[0])} />
          </div>
        </section>

        <section className="card">
          <SectionHeader eyebrow="Interface" title="Leitura do jogo" icon="Eye" />
          <div className="settings-row">
            <div>
              <strong>Resumo de ciclo</strong>
              <span>Mostra o boletim com produção, saldo e alertas ao fechar cada ciclo.</span>
            </div>
            <button
              className={cx('switch', game.settings.showDigest && 'is-on')}
              onClick={toggleDigest}
              role="switch"
              aria-checked={game.settings.showDigest}
              aria-label="Resumo de ciclo"
              type="button"
            >
              <span />
            </button>
          </div>
          <div className="settings-row">
            <div>
              <strong>Atalhos</strong>
              <span>1–9 trocam de tela · espaço avança um ciclo · Esc fecha modais · ? abre o manual.</span>
            </div>
            <Badge tone="neutral">teclado</Badge>
          </div>
          <div className="settings-actions">
            <button className="button button--ghost button--small" onClick={() => openTutorial(0)} type="button"><Icon name="BookOpen" size={13} /> Rever tutorial</button>
          </div>
        </section>

        <section className="card">
          <SectionHeader eyebrow="Campanha" title="Nova partida" icon="RotateCcw" />
          <p className="muted small">
            Recomeçar gera um mundo novo a partir de outra seed. O save atual é substituído — exporte antes se quiser guardá-lo.
          </p>
          <div className="settings-row">
            <div><strong>Seed atual</strong><span className="mono">{game.seed}</span></div>
            <Badge tone="neutral">v{GAME.saveVersion}</Badge>
          </div>
          <div className="settings-danger">
            <div className="settings-danger__row">
              <div>
                <strong>Descartar campanha</strong>
                <span>O progresso salvo desta partida será perdido.</span>
              </div>
              <button
                className="button button--danger button--small"
                onClick={() => requestConfirm({
                  title: 'Iniciar uma nova campanha?',
                  body: 'O progresso salvo desta partida será substituído por um mundo novo. Essa ação não pode ser desfeita.',
                  confirmLabel: 'Gerar novo mundo',
                  onConfirm: () => startNewGame(),
                })}
                type="button"
              >
                <Icon name="Trash2" size={13} /> Recomeçar
              </button>
            </div>
          </div>
        </section>

        <section className="card">
          <SectionHeader eyebrow="Arquitetura" title="Pronto para um servidor" icon="Network" />
          <p className="muted small">
            O motor é determinístico e separado da interface: cada ação passa por comandos validados e o ciclo é uma função sobre o estado.
          </p>
          <div className="about-grid">
            <div><span>Estado</span><strong>Seed + RNG próprios</strong><p>Snapshots versionados e serializáveis em JSON.</p></div>
            <div><span>Comandos</span><strong>Revalidação total</strong><p>Dono, custo, vagas e pré-requisitos checados no motor.</p></div>
            <div><span>Auditoria</span><strong>Log append-only</strong><p>Registro por ciclo, com facção e tipo.</p></div>
            <div><span>Online</span><strong>Fora do MVP</strong><p>Sem transporte, contas ou matchmaking nesta versão.</p></div>
          </div>
          <p className="muted small" style={{ marginTop: 10 }}>
            As quatro Casas adversárias são IA declaradas com doutrinas visíveis — não há jogadores fictícios se passando por humanos.
          </p>
        </section>
      </div>
    </ViewShell>
  );
}
