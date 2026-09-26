# Tasks — Feature 196

Uma task por vez, na ordem abaixo. Cada task fecha com:

- typecheck (`bun run typecheck` na raiz);
- testes da app tocada. Suíte nova só roda se estiver importada pelo entrypoint nomeado na task (ou
  listada no `package.json`), e o aceite traz **"a contagem de testes subiu em N"**, com o N
  conferido na saída do `bun test`;
- commit isolado, com caminhos explícitos (`--no-verify` só com caminhos explícitos: o hook de
  pre-commit dá `git add` na árvore inteira);
- evidência em `evidence.md` (criado na T0.1).

Teste de aceite ou de contrato vem **antes** da implementação.

Comandos de teste da API, de dentro de `apps/api-transportada`:

```bash
bun --env-file=../../.env.test test --timeout 120000   # contrato — sem banco
bun --env-file=../../.env.test run test:integration    # integração — sem a flag, PULA em vez de falhar
```

Task que mexe em `test/integration/**` só fecha com o segundo comando.

**Regra de tela do usuário.** Toda task que muda tela roda primeiro no **preview local** e só sobe
para staging **depois de o usuário ver**. Entradas do `.claude/launch.json`:

- `motorista-local` — porta 53200, com `VITE_API_URL=http://localhost:53901`;
- `motorista-api-demo` — a API de demonstração, hoje em
  `/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada--claude-worktrees-pensive-borg-f59971/bb453e02-a58a-48b5-833a-3401376ec42e/scratchpad/driver-preview-api.ts`,
  versionada pela T5.0 em `apps/frontend-driver/scripts/driver-preview-api.ts`;
- `painel-local` (53000) ou `painel-worktree` (53010) — confirme de qual árvore são o Vite e a API
  antes de prometer que a mudança aparece: a 53000 pode ser de outra sessão.

**Ordem de publicação** (`plan.md` § Ordem de deploy): push 1 = T4.0 (painel tolerante); push 2 =
Fases 1–4 (banco, worker, API) + a sonda; push 3 = Fases 5–6 (app e tela), só depois da sonda e do ok
do usuário. A API não é revertida com a app nova no ar.

**Arquivos em disputa.** A 192 e a 193 (outras sessões) mexem em `useDriverTrip.hook.ts`,
`driverTrip.types.ts`, `DriverTripWorkspace.page.tsx`, `DriverStopCard.component.tsx`,
`tripResponse.validation.ts` e `TripTimeline.component.tsx`. Antes de cada task das Fases 4, 5 e 6:
`git fetch` e o `git log` de `origin/staging` naquele arquivo.

## Fase 0 — Conferir antes de escrever

> 🤖 Modelo: `opus` 🧠

- [ ] **T0.1** Ler as specs do assunto e conferir contra o código:
  - 057 (a da ADR-0045) e 082 (posição na entrega);
  - 158 e 180 (linha do tempo), 159 (posição da foto), 189 T9.2 (grava primeiro);
  - 156 (escritório) e 144 (WhatsApp, as duas listas de ações em `main.ts`);
  - o estado atual de 192, 193, 194 e 195 em `origin/staging` e nos worktrees.

  Conferir o inventário da tabela do `spec.md` (arquivo:linha), a lista de leitores do `plan.md` e os
  papéis com `fleet.read` em `authorization.policy.ts`. Divergência vira correção no
  `spec.md`/`plan.md` **antes** de código. Passar a ADR-0081 para `aceita` e criar `evidence.md`.
  Aceite: `evidence.md` com o inventário conferido, a lista de leitores confirmada e o que 192/195 já
  decidiram sobre o carimbo; se a 192 ou a 195 divergirem do `spec.md` § Interseções, parar e
  perguntar.

## Fase 1 — O banco guarda o ponto e o estado

> 🤖 Modelo: `opus` 🧠 (modelo de dados, CHECKs e migration; validar com `architect` antes da T1.2)

- [ ] **T1.1** Contrato de schema primeiro, em `test/trip-schema/events.contract.ts` (importado por
      `test/trip-schema.contract.test.ts`):
  - nas três tabelas novas: as cinco colunas, os oito CHECKs do `plan.md` § Dados, com os nomes de lá,
    e o índice parcial;
  - em `trip_stop_events`: `location_state` e os três CHECKs de estado.

  Aceite: o contrato falha pelo motivo certo; a contagem subiu em N.

