# TESSERA — Crônicas do Cinturão

Jogo de estratégia territorial e gestão econômica para navegador. Quatro Casas disputam o Cinturão de Vesper; você governa **Concórdia** a partir de Porto Lúmen e precisa transformar dois territórios em uma hegemonia continental — por economia, obras, ciência, diplomacia ou força.

> MVP funcional e jogável. Todos os números da interface vêm do mesmo motor determinístico que move as Casas rivais. Não há telas simuladas nem jogadores fictícios.

---

## Como executar

```bash
npm install
npm run dev          # http://localhost:5173
```

Build de produção e testes:

```bash
npm run build        # typecheck (tsc -b) + Vite
npm test             # motor + smoke tests de interface (jsdom)
npm run preview      # serve o build em http://localhost:4173
```

Requisitos: Node 20+ e um navegador moderno (Chromium, Firefox ou Safari atuais). Não é necessário backend, conta ou chave de API.

---

## Como jogar

1. **Fundar Concórdia** no menu (ou retomar uma campanha salva no navegador).
2. Leia o tutorial de seis passos. Ele explica o ciclo, a economia, obras, expansão, diplomacia e a condição de vitória.
3. O relógio do ciclo roda a cada 14 segundos quando você está no mapa. Você pode pausar, avançar manualmente ou simplesmente tomar decisões.
4. Clique em um território para ver população, desenvolvimento, produção local, desordem, estruturas e ações.
5. Vença alcançando **360 de hegemonia** antes de uma Casa rival. Hegemonia soma territórios, desenvolvimento, tecnologias, força militar, influência, acordos e uma fração limitada do tesouro.

### Controles

| Ação | Como |
| --- | --- |
| Mover o mapa | Arrastar |
| Aproximar/afastar | Roda do mouse ou botões `+` / `−` |
| Selecionar território | Clique (ou `Enter` com foco no hexágono) |
| Painel da nação | Clique no fundo do mapa / botão “Painel da nação” |
| Trocar de tela | Barra lateral; teclas `1`–`8` |
| Encerrar ciclo | Botão “Avançar” ou `Espaço` |
| Voltar ao mapa | `Esc` |
| Manual | `H` ou botão “Ajuda” |

Telas: `1` Mapa · `2` Economia · `3` Obras · `4` Ciência · `5` Expansão · `6` Diplomacia · `7` Campanha · `8` Crônicas. Ajustes e saves ficam na engrenagem.

---

## O que está implementado

### Mapa e território
- Mapa hexagonal de 63 territórios com fronteiras por soberania, capitais, depósitos naturais, desordem e projetos em andamento.
- Pan, zoom (0,82×–2,5×), tooltip contextual, legenda, bússola, escala, rótulos e destaque de fronteiras reivindicáveis.
- Cada território possui terreno, nó de recurso, população, desordem, valor estratégico, espaços construíveis, estruturas (níveis 0–3), defesa, produção e consumo locais.
- Painel de território com abas **Resumo / Estruturas / Ações**, recrutamento, expansão, guerra e negociação.

### Economia
- Sete recursos com estoque, produção, demanda, saldo e histórico: créditos, alimentos, energia, matérias-primas, bens, influência e conhecimento.
- Cadeias reais: energia e matérias-primas limitam indústria e pesquisa; alimentos sustentam população; bens valorizam comércio; influência financia expansão e tratados.
- Mercado volátil com preços que reagem ao volume negociado, corretagem de 6% na compra, tendências e bônus tecnológico de venda.
- Gráfico de evolução por recurso, detalhamento de fontes e destinos, projeção de 1/3/5 ciclos, receitas/despesas e manutenção militar.
- Capacidade administrativa limita territórios; excedente reduz produção e aumenta desordem.

### Obras e tecnologia
- Nove tipos de estrutura: fazenda, extração, usina, indústria, centro de pesquisa, entreposto, administração, logística e defesa.
- Cada nível tem custo, tempo de obra, produção, consumo, manutenção, empregos e pré-requisitos tecnológicos.
- Bônus de terreno/nó de recurso; vagas de estrutura limitadas por território (logística amplia).
- Quatro ramos tecnológicos com 16 tecnologias, pré-requisitos, custos crescentes, descontos por modificadores e benefícios visíveis. Não há caminho obrigatório.

### Expansão, diplomacia e guerra
- Expansão de territórios neutros adjacentes: custo em créditos, matérias e influência; exige desenvolvimento mínimo na base, vaga de projeto e capacidade administrativa. A soberania chega em 2 ciclos.
- Três Casas rivais com doutrinas distintas (comércio, indústria, expansão, militarismo), avaliando custos, riscos e relações.
- Relações de −100 a +100, presentes, acordo comercial, não-agressão, aliança, guerra e paz. Propostas das Casas chegam ao longo dos ciclos.
- Operações militares com custo, preparação de 2 ciclos, estimativa de força/defesa, resolução com terreno, desordem e consequências territoriais. Guerra custa influência e rompe acordos.
- Eventos dinâmicos com escolhas e efeitos consistentes (colheita, seca, greve, refugiados, corsários, inovação, dívida, entre outros).

