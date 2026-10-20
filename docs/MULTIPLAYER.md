# Arquitetura para partidas hospedadas

Esta nota descreve como o MVP local se estende para um servidor autoritativo sem reescrever as regras. **Nada aqui está exposto na interface atual** e nenhuma tela simula jogadores remotos.

## Princípio

O cliente é uma projeção do estado. A autoridade é um processo que aplica os mesmos comandos puros (`src/game/commands.ts`) e o mesmo avanço de ciclo (`src/game/cycle.ts`) sobre o mesmo `GameState` versionado.

```
cliente A ─┐
cliente B ─┼─ WebSocket ─→ Partida autoritativa ─→ commands.ts / cycle.ts ─→ log + estado
cliente C ─┘                       │
                                   └─ persistência (Postgres/SQLite) e snapshots
```

## Contratos já existentes

| Necessidade | Base no código |
| --- | --- |
| Identidade do mundo | `GameState.seed`, `rngState`, `version` |
| Ações válidas | `CommandResult { ok, state, message }` em `types.ts` |
| Validação de regra | `withState` em `commands.ts` revalida dono, custos, vagas, capacidade e pré-requisitos |
| Ordenação temporal | `state.cycle`, `projects[].startedCycle/completesCycle` |
| Auditoria | `state.log` com `id`, `cycle`, `kind`, `factionId` |
| Persistência | `saveState`/`loadState`/`exportSave`/`importSave` e `validateState` |
| Determinismo | `nextRandom(state)` e `Rng` semeado; sem `Math.random` no motor |
| Propriedade | `Tile.owner`, `Faction.id`, `GameState.playerFactionId` |

## Autoridade

1. **Criação de partida** — servidor gera a seed, chama `createInitialState(seed)` e grava o snapshot inicial. O criador informa a Casa; as demais são reservadas ou assumidas por IA.
2. **Assento e propriedade** — cada conexão recebe `(matchId, factionId, sessionToken)`. O servidor nunca aceita `factionId` do corpo do comando sem verificar o assento.
3. **Comandos** — o cliente envia `{ matchId, commandId, type, payload, expectedCycle }`. O servidor carrega o estado, verifica a fase, aplica o comando correspondente e responde com `{ ok, message, logEntries, stateHash, cycle }`.
4. **Ciclo** — apenas o servidor decide quando um ciclo fecha. Para partidas assíncronas, um job agenda o fechamento; para partidas em tempo real, o servidor mantém o relógio e emite `cycle.completed`.
5. **Sincronização** — difusão do log e de um patch de estado por ciclo. Clientes que reconectam recebem o snapshot mais recente + log desde o último ciclo confirmado; o `stateHash` detecta divergência.
6. **Persistência** — snapshot integral após cada ciclo (algumas centenas de territórios e poucas dezenas de projetos) e log append-only para auditoria. Um snapshot por ciclo também limita o custo de reconexão.

## Anti-abuso

- Revalidar **todo** comando no servidor: a UI pode esconder um botão, mas o comando ainda precisa passar por `withState`.
- Rejeitar comandos com `expectedCycle` diferente do ciclo atual (evita replay de ações antigas).
- Rate limit por assento e por tipo de comando; um comando de construção por ciclo já é limitado pelas vagas e recursos.
- IDs idempotentes (`commandId`) para evitar duplicação em reconexão.
- O cliente nunca envia produção, preços, relações ou resultado de batalha — apenas a intenção.
- Log imutável no servidor; o cliente não pode editar crônicas.
- Seed e RNG ficam no servidor; prever o próximo evento não concede vantagem se o estado e os custos são validados.
- Partidas podem ser privadas por token de convite; "públicas" exigem moderação de nomes e limites de criação.

## Reconexão e abandono

- Heartbeat de 15 s; após 60 s sem resposta o assento fica `disconnected`.
- Desconexão não encerra a partida: o relógio continua e o jogador mantém o assento por N ciclos.
- Se o jogador não retornar, a IA assume a Casa com a doutrina escolhida (a mesma `runAITurn`).
- Ao reconectar, o cliente baixa snapshot + eventos e retoma a interface no ciclo atual.
- Saída intencional pode marcar a Casa como "abandonada" e abrir assento para substituição.

## Autenticação mínima

- Conta por e-mail mágico/OAuth; sessão em cookie `HttpOnly` ou token curto.
- `playerId` persistente separado de `factionId` por partida.
- Convites assinados com `matchId`, validade e assento reservado.
- Nenhuma credencial é armazenada no cliente além do token de sessão.

## O que falta implementar para o modo online

- Serviço HTTP/WebSocket, banco de dados e autenticação.
- Contratos de rede (schemas de comando e de snapshot).
- Matchmaking, convites, espectadores e chat.
- Testes de integração de duas instâncias e de reconexão.
- Política de versão: partidas travam a versão de regras no início; migrações só em salas privadas.

O modo single-player atual é o mesmo motor, com o próprio navegador como autoridade — o que mantém a migração restrita à camada de transporte.