- [ ] **T1.2** `database/event-location.schema.ts` (helpers e `EVENT_LOCATION_STATES`),
      `trip.schema.ts` e a migration `drizzle/<timestamp>_event_location_stamp/`:
  - `migration.sql` com o `UPDATE ... SET location_state = 'captured' WHERE latitude IS NOT NULL` de
    `trip_stop_events`;
  - `rollback.sql`, com o aviso de perda de dado e de ordem (API revertida antes) no topo;
  - `snapshot.json` do `db:generate`.

  Antes: contar em staging e produção (só leitura, agregado) as linhas de `trip_stop_events` com
  coordenada, e as com coordenada e canal fora de `driver_app`; registrar em `evidence.md` e seguir o
  `plan.md` § Dados se passar de 100 mil ou se houver canal fora. Aceite: T1.1 verde,
  `db:generate` = `no_changes`, `test/database-migration/schema-snapshot.contract.ts` verde e
  **`make migration-test`** verde.

- [ ] **T1.3** Auditoria de leitura (RF12), **antes** de qualquer escrita de ponto:
  - os leitores listados no `plan.md` § API — leitura são conferidos contra `select()` sem projeção e
    contra spread da linha na resposta; quem devolver a linha inteira passa a projetar colunas;
  - `trips/application/event-location-readers.constant.ts` com a lista de leitores permitidos (D7) e
    `test/trip-schema/event-location-readers.contract.ts` (importado por
    `test/trip-schema.contract.test.ts`), que varre `src/` e reprova referência às colunas de posição
    das cinco tabelas fora da lista;
  - contrato negativo por resposta: portal (`contractor-occurrence.query.ts`), tratativa,
    demonstrativo, acerto e reentrega sem `latitude`, `longitude`, `accuracyMeters`, `capturedAt` ou
    `locationState`.

  Aceite: contratos verdes, os dois comandos da API verdes, a contagem subiu em N.

## Fase 2 — O prazo de 90 dias vale para as cinco tabelas

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Contratos primeiro, no worker (em `test/trip-location-purge/`, importados por
      `test/trip-location-purge.contract.test.ts`):
  - `trip-execution.schema.ts` **declara** as três tabelas novas (`id`, tempo, as quatro de posição,
    `location_state`) e `location_state` em `tripStopEvents` — cópia por valor;
  - `TRIP_LOCATION_STAMPED_TABLES` e `TRIP_LOCATION_UNSTAMPED_TABLES` (exclusões com motivo);
  - contrato de paridade do D8: toda tabela com `latitude` no schema da API está numa das duas listas
    (no molde do contrato que já compara `TRIP_TRACKING_MAX_AGE_HOURS`);
  - teto de lotes e `exhausted` por tabela.

  Aceite: falham pelo motivo certo; a contagem subiu em N.

- [ ] **T2.2** Redatores das três tabelas novas e `expired` no de `trip_stop_events`; a rotina roda
      cada tabela com seu teto, captura o erro **por tabela** (a coluna ausente, `42703`, não derruba o
      processo nem as outras tabelas) e loga `redactedByTable`, `exhaustedTables` e a tabela que
      falhou — só contagens. Aceite: contratos verdes; `test/trip-location-purge.integration.test.ts`
      **estendido** com eventos de 91 e 89 dias nas cinco tabelas (`make worker-integration`): o de 91
      perde as quatro colunas e fica `expired`, o de 89 fica intacto, o evento continua existindo; a
      contagem subiu em N.

## Fase 3 — A API grava o ponto de todo toque

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** `event-location-stamp.policy.ts` e tipos, com o contrato primeiro
      (`test/trip-domain/event-location-stamp.contract.ts`, importado por
      `test/trip-domain.contract.test.ts`): `driver_app`, `whatsapp` do motorista, `whatsapp` do
      operador, `office`, `backoffice` × com/sem ponto × toque/derivado. Aceite: verde; a contagem subiu
      em N.
