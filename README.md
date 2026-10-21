# MANAGEMENT CENTURY — Estratégia empresarial

Jogo de **gestão de companhias e economia** para navegador. Quatro companhias disputam mercados no **mundo todo**; você dirige o **Grupo Concórdia** a partir de Lisboa e precisa transformar a operação ibérica em um grupo global — abrindo unidades, obras, P&D e acordos.

O tabuleiro é o **mapa-múndi real em 3D**: cada país é uma praça licenciável, com províncias/estados e cidades navegáveis dentro dele. São 231 países, 4.502 províncias e **5.759 cidades** a partir de dados geográficos do Natural Earth. As 1.203 principais viajam no pacote; as outras 4.556 chegam sob demanda quando você aproxima o mapa, sem pesar no carregamento.

Antes de começar, você **funda a sede**: escolhe uma cidade real, vê a maquete 3D do terreno e das ruas e marca o lote onde a primeira construção será erguida. O distrito do lote altera permanentemente comércio, indústria ou defesa da capital — e dá para orbitar a cidade, abrir o **corte da sede** como uma casa de bonecas e entrar nela.

> MVP funcional e jogável. Todos os números da interface vêm do mesmo motor determinístico que move as companhias rivais. Não há telas simuladas nem jogadores fictícios.
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

1. **Fundar o grupo** no menu (ou retomar uma campanha salva no navegador).
   - Escolha a **cidade-sede** entre as cidades de Portugal e Espanha (Lisboa, Madrid, Barcelona, Sevilha, Valência, Bilbao, Vigo, Córdoba, Funchal, Ponta Delgada, Las Palmas).
   - A maquete mostra o terreno real (costa, rios, lagoas) e a malha de ruas gerada. Clique num dos lotes dourados.
   - Confirme em **Fundar a sede**. A sede instala a matriz no país escolhido, que passa a ser a base da companhia.
2. Leia o tutorial de sete passos. Ele explica o ciclo, a economia, obras, P&D, filiais, acordos e a condição de vitória.
3. O relógio do ciclo roda a cada 14 segundos quando você está no mapa. Você pode pausar, avançar manualmente ou simplesmente tomar decisões.
4. No **atlas de papel** (leitura padrão do mapa), arraste para percorrer o mundo, use a roda para aproximar e clique num país para abrir a ficha do território. Aproxime para revelar **províncias/estados** e **cidades**; duplo clique foca o país e carrega a malha interna. Os botões **Atlas / Globo / Carta** trocam a leitura sem perder seleção.
5. Vença alcançando **360 pontos de relevância** antes de uma companhia rival. A relevância soma praças, unidades de negócio, receita operacional, estrutura construída, tecnologia, caixa e acordos. Seis ciclos seguidos com caixa zerado e resultado negativo levam à **insolvência**: as unidades fecham, as praças ficam livres e a companhia sai do jogo.

### Controles

| Ação | Como |
| --- | --- |
| Escolher cidade-sede | Menu → Fundar Concórdia → lista de cidades |
| Escolher lote | Clique num lote dourado na maquete |
| Orbitar/zoom da cidade | Arrastar / roda do mouse; botão direito ou Shift para panorâmica |
| Pisos do corte da sede | Botões **1–4** no canto superior esquerdo da maquete |
| Câmera da cidade | Arrastar para orbitar, roda para zoom, **+ / − / recentrar** à direita da maquete |
| Entrar no prédio | Aba Cidade → Interior (ou duplo clique na fachada) |
| Percorrer o atlas | Arrastar |
| Girar o globo | Arrastar (modo Globo) |
| Aproximar/afastar | Roda do mouse, pinça ou botões `+` / `−` |
| Selecionar país | Clique no país; duplo clique foca e carrega províncias |
| Selecionar província/estado | Clique na divisão interna do país focado |
| Selecionar cidade | Clique no marcador de cidade (camada “Mostrar cidades”) |
| Trocar atlas / globo / carta | Botões **Atlas · Globo · Carta** no canto superior direito |
| Localizar país, província ou cidade | Seletores no canto superior esquerdo (também acessíveis por teclado) |
| Painel da companhia | Clique no fundo do mapa / botão “Painel da companhia” |
| Trocar de tela | Barra lateral; teclas `1`–`9` (telas principais), `U` (construção) e `0` (relatório) |
| Encerrar ciclo | Botão “Avançar” ou `Espaço` |
| Voltar ao mapa | `Esc` |
| Manual | `H` ou botão “Ajuda” |