### Interface e persistência
- Barra superior com recursos, saldo, ciclo, hegemonia e alertas; navegação lateral; painel contextual; notificações; crônicas completas.
- Tutorial de onboarding, manual, confirmações para ações destrutivas, estados vazios, erros de validação e feedback por toast.
- Layout responsivo (desktop, tablet e celular), tipografia Inter + Spectral, mapa SVG vetorial.
- Save automático no `localStorage`, exportação/importação JSON versionada, retomada de campanha e reinício.

---

## Arquitetura

```
src/
  game/            motor puro, sem React
    constants.ts   dados de terreno, nós, edifícios, tecnologias, objetivos, mercado
    types.ts       contratos do estado, comandos, relatórios e log
    rng.ts         RNG determinístico (mulberry32 + fluxo LCG do mundo)
    map.ts         geração e utilidades do mapa hexagonal
    state.ts       criação do mundo, save/load versionado, validação, log
    economy.ts     produção, consumo, manutenção, capacidade, população e desordem
    market.ts      preços, tendências, impacto de volume e atualização
    diplomacy.ts   relações, acordos e exigências
    commands.ts    comandos validados (construir, pesquisar, expandir, recrutar, guerrear, negociar)
    cycle.ts       avanço de ciclo, conclusão de projetos, resolução de batalhas, vitória/derrota
    ai.ts          turnos das Casas, ofertas diplomáticas e doutrinas
    events.ts      catálogo de eventos, escolhas e efeitos
    progress.ts    hegemonia, objetivos, ranking e condições de fim
  store/
    gameStore.ts   Zustand: estado da sessão, comandos, toasts, saves, tutorial
  ui/              componentes React de apresentação
  App.tsx          shell, roteamento de telas, modais, toasts e atalhos
```

### Princípios

- **Uma fonte de verdade.** Toda mutação passa por `commands.ts` ou `cycle.ts`; a interface apenas lê o estado e despacha comandos.
- **Validação no ponto de mutação.** `withState` clona o estado, revalida propriedade, recursos, vagas, capacidade e pré-requisitos, e só então aplica. Um botão habilitado nunca é a única barreira.
- **Determinismo.** Toda aleatoriedade usa a semente do mundo. O mesmo estado + mesmos comandos produzem o mesmo resultado — base para testes e para replicação em servidor.
- **Log auditável.** Cada ação relevante gera uma entrada de crônica com ciclo, tipo e facção. O log é a base do que um servidor transmitiria aos clientes.
- **Sem números decorativos.** Preços, custos de obra, manutenção, produção e pontuação são calculados pelo mesmo motor usado pela IA.

### Pronto para multijogador (arquitetura, não interface)

O modo online **não** está exposto nesta versão e nenhuma tela simula jogadores fictícios. A base já separa o que um servidor autoritativo precisaria:

- comandos puros e serializáveis, aplicáveis fora do React;
- save JSON versionado com validação de schema;
- RNG determinístico por partida;
- log de eventos ordenado por ciclo;
- estado completo do mundo independente da UI.

O próximo passo natural é mover `commands.ts`/`cycle.ts` para uma API autoritativa, persistir o estado no servidor e transmitir o log/estado aos clientes. Autenticação, criação de partida e reconexão não são implementadas neste MVP.

---

## Testes

```bash
npm test
```

- `src/game/engine.test.ts` — criação coerente do mundo, economia inicial sã, simulação de 60 ciclos com jogador conduzido pela IA, validação de comandos inválidos, eventos e integridade de estoques/população.
- `src/ui/smoke.test.tsx` — renderiza o app em jsdom, inicia campanha, percorre todas as telas, avança ciclos, executa obra, pesquisa, comércio, presente, expansão e resolve um evento pelo modal.

O typecheck é parte do build (`tsc -b`). Build atual: ~423 kB de JS (124 kB gzip) e ~101 kB de CSS (18 kB gzip), fontes locais.

---

## Limites conhecidos e próximos passos

- Uma única Casa jogável (Concórdia); a seleção de Casa e cenários alternativos são expansões naturais.
- Sem áudio, sem animações de batalha quadro a quadro e sem campanha narrativa roteirizada.
- Sem servidor, contas ou partidas assíncronas — apenas a arquitetura preparada descrita acima.
- Balanceamento calibrado por simulação, não por playtest humano extenso. Ajustes ficam concentrados em `constants.ts`, `commands.ts` e `progress.ts`.