- [ ] **T3.2** Fronteira HTTP, contrato primeiro (`test/trip-http/event-location-request.contract.ts`,
      importado por `test/trip-http.contract.test.ts`):
  - `dispatch` com `{ tripId, location? }`;
  - `start-route`/`confirm-load` com corpo opcional, e corpo vazio continua `200`;
  - as duas ocorrências com `location?`;
  - `location` parcial → `400` em `location`;
  - precisão acima do teto → gravada no teto, nunca `400`;
  - rotas do escritório com `location` → `400`.

  Aceite: verde; a contagem subiu em N.

- [ ] **T3.3** Levar o ponto até o banco: `dispatchTrip`/`startFieldTrip` → `recordTripStatusChange`
      (`locationStamp` opcional; as chamadas derivadas não mudam), ocorrência da parada, ocorrência da
      nota, e o `location_state` em chegada/entrega/devolução. As três ações de
      `driverWhatsAppFlowActions` gravam `unavailable`; `operatorWhatsAppFlowActions`, escritório e
      backoffice gravam `null`. Aceite: contratos da aplicação verdes, e as suítes que exercitam as
      chamadas existentes de `recordTripStatusChange` seguem verdes sem mudança de expectativa —
      `trip-status-write-guard`, `trip-timeline`, `trip-lifecycle` e `trip-auto-dispatch`.
- [ ] **T3.4** Contrato de inventário do D9 (`test/trip-http/driver-location-stamp-inventory.contract.ts`,
      importado por `test/trip-http.contract.test.ts`), pelo comportamento descrito no `plan.md` §
      Exceções do inventário do D9:
  - a lista de rotas vem de `createMeTripRoutes`;
  - cada `POST` sob `/me/trips/current` está na tabela de amostras (corpo mínimo válido) ou nas
    exceções com motivo: `POST /me/trips/current/location`, `proof`, `occurrence-uploads` e
    `confirm`, e as de sugestão da 192 quando existirem;
  - com `location` válido, a resposta não é `400` em `location`; com `location` parcial, é.

  Aceite: verde, e uma rota falsa sem `location` fora das duas listas reprova (provado no próprio
  teste); a contagem subiu em N.

- [ ] **T3.5** Integração contra Postgres (`test/integration/event-location-stamp.integration.ts`,
      **linha nova no script `test:integration`** do `package.json`):
  - CA01: cada rota de toque com e sem ponto;
  - CA02: troca derivada `null`;
  - CA03: escritório `null`, WhatsApp do motorista `unavailable`, WhatsApp do operador `null`;
  - CA04: os CHECKs recusam ponto com canal `office` e estado com canal `backoffice`;
  - isolamento por empresa.

  Aceite: **os dois comandos da API** verdes; a contagem da integração subiu em N.

## Fase 4 — A linha do tempo devolve o ponto, para quem pode ver

> 🤖 Modelo: `sonnet`

- [ ] **T4.0** Painel tolerante, **primeiro push da spec**: `tripResponse.validation.ts` aceita
      `location`/`locationState` como **opcionais** no item (continua recusando chave desconhecida).
      Contrato em `apps/frontend-transportada/test/trip/timeline-location.contract.ts` (importado por
      `test/trip.contract.test.ts`): item sem as chaves passa, item com as duas passa, item com chave
      estranha falha. Se a T0.2 da 192 (ignorar `kind` desconhecido) não estiver em `origin/staging`,
      combinar com ela no mesmo push, sem reimplementar. Não muda tela. Aceite: `check` do painel verde,
      a contagem subiu em N, push para staging depois dos gates.
- [ ] **T4.1** Permissão e leitura, contrato primeiro:
  - `trip.event-location` em `company-admin`, `operator`, `fiscal` e `viewer`
    (`authorization.policy.ts`), com os contratos que enumeram permissões por papel atualizados;
  - tipos, `trip-timeline-status.query.ts`, `trip-timeline-stop.query.ts`,
    `trip-timeline-document.query.ts`, conversão nos mappers, e `canReadEventLocation` na rota;
  - o teste da spec 158 que proibia `latitude` passa a exigir que posição só apareça em
    `location`/`locationState` — emenda escrita, não teste apagado;
  - `test/trip-http/event-location-redaction.contract.ts` (importado por
    `test/trip-http.contract.test.ts`), no molde de `driver-redaction.contract.ts`: `finance` e
    `separator` recebem `200`, `location: null` e o `locationState`; `operator` recebe a coordenada.

  Aceite: verdes; a contagem subiu em N.

