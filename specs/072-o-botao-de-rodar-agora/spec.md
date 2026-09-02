# Feature 072 — O botão de rodar agora

## Problema e resultado

O catálogo de rotinas declara `JOB_EXECUTION_ORIGINS = ['schedule', 'manual']`, e o comentário diz
por extenso: _"a origem da execução: o ciclo que venceu, ou **o operador que apertou o botão antes da
hora**"_. O schema foi além e **projetou o botão inteiro**:

- `job_executions.requested_by` + `company_id`, com FK para a membership;
- o CHECK `job_executions_requester_check`, que exige os dois **exatamente quando** `origin = 'manual'`;
- o índice `job_executions_open_unique`, cujo comentário diz "é este índice que **sustenta o `409` do
  botão**".

**O botão nunca foi construído.** `/operations/jobs` é `GET` e só lista; nenhuma rota publica em
`job-run.v1` — quem publica é só a batida do cron; e os três usos de `origin: 'manual'` no código são
de outros contextos. É promessa de vocabulário sem implementação, da mesma família do `trip.read` que
está no catálogo e nenhuma rota pede.

O custo apareceu na spec 069: com a população de coordenadas correndo de hora em hora, conferir uma
mudança exige esperar a janela ou mexer no relógio pelo banco — as duas coisas que um botão evita.

O resultado desta feature: quem administra a instalação dispara uma rotina agendada e vê o resultado
na tela, com a trilha registrando **quem** pediu.

## Fora do escopo

- **Cancelar execução em andamento.** O lease e a varredura de abandono já fecham linha vencida; um
  botão de parar é decisão própria, com pergunta própria sobre o que fazer com trabalho pela metade.
- **Editar intervalo ou desligar rotina pela tela.** Desligar tem controle próprio no schema
  (`job_schedules.enabled`) e merece a sua feature.
- **Rotina que não está no catálogo.** O botão dispara o que o relógio já conhece, nada mais.

## Histórias priorizadas

### P1 — O administrador roda a rotina antes da hora

**Given** uma rotina agendada com a próxima janela distante
**When** quem tem `operations.run` aperta o botão
**Then** uma execução nasce com `origin: 'manual'` e o `requested_by` de quem apertou, o trilho
publica, e a tela passa a mostrar a execução em andamento.

### P2 — Duas mãos não disparam duas vezes

**Given** uma execução já aberta para aquela rotina
**When** alguém aperta o botão
**Then** a resposta é `409` com código estável, e **nenhuma** segunda execução nasce — a decisão é do
índice único, não de uma leitura seguida de `if`.

### P3 — Quem só lê não vê o botão

**Given** um usuário com `operations.read` e sem `operations.run`
**When** ele abre a tela de rotinas
**Then** não há botão — e se a chamada for forjada, a rota responde `403`.

## Requisitos funcionais

1. **RF1** — `POST /operations/jobs/:job/run` cria a execução manual e publica em `job-run.v1`.
2. **RF2** — A rotina precisa existir no catálogo; nome fora dele é `400`, não `500`.
3. **RF3** — Execução já aberta para a mesma rotina é `409` com código estável, decidido pelo índice
   único. **Nunca** por `select` seguido de `insert`: entre os dois cabe outra escrita.
4. **RF4** — A execução grava `requested_by` e `company_id` do contexto autenticado — nunca do corpo.
5. **RF5** — Permissão própria, `operations.run`, separada de `operations.read`.
6. **RF6** — A tela mostra o botão por rotina e o resultado do disparo, incluindo a recusa por
   execução aberta.

## Requisitos não funcionais

- **RNF1 — O botão gasta cota de terceiro.** `geocoding.backfill` fala com a BrasilAPI e
  `fuel.price.pull` com a ANP; um botão sem freio é um jeito de martelar serviço alheio por clique.
  O freio é o `409` da execução aberta, e ele **não é opcional**.
- **RNF2 — A publicação e a escrita não podem divergir.** Execução gravada sem mensagem publicada
  fica aberta até o abandono; mensagem publicada sem linha não tem o que reivindicar.

## Casos extremos e falhas

| caso                                       | comportamento                                                           |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| rotina fora do catálogo                    | `400`                                                                   |
| execução já aberta                         | `409`, e nenhuma linha nova                                             |
| rotina sem consumidor registrado no worker | roda e pousa em `job_run_routine_missing` — comportamento que já existe |
| broker indisponível                        | a execução **não** nasce; o operador vê a falha e tenta de novo         |
| dois cliques simultâneos                   | um vence, o outro recebe `409` — pelo índice                            |

## Critérios de aceite

- **CA1** — Disparo cria execução `manual` com `requested_by` e publica uma mensagem.
- **CA2** — Segundo disparo com execução aberta responde `409` e **não** insere.
- **CA3** — Falha ao publicar não deixa execução aberta órfã.
- **CA4** — Sem `operations.run`, `403`.
- **CA5** — `make check` verde.
