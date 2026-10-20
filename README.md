# TESSERA — Crônicas da Partilha

Jogo de estratégia territorial e gestão econômica para navegador. Quatro Casas disputam **a Terra partilhada**; você governa **Concórdia** a partir de Lisboa e precisa transformar Portugal e Espanha em uma potência global — por economia, obras, ciência, diplomacia ou força.

O tabuleiro é o **mapa-múndi real em 3D**: cada país soberano é um território jogável, com províncias/estados e cidades navegáveis dentro dele. São 231 países, 4.502 províncias e 1.203 cidades a partir de dados geográficos do Natural Earth.

> MVP funcional e jogável. Todos os números da interface vêm do mesmo motor determinístico que move as Casas rivais. Não há telas simuladas nem jogadores fictícios.
>
> O globo exige WebGL. Sem ele — ou a pedido — o mesmo estado é exibido na **carta plana 2D**, com a mesma seleção de países, províncias e cidades.

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
4. Gire o globo até o país desejado e clique nele para abrir o painel do território. Aproxime para revelar **províncias/estados** e **cidades**; duplo clique foca o país e carrega a malha interna.
5. Vença alcançando **360 de hegemonia** antes de uma Casa rival. Hegemonia soma territórios, desenvolvimento, tecnologias, força militar, influência, acordos e uma fração limitada do tesouro.

### Controles

| Ação | Como |
| --- | --- |
| Girar o globo | Arrastar |
| Aproximar/afastar | Roda do mouse, pinça ou botões `+` / `−` |
| Selecionar país | Clique no país; duplo clique foca e carrega províncias |
| Selecionar província/estado | Clique na divisão interna do país focado |
| Selecionar cidade | Clique no marcador de cidade (camada “Mostrar cidades”) |
| Alternar globo 3D / carta plana | Botão de camada no canto superior direito |
| Localizar país, província ou cidade | Seletores no canto superior esquerdo (também acessíveis por teclado) |
| Painel da nação | Clique no fundo do mapa / botão “Painel da nação” |
| Trocar de tela | Barra lateral; teclas `1`–`8` |
| Encerrar ciclo | Botão “Avançar” ou `Espaço` |
| Voltar ao mapa | `Esc` |
| Manual | `H` ou botão “Ajuda” |

Telas: `1` Mapa · `2` Economia · `3` Obras · `4` Ciência · `5` Expansão · `6` Diplomacia · `7` Campanha · `8` Crônicas. Ajustes e saves ficam na engrenagem.

---

## O que está implementado

### Mapa-múndi em 3D
- Globo em WebGL (three.js) com países extrudados sobre a esfera, atmosfera, campo de estrelas e grade lat/lon.
- **231 países** como territórios; **4.502 províncias/estados** e **1.203 cidades** como camadas selecionáveis. A geometria do país é carregada sob demanda (`public/atlas/geo/{ISO}.json`), então a seleção nacional nunca depende de um único arquivo gigante.
- Clique no país, na província (com o país focado) ou na cidade. Duplo clique aproxima e troca o detalhe interno; o painel contextual mostra a ficha do território.
- Localizador com três seletores (país → província → cidade) resolve o problema de clicar em países minúsculos e serve de caminho acessível por teclado.
- Órbita com arrastar, zoom por roda/pinça (1,32×–4,2×), rótulos de cidades em HTML projetados, destaque de reivindicáveis e tooltip com dono, população, terreno e valor estratégico.
- **Carta plana 2D** (projeção equirretangular, SVG) como fallback automático sem WebGL e como alternativa acessível; usa o mesmo estado, as mesmas cores e a mesma seleção.
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
- Layout responsivo (desktop, tablet e celular), tipografia Inter + Spectral, globo WebGL + carta plana SVG.
- Nomes de capitais e grandes cidades em português (`names.ts`) sobre os nomes originais do Natural Earth.
- Save automático no `localStorage`, exportação/importação JSON versionada, retomada de campanha e reinício.

---

## Arquitetura

```
src/
  game/            motor puro, sem React
    constants.ts   dados de terreno, nós, edifícios, tecnologias, objetivos, mercado
    types.ts       contratos do estado, comandos, relatórios e log
    rng.ts         RNG determinístico (mulberry32 + fluxo LCG do mundo)
    atlas.ts       carregador do atlas (países, províncias, cidades, adjacência, detalhe lazy)
    atlas/         world.json (231 países), outline.json e geo/{ISO}.json gerados por scripts/build-atlas.py
    map.ts         tabuleiro-múndi: assentos iniciais, terreno, população de jogo, vizinhos e reivindicáveis
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
    globe/globe.ts globo three.js imperativo (geometria esférica, raycast, câmera, rótulos)
    FlatAtlas.tsx  carta plana 2D com a mesma seleção e dados
    MapView.tsx    orquestra globo/carta, detalhe por país, tooltip, controles e drill-down
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
- `src/ui/globe/globe.test.ts` — valida o atlas (referências de país/província/cidade e adjacência), o tabuleiro completo, a tesselação de todos os contornos em triângulos na esfera, o caso do antimeridiano (Fiji, Nova Zelândia, Rússia) e as cores de soberania.
- `src/ui/FlatAtlas.test.tsx` — desenha a carta plana com todos os países, divisões internas e cidades, encaminha cliques de país/província/cidade, duplo clique e os controles de zoom/recentragem.
- `src/ui/smoke.test.tsx` — renderiza o app em jsdom (sem WebGL, exercitando a carta plana), inicia campanha, percorre todas as telas, seleciona país/província/cidade, avança ciclos, executa obra, pesquisa, comércio, presente, expansão e resolve um evento pelo modal.

O typecheck é parte do build (`tsc -b`). O pacote do globo (three.js) é carregado sob demanda num chunk separado (~500 kB); o pacote inicial fica em ~948 kB (329 kB gzip), incluindo o atlas mundial embutido. Dados geográficos: Natural Earth (domínio público), simplificados por `scripts/build-atlas.py`.

---

## Limites conhecidos e próximos passos

- Uma única Casa jogável (Concórdia); a seleção de Casa e cenários alternativos são expansões naturais.
- Sem áudio, sem animações de batalha quadro a quadro e sem campanha narrativa roteirizada.
- Sem servidor, contas ou partidas assíncronas — apenas a arquitetura preparada descrita acima.
- Microestados e ilhas muito pequenas recebem um contorno mínimo gerado no build para continuarem visíveis e clicáveis; não há modelagem de relevo ou elevação real.
- A malha provincial é carregada por país sob demanda; em conexões lentas o primeiro foco pode exibir o aviso de carregamento.
- 13 das 4.502 províncias (ilhas e enclaves minúsculos na Espanha, Reino Unido e Irlanda) não têm polígono após a simplificação: continuam listadas no localizador e selecionáveis, mas não são desenhadas no globo.
- Balanceamento calibrado por simulação, não por playtest humano extenso. Ajustes ficam concentrados em `constants.ts`, `commands.ts` e `progress.ts`.