Telas: `1` Mapa · `2` Cidade · `3` Empresas · `4` Economia · `5` Estruturas · `6` P&D · `7` Expansão · `8` Acordos · `9` Metas · `0` Relatório · `U` Construção. Ajustes e saves ficam na engrenagem.

---

## O que está implementado

### Cidade 3D e fundação da sede
- **Maquete tridimensional** de 6,8 × 6,8 km em torno do centro real da cidade: relevo, água, quadras, ruas, parques, **20 a 30 mil edificações**, árvores, sombra e atmosfera. A câmera abre com **58° de campo de visão**, enquadrando a mancha urbana inteira de uma vez.
- **Variedade urbana de verdade**: oito tipologias (torre, comercial, prédio, solar, casa, quinta, galpão e marco) sorteadas por zona — centro denso em torres, periferia em casas e galpões. Cada edifício recebe cobertura (duas águas, quatro águas, laje, shed ou coroa), paleta de fachada, toldo, vitrine, casa de máquinas e antena; as janelas mudam de escala conforme o número de andares.
- **Terreno real**: a linha de costa, os rios e os lagos vêm do recorte do Natural Earth 10m (Lisboa mostra o Tejo; Sevilha e Córdoba, o Guadalquivir; Funchal e Las Palmas, a orla).
- **Ruas e quarteirões gerados** a partir dessa base: avenidas radiais a partir do centro, anéis viários, malha ortogonal por distrito e centros de bairro — sempre recortados pela água.
- **Escolha do lote**: 28 lotes livres por cidade; o distrito (Centro / Expansão / Periferia) define o bônus permanente da capital (+10% comércio, +8% indústria/extração ou +14% defesa).
- **Corte da sede no estilo casa de bonecas**: a torre da sede vira uma maquete de quatro pisos empilhados, com planta mobiliada (átrio, escritório aberto, salas de reunião, direção), paredes envidraçadas e **paredes que somem quando ficam entre a câmera e o interior** — só o rodapé de corte continua, como em The Sims. Os botões de piso mostram do térreo até a direção, com a câmera reenquadrando o piso em foco; a luz e o mapa de sombras se aproximam junto.
- **Câmera**: órbita, zoom, panorâmica com botão direito/Shift e controles `+` / `−` / recentrar; modos **Cidade**, **Sede** (corte) e **Interior** (sala de comando com vista real para os prédios vizinhos pelas janelas).
- **Sede que cresce na maquete**: o prédio nasce como escritório compacto de três pisos e ganha embasamento, torres escalonadas, anel dourado, heliponto, jardins, postes e bandeiras conforme as expansões compradas. A altura, o volume e os detalhes vêm do estágio salvo na campanha.
- **Cidade mais viva**: céu em gradiente, sol quente com recheio frio, postes de luz ao longo das avenidas, copas em cinco tons de verde e praças com mais canteiros. Nada disso custa um quadro por edificação — postes e árvores continuam instanciados.
- **Minimapa** e planta 2D determinística como fallback sem WebGL — com parques, copas de árvore, orla e o mesmo traçado da maquete; o jogo continua jogável.

### Direção de arte — atlas de atelier
- **Identidade**: MANAGEMENT CENTURY é jogado sobre uma **carta ilustrada de papel** pousada numa mesa de couro. Nada de painéis translúcidos, brilhos ou gradientes futuristas — a interface imita **gravura, nanquim e latão**.
- **Tipografia**: títulos em **Fraunces Variable** (serifa editorial, eixos SOFT/WONK), dados e rótulos em **Inter Variable** com algarismos tabulares. Toda a hierarquia vem dos tokens `--display`, `--serif`, `--sans`.
- **Paleta**: papel `#efe2c4` / `#f6ecd4`, tinta `#3b3226`, mar `#9dbfb4`, terra em cinco lavagens naturais (planície, floresta, colina, montanha, deserto), latão `#a97b3f`, verdete `#4c7f6f` e selo `#b4553c`. Fundos neutros escuros (couro) para o papel respirar.
- **Glifos desenhados no projeto** (`src/ui/art/Glyph.tsx`): um conjunto único de 32×32 para terrenos, estruturas e linhas de negócio, além do selo de cera da companhia — sem emojis nem bibliotecas misturadas.
- **Presença legível sem cor**: cada companhia tem **inclinação de hachura própria** (24°, 68°, 112°, 156°) sobre a tinta de facção, então praças continuam distinguíveis por padrão em daltonismo; a legenda repete o mesmo ângulo.
- **Superfícies**: `.paper-card`, fichas de indicador com canto cortado, janelas com moldura dupla, plaquetas de latão para botões e estados explícitos (`state-tag--ready/locked/busy/done/event`).
- **Movimento discreto**: fumaça nas capitais, bandeiras, navios em rotas marítimas, anel de seleção e transições de 180 ms — tudo respeitando `prefers-reduced-motion`.