- [ ] **T4.2** Integração: viagem com os quatro estados (`captured`, `unavailable`, `expired`, `null`)
      nas quatro fontes; cursor com 250 eventos continua sem pular nem repetir;
      `test/trip-schema/trip-timeline-query-tenant-safety.contract.ts` cobre as colunas novas; outra
      empresa → `404`. Aceite: os dois comandos da API verdes; a contagem subiu em N.
- [ ] **T4.3** Push 2 e a sonda (`plan.md` § Ordem de deploy): gates da API e do worker, rebase limpo,
      push; conferir a migration aplicada e o ciclo do expurgo sem erro; rodar a sonda de `dispatch` e
      de ocorrência da parada com `tripId`/`stopId` inexistentes e registrar as respostas em
      `evidence.md`. Aceite: a sonda não devolve `400` em `location` nas duas rotas.

## Fase 5 — A app do motorista manda o ponto de todo toque

> 🤖 Modelo: `sonnet`

- [ ] **T5.0** Versionar a API de demonstração: copiar a versão atual do scratchpad para
      `apps/frontend-driver/scripts/driver-preview-api.ts` (fora do `src/` e do bundle), apontar o
      `motorista-api-demo` do `.claude/launch.json` para ela e registrar em `evidence.md` a origem da
      cópia e o aviso às sessões da 192 e da 193. Aceite: `motorista-local` sobe contra ela e a tela da
      viagem abre.
- [ ] **T5.1** Contratos primeiro (`apps/frontend-driver/test/driver-trip/event-location-queue.contract.ts`
      e `.../direct-tap-location.contract.ts`, importados por `test/driver-trip.contract.test.ts`):
  - corpo de `occurrence`, `documentOccurrence`, `dispatch` e `start-route` com `location`;
  - o item da fila nasce `null` e é completado pela chave nas duas ocorrências;
  - "Não entreguei" completa as duas chaves;
  - a ocorrência de nota da porta direta (`onDocumentOccurrence`) vira item `documentOccurrence` na
    fila, com `location`, e não chama mais `POST` direto;
  - item antigo sem o campo sai com `location: null`;
  - `readDirectTapLocation` com uma Geolocation falsa que **ignora as opções** e nunca chama de volta
    resolve `null` em 3 s (relógio falso), e com uma que responde devolve a posição com a precisão no
    teto.

  Aceite: falham pelo motivo certo; a contagem subiu em N.

- [ ] **T5.2** Fila: tipos, `applyReportLocation` sem a exceção da ocorrência (e o comentário),
      `withLegacyLocation`, ocorrência da parada e ocorrência de nota direta por `reportWithLocation`,
      "Não entreguei" nas duas chaves, corpo do `send`, `registerDocumentOccurrence` removido do
      cliente. Aceite: contratos da fila verdes; o `check` de `apps/frontend-driver` verde.
- [ ] **T5.3** Toque direto: `readDirectTapLocation` (`Promise.race` com o relógio da app de 3 s,
      `enableHighAccuracy: false`, `maximumAge` de 5 min) e "Despachar"/"Iniciar rota" com corpo.
      Aceite: contratos verdes; `check` verde.

  > ⚠️ **Aviso da spec 206 (ADR-0088, 2026-09-26).** O "Iniciar rota" **deixou de ser toque direto**: ele
  > virou um toque por parada (`POST /me/trips/current/stops/:stopId/depart`) e passou à **fila**, com
  > `tappedAt`. A app nova não chama mais `POST /me/trips/current/start-route` — a rota segue aceita só
  > para a versão antiga. Consequências para esta task e para a T5.4:
  >
  > - o alvo de **3,2 s** do toque direto de "Iniciar rota" perde o objeto; o que resta de toque direto
  >   é o "Despachar". Medir o prazo no "Iniciar rota" passa a medir o enfileiramento, não o GPS;
  > - a §5 da ADR-0081 foi emendada pela ADR-0088 (Iniciar rota passa à fila), e na tabela "Finalidade"
  >   o ponto do Iniciar rota é a base do tempo de trajeto **da parada**;
  > - o `location` do Iniciar rota continua existindo, mas chega pelo corpo do item de fila, no caminho
  >   do "Cheguei", não pelo `readDirectTapLocation`.