### Atlas-múndi, globo e carta
- **Leitura principal**: atlas ilustrado em SVG (equirretangular, 360×180 unidades) com lavagem de terreno hachurada, orla de areia, sombra de papel recortado, graticula, rosácea dos ventos e escala. Pan por arrasto, zoom por roda (1×–11×), foco automático no país e seleção de país, província e cidade.
- **Detalhe sob demanda**: com um país em foco, as províncias reais são desenhadas e clicáveis; as cidades viram conjuntos urbanos ilustrados a partir de 1,35× e viram pinos discretos no mundo inteiro.
- **Globo WebGL** (three.js) com países extrudados, atmosfera e estrelas, e **carta plana 2D** como alternativa acessível — os três modos compartilham o mesmo estado, a mesma seleção e o mesmo painel contextual.
- **Arrasto e zoom sem re-render**: a câmera é escrita direto no `viewBox` (um write por quadro) e a terra é "assada" em ~20 caminhos (um por terreno, um por companhia) em vez de ~1.200. Durante o gesto o CSS troca os padrões de terreno por lavagem lisa e esconde hachuras e rótulos; o React só re-renderiza 240 ms depois que o gesto assenta.
- **Tela limpa**: no mundo inteiro só aparecem as maiores capitais nomeadas, sem rótulos de cidade, sem linhas de rumo e com graduação de 30° em 30°. Aproximando, os detalhes entram em camadas.
- **231 países** como praças; **4.502 províncias/estados** e **5.759 cidades** como camadas selecionáveis. As 1.203 principais viajam no pacote; as demais chegam em `public/atlas/cities-detail.json` quando o mapa aproxima ou a lista de cidades é aberta. A geometria do país é carregada sob demanda (`public/atlas/geo/{ISO}.json`).
- Localizador com três seletores (país → província → cidade) resolve o problema de clicar em países minúsculos e serve de caminho acessível por teclado.
- Tooltip com terreno ilustrado, dono, população, terreno e valor estratégico.
- Cada praça possui terreno, vocação natural, população, desordem, valor estratégico, espaços construíveis e estruturas (níveis 0–3).
- Painel da praça com abas **Resumo / Estruturas / Ações**: resultado local, obras, licença de operação, unidades do país e acordos.

### Economia
- **Escala em reais de mercado** (`src/game/money.ts`): o ciclo é um mês de operação e a companhia começa com R$ 12 milhões de caixa. Um ponto de varejo custa R$ 3,4 mi de implantação, um terminal portuário R$ 12 mi, uma planta industrial R$ 10 mi, uma linha de montagem de veículos R$ 30 mi e a matriz R$ 68 mi. Folha, mercadorias e aluguel entram no resultado de cada unidade e passam a pesar mais que a manutenção assim que a rede cresce.
- **Renda de ativo com payback medido**: unidades devolvem o capital em ~15–30 ciclos, com margem setorial entre 22% e 40% já líquida de folha, mercadorias e aluguel. A manutenção de imóvel fica em ~2% do valor do ponto por ciclo; a folha e as vendas urbanas são cobradas por ponto de população.
- A companhia opera em **caixa**: receita, despesas, resultado e caixa final por ciclo. Insumos, pessoal e manutenção entram convertidos em dinheiro — não há estoques de Estado.
- Receitas: unidades de negócio, edifícios comerciais, acordos e portos. Despesas: pessoal, manutenção, insumos industriais e serviço da dívida.
- Preços de insumos reagem ao volume negociado e afetam a margem industrial; eventos e modificadores alteram custos por alguns ciclos.
- Painel de economia com receitas/despesas detalhadas, tendência, projeção do próximo ciclo e custo das unidades.
- Capacidade administrativa limita praças e operações; desordem alta derruba a receita local.

### Obras e tecnologia
- Nove tipos de estrutura: fazenda, extração, usina, indústria, centro de pesquisa, entreposto, administração, logística e defesa.
- Cada nível tem custo, tempo de obra, produção, consumo, manutenção, empregos e pré-requisitos tecnológicos.
- Bônus de terreno/nó de recurso; vagas de estrutura limitadas por território (logística amplia).
- Quatro ramos tecnológicos com 16 tecnologias, pré-requisitos, custos crescentes, descontos por modificadores e benefícios visíveis. Não há caminho obrigatório.

### Filiais, expansão e acordos
- **Insolvência** substitui a eliminação militar: caixa zerado com resultado negativo por seis ciclos encerra a companhia, fecha as filiais e devolve os territórios ao mapa. O painel de Economia avisa a partir do primeiro ciclo no vermelho.
- **Empresas e operações**: cada unidade ocupa uma cidade real de um país licenciado, em uma de seis linhas — fazenda, varejo, porto, indústria, fábrica de automóveis e finanças. Receita cresce com a população da cidade, o número de unidades e a participação de mercado; rivais na mesma cidade diluem a participação de todos.
- Custos de abertura e de compra de novas unidades pagos em caixa; manutenção e insumos cobrados por ciclo; portos aumentam o escoamento das demais unidades no país.
- **Construção de sede e filiais** (tela Construção): a sede sobe por quatro estágios — escritório compacto, sede corporativa, torre administrativa e complexo matriz — e cada estágio rende bônus de comércio na cidade-sede e vagas administrativas. Cada filial tem duas trilhas independentes de três compras: **construção** (receita, presença de mercado e manutenção) e **ramo de negócio** (receita nova e, em indústria e fábrica, menos insumos). Tudo é pago em caixa, aparece na maquete e muda o cálculo do ciclo.
- Licença para praças neutras adjacentes: custo em caixa, desenvolvimento mínimo na base, vaga de projeto e capacidade administrativa. A licença chega em 2 ciclos.
- Três companhias rivais com doutrinas próprias (varejo, indústria, logística, finanças) abrem e ampliam filiais dentro do próprio caixa.
- Relações de −100 a +100, presentes, acordo comercial, não concorrência e parceria estratégica. Propostas das rivais chegam ao longo dos ciclos.
- Eventos dinâmicos com escolhas e efeitos consistentes (colheita, seca, greve, leilão de concessões, cargas desviadas, inovação, dívida, entre outros).