- [ ] **T5.4** Preview e smoke:
  - a API de demonstração aceita e guarda em memória, **sem imprimir**, o `location` das quatro rotas
    e o expõe numa rota de depuração local;
  - `motorista-local` na 53200, com GPS permitido e negado (emulação do navegador): o corpo sai com
    ponto e com `null`;
  - smoke Playwright no `driver-app.smoke.spec.ts`: `grantPermissions(['geolocation'])` +
    `setGeolocation`; permissão negada; e GPS mudo, em que o `POST` de "Iniciar rota" sai em **≤ 3,2 s**
    medido entre o clique e a requisição.

  Aceite: smoke verde e o registro do preview em `evidence.md`. Sem mudança visual esperada; se houver,
  print e ok do usuário antes de subir.

## Fase 6 — Quem gere a frota vê o ponto na linha do tempo

> 🤖 Modelo: `sonnet`

- [ ] **T6.1** Contratos primeiro (`apps/frontend-transportada/test/trip/timeline-location.contract.ts`,
      estendido):
  - `resolveTimelineLocationView` em `captured` com e sem coordenada, `unavailable` (e WhatsApp),
    `expired` e `null`;
  - `hasTripTimelineExpandableDetail` conta `captured` com coordenada;
  - `test/trip-timeline-smoke.helper.ts` e `test/trip/timeline-smoke-payload.contract.ts` com as duas
    chaves.

  Aceite: falham pelo motivo certo; a contagem subiu em N.