### Interface e persistência
- **Começo pequeno**: a campanha abre no mapa com três números (caixa, unidades, relevância), um próximo passo contextual e quatro marcos de carreira — abrir a primeira unidade, avançar um ciclo, ampliar e licenciar uma praça. As telas de estruturas, P&D, expansão, acordos, relatório e ajustes ficam no menu **Mais**, fora do caminho até a primeira operação.
- Barra superior enxuta com caixa (e resultado por ciclo), unidades e relevância; navegação lateral em seis destinos e menu **Mais**; painel contextual; notificações; relatório completo.
- Tutorial de onboarding, manual, confirmações para ações destrutivas, estados vazios, erros de validação e feedback por toast.
- Layout responsivo (desktop, tablet e celular); atlas ilustrado, globo WebGL e carta plana SVG sob o mesmo tema de atelier (Fraunces + Inter).
- Nomes de capitais e grandes cidades em português (`names.ts`) sobre os nomes originais do Natural Earth.
- Save automático no `localStorage`, exportação/importação JSON versionada, retomada de campanha e reinício. A chave é `management-century.save.v6`; campanhas v2–v5 e as gravadas antes da troca de nome (`tessera.save.v2`) são migradas na primeira abertura, completando as expansões com o estágio inicial e convertendo caixa, custos contratados, preços de mercado e histórico para a escala em reais (fator 20 000), sem perder o mundo.

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
    city/geo.json  recorte geográfico real de cada cidade-sede (costa, rios, lagos) — build-city-geo.py
    cityPlan.ts    gerador urbano determinístico: relevo, ruas, quadras, parques, lotes e prédios
    hq.ts          efeito do distrito da sede sobre comércio, produção e defesa
    map.ts         tabuleiro-múndi: assentos iniciais, terreno, população de jogo, vizinhos e reivindicáveis
    state.ts       criação do mundo, save/load versionado, validação, log
    economy.ts     produção, consumo, manutenção, capacidade, população e desordem
    market.ts      preços, tendências, impacto de volume e atualização
    diplomacy.ts   relações, acordos e exigências
    commands.ts    comandos validados (construir, pesquisar, expandir, recrutar, guerrear, negociar)
    cycle.ts       avanço de ciclo, conclusão de projetos, vitória/derrota
    operations.ts  mercado das cidades, participação, receita e custo das filiais
    ai.ts          turnos das companhias rivais, ofertas e doutrinas
    events.ts      catálogo de eventos, escolhas e efeitos
    progress.ts    relevância, objetivos, ranking e condições de fim
  store/
    gameStore.ts   Zustand: estado da sessão, comandos, toasts, saves, tutorial
  ui/              componentes React de apresentação
    globe/globe.ts globo three.js imperativo (geometria esférica, raycast, câmera, rótulos)
    FlatAtlas.tsx  carta plana 2D com a mesma seleção e dados
    MapView.tsx    orquestra globo/carta, detalhe por país, tooltip, controles e drill-down
    SeatScreen.tsx escolha da cidade-sede, do lote e fundação
    CityView.tsx   gestão da cidade + modos de câmera
    city3d/        CityScene.ts (three.js: maquete e interior) e CityStage.tsx (palco + 2D)
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
- `src/game/expansions.test.ts` — trilhas de construção e de ramo (receita, manutenção, presença e teto), custo crescente por nível e população, bônus da sede restrito à própria cidade e vagas administrativas.
- `src/game/save.test.ts` — migração de campanhas v2–v5 para v6, incluindo o estágio inicial das expansões, a conversão monetária para reais e o limite de valores corrompidos.
- `src/game/cityPlan.test.ts` — determinismo do gerador urbano, aderência à geografia real (água/orla/terra), ruas fora da água, lotes livres e relevo coerente em todas as cidades-sede.
- `src/ui/FlatAtlas.test.tsx` — desenha a carta plana com todos os países, divisões internas e cidades, encaminha cliques de país/província/cidade, duplo clique e os controles de zoom/recentragem.
- `src/ui/city3d/dollhouse.test.ts` — monta o corte da sede: quatro pisos mobiliados, piso em foco e paredes voltadas para a câmera reduzidas ao rodapé.
- `src/ui/smoke.test.tsx` — renderiza o app em jsdom (sem WebGL, exercitando a carta plana), inicia campanha, percorre todas as telas, seleciona país/província/cidade, avança ciclos, executa obra, pesquisa, comércio, presente, expansão e resolve um evento pelo modal.

O typecheck é parte do build (`tsc -b`). O pacote do globo (three.js) é carregado sob demanda num chunk separado (~500 kB); o pacote inicial fica em ~1,0 MB (358 kB gzip), incluindo o atlas mundial embutido. Dados geográficos: Natural Earth (domínio público), simplificados por `scripts/build-atlas.py`.

---

## Limites conhecidos e próximos passos

- Uma única companhia jogável (Concórdia); a seleção de companhia e cenários alternativos são expansões naturais.
- Sem áudio, sem animações de combate e sem campanha narrativa roteirizada.
- Sem servidor, contas ou partidas assíncronas — apenas a arquitetura preparada descrita acima.
- **Ruas e edifícios são sintetizados**, não copiados do OpenStreetMap: o ambiente de build não tem acesso à API do Overpass. A costa, os rios e o centro de cada cidade são reais; o tecido urbano é gerado de forma determinística a partir deles (padrão radial/ortogonal, densidade e gabarito). A **variedade de prédios** segue um catálogo de tipologias com pesos por zona, não dados reais de lote.
- Microestados e ilhas muito pequenas recebem um contorno mínimo gerado no build para continuarem visíveis e clicáveis; não há modelagem de relevo ou elevação real.
- A malha provincial é carregada por país sob demanda; em conexões lentas o primeiro foco pode exibir o aviso de carregamento.
- As 4.556 cidades de detalhe ficam em `/atlas/cities-detail.json` (229 kB) e só são baixadas ao aproximar ou focar um país. O arquivo é indexado uma vez (~16 ms) numa grade de 6°; cada consulta de viewport leva ~1,5 µs. Nenhum byte desse lote entra no pacote JS inicial.
- 13 das 4.502 províncias (ilhas e enclaves minúsculos na Espanha, Reino Unido e Irlanda) não têm polígono após a simplificação: continuam listadas no localizador e selecionáveis, mas não são desenhadas no globo.
- Balanceamento calibrado por simulação, não por playtest humano extenso. Ajustes ficam concentrados em `constants.ts`, `commands.ts` e `progress.ts`.