- [ ] **T6.2** `TripTimelineLocation.component.tsx` (ícone `map-pin`, precisão, hora da leitura, "Ver
      no mapa" ≥ 44 px, sem "Ver no mapa" quando `location` é `null`),
      `TripTimelineLocationMap.component.tsx` (`lazy`, o mapa que o `TripRouteMap` já usa, dois
      pinos), textos em `trip.locale.json` e `trip.en.locale.json`. Componente declarativo; a regra mora
      no serviço da T6.1. Aceite: contratos verdes; `check` do painel verde.
- [ ] **T6.3** Preview no painel local, com a API local desta árvore e uma viagem cujos eventos foram
      gravados **pelas rotas do motorista** (curl com token de motorista, ou a app apontada para a API
      local) — nunca `INSERT` cru —, com **coordenadas sintéticas** (um ponto de teste, não uma
      posição real). Mostrar os estados do RF10, o mapa expandido e a visão do `finance` (estado sem
      coordenada). Aceite: prints em 1280 e 375 px em `prints/` e o **ok do usuário** antes de subir.
- [ ] **T6.4** O validador do painel passa a **exigir** `location` e `locationState` (a API já as
      manda desde o push 2). Aceite: contrato da T4.0 ajustado (item sem as chaves falha); `check`
      verde.

## Fase 7 — Revisão de design, documentação viva, gates e medição

> 🤖 Modelo: `sonnet` (revisão final com `code-reviewer` em `opus`)

- [ ] **T7.1** Revisão de design (`web.md` §15) contra a própria página:
  - a linha de posição comparada com a linha de autoria e com o "ver foto" da spec 180 (fonte, cor
    secundária, espaçamento, ícone);
  - o mapa expandido comparado com a foto expandida;
  - contraste no item normal e no expandido;
  - 375 px sem rolagem horizontal.

  Divergência consertada na mesma task. Aceite: prints finais em `prints/` e o ok do usuário.

- [ ] **T7.2** Documentação viva:
  - `CLAUDE.md` da API, do worker, do painel e da app do motorista (parágrafo de posição de cada um);
  - `docs/SECURITY.md`: retenção lista as cinco tabelas e o `location_state`; a permissão
    `trip.event-location`; o que o host do mapa base vê;
  - `docs/ai-context/*.md` onde o núcleo apontar;
  - nota de emenda no `spec.md` da 158 apontando a ADR-0081;
  - prettier nos `.md` tocados.

  Aceite: `bun run format:check` verde.

- [ ] **T7.3** Auditoria (`code-standart.md` §15 e `security.md`):
  - coordenada em nenhum log (grep em `logger.`/`console.` dos arquivos tocados, e na API de
    demonstração);
  - nenhuma resposta fora da tabela do D7 com posição;
  - N+1 nas consultas da linha do tempo;
  - `EXPLAIN` da seleção do expurgo em cada uma das cinco tabelas mostrando **Index Scan** no índice
    parcial (com `SET enable_seqscan = off` na sessão, porque a tabela de teste é pequena);
  - onde `VITE_MAP_TILES_URL` aponta em staging e produção e se o host guarda log de acesso.

  Aceite: achados em `evidence.md` e, se houver, em `docs/SECURITY.md`.

- [ ] **T7.4** Gate completo e push 3: `make check`, `make migration-test`, os dois comandos da API,
      `make worker-integration`, `make smoke`. Publicação só com rebase limpo sobre `origin/staging`
      (fetch, rebase, `bun install --frozen-lockfile`, gates e push para `HEAD:staging`, encadeados com
      `&&`), migration renumerada se colidir com 192/193/195, `db:generate` = `no_changes` depois do
      rebase. O push 3 (app e tela) só sai com a sonda da T4.3 registrada e o ok do usuário nos
      prints. Aceite: gates verdes e a ordem dos três pushes em `evidence.md`.
- [ ] **T7.5** Revisão final por `code-reviewer` (`opus`) sobre o diff inteiro da spec, com foco em
      vazamento de posição, na permissão `trip.event-location` e no CHECK de canal. Achado bloqueante
      reabre a task de origem.
- [ ] **T7.6** Medição do D5, uma semana depois do push 3: a consulta do `plan.md` § Observabilidade
      (agregado, sem dado pessoal), em produção só com o ok do usuário. Aceite: resultado e decisão em
      `evidence.md` pelo critério do plano (acima de 30% de `unavailable` em `in_transit` ou
      `dispatched`, o relógio sobe para 5 s; abaixo de 10%, fica).

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/196-todo-evento-carrega-onde-aconteceu/ (leia spec.md,
plan.md, tasks.md e docs/adr/0081-todo-toque-do-motorista-carimba-onde-aconteceu.md antes de começar).
Uma task por vez, na ordem do tasks.md.
Modelos: Fase 0 🧠 → opus · Fase 1 🧠 → opus (modelo de dados, CHECKs e migration; validar com
architect antes da T1.2) · Fase 2 → executor model=sonnet · Fase 3 → executor model=sonnet ·
Fase 4 → executor model=sonnet · Fase 5 → executor model=sonnet · Fase 6 → executor model=sonnet ·
Fase 7 → executor model=sonnet · revisão final (T7.5) → code-reviewer model=opus.
Cada task fecha com typecheck + testes da app, com a suíte nova importada pelo entrypoint nomeado na
task e "a contagem subiu em N" conferida, + commit isolado com caminhos explícitos, evidência em
evidence.md. T1.2 fecha com `make migration-test`, não só com `make check`. Integração da API:
`bun --env-file=../../.env.test run test:integration` de dentro de apps/api-transportada — sem a flag
a integração pula em vez de falhar. A T1.3 (auditoria de leitura) vem antes de qualquer escrita de ponto.
ORDEM DE PUBLICAÇÃO: push 1 = T4.0 (painel tolerante) · push 2 = Fases 1–4 + a sonda da T4.3 (dispatch
e ocorrência com location não podem dar 400) · push 3 = Fases 5–6, só depois da sonda e do ok do
usuário. Nunca reverter a API com a app nova no ar: reverte-se a app primeiro.
REGRA DO USUÁRIO: toda mudança de tela roda primeiro no PREVIEW local — motorista-local na 53200 com a
API de demonstração (motorista-api-demo; versionada pela T5.0 em
apps/frontend-driver/scripts/driver-preview-api.ts, hoje em
/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada--claude-worktrees-pensive-borg-f59971/bb453e02-a58a-48b5-833a-3401376ec42e/scratchpad/driver-preview-api.ts)
e o painel local (confirme a árvore da 53000/53010) — e só sobe para staging depois de o usuário ver
os prints. Coordenada nunca em log, nem na API de demonstração; prints com coordenada sintética.
Antes das Fases 4, 5 e 6, confira git log origin/staging nos arquivos em disputa com as specs 192 e 193.
Pare e pergunte antes de: deploy em produção, migration destrutiva, rollback em banco com dado,
consulta em produção (T1.2 e T7.6), qualquer [NEEDS CLARIFICATION], todo push de tela sem o ok do
usuário, e se a 192 ou a 195 já tiverem decidido o carimbo de forma diferente do spec.md § Interseções.
```
