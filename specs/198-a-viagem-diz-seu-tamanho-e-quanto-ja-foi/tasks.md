# Tasks — Spec 198

**👤 = ação humana.** O executor para, descreve o passo exato, espera o "feito" e confere o efeito.
**🧠 = task que sobe para `opus`** dentro de uma fase mais barata.

**Base.** A 198 só começa depois de `work/driver-app` chegar a `origin/staging` (spec §
Pré-requisito). A branch nasce na própria árvore, com `git switch -c work/spec-198 origin/staging`.
Nada de `make worktree` (em worktree do Claude ele não roda) e nada de `git stash`.

Toda task de comportamento começa pelo contrato ou teste, **visto vermelho**, e fecha com:

- `bun run typecheck`, `bun run lint` e os testes da app tocada;
- na API, os **dois** comandos, de dentro de `apps/api-transportada`:
  - `bun --env-file=../../.env.test test --timeout 120000`;
  - `bun --env-file=../../.env.test run test:integration`, sempre que a task tocar
    `test/integration/**`, uma query ou um repositório. Sem o `--env-file` a integração **pula**, e
    pular não é passar;
- suíte nova importada no entrypoint da área. Um `*.contract.test.ts` novo, se houver, entra no
  script `test` do `package.json`. O `test/test-registry/declaration.contract.ts` lê o disco
  sozinho: ele só reprova o que faltar no script;
- evidência no `evidence.md`: comando, contagem e trecho relevante;
- commit isolado, com `--no-verify` e caminhos explícitos.

**Proibido nesta spec:** tocar `listStops`/`toDriverStop` (a correção da coordenada da parada é de
outra sessão) e qualquer migration fora do índice condicional da T1.6.

**Tela nova ou mudada roda primeiro no preview local**, e só sobe depois do **"pode subir"** do
usuário. A ordem de deploy é API → app → painel.

## Fase 0 — Base, ADR e premissas

> 🤖 Modelo: `opus`

- [ ] **T0.1** Conferir e aceitar, e parar se algo divergir.
  1. **Base:** `git fetch` e confirmar que o commit de `describeTripSelectorPath` está em
     `origin/staging`. Se não estiver, **pare** e avise.
  2. **Numeração:** `git log --all --oneline -- 'specs/198*' 'docs/adr/0083*'` só com esta spec.
  3. **Premissas:** as dez do `plan.md`, com arquivo:linha de cada uma.
     - A premissa 2 anota o resultado de
       `git log origin/staging --oneline -S geocodedAddresses -- apps/api-transportada/src/trips/infrastructure/drizzle-current-driver-trip.repository.ts`.
     - A premissa 10 anota o `git diff --name-only origin/staging...HEAD` cruzado com a tabela da
       spec § Convivência.
  4. **Q3:** medir em staging a distribuição das durações candidatas a amostra (D14): quartis,
     quantas caem abaixo de 30 s e quantas acima de 2 h. Se o teto de 2 h cortar descarga real
     frequente, pare e pergunte antes da T1.5.
  5. **ADR:** passar a ADR-0083 a `aceita`, sem mudar decisão.

## Fase 1 — API

> 🤖 Modelo: `sonnet` (T1.2 e T1.5 são 🧠 `opus`)

- [ ] **T1.1** Parsers e `toDriverTripRoute` (RF2–RF4, RF7).
  - Arquivos:
    - `parse-planned-route.policy.ts` ganha `parsePlannedRouteDepot` (com `endKind?`),
      `parseRouteLeg` e `parseStopIdList`;
    - `readPlannedRouteDepot` passa a usar o parser;
    - `driver-trip-route.policy.ts` e `.types.ts` são novos.
  - Contrato antes: `test/trip-domain/driver-trip-route.contract.ts`, no entrypoint da área.
    - Métricas nulas → `null`; `depot` malformado → `null`; perna malformada →
      `lastLegDurationSeconds: null`.
    - Origem: `company_address` → com endereço; `route_settings` → sem endereço;
      `description: null` → `name: null`; `leadingLegs = 0` → `first_stop` com a 1ª parada **não
      excluída**.
    - Fim: `trailingLegs = 0` → `last_stop` com a última não excluída; barracão ausente →
      `last_stop`; `endKind` gravado → o gravado; ausente ou fora da lista → `unspecified`.
    - `excludedStopIds` presente → `excludedStopCount`; ausente → `null`.
    - Contrato negativo: sem pedágio, custo, coordenada, telefone, `points` nem `legs`.
- [ ] **T1.2** 🧠 O congelamento grava `endKind` e `excludedStopIds` (RF5).
  - Anotar no `evidence.md` `main.ts:1921` e o grep das cinco ocorrências de
    `tripRouteTollFreezer`.
  - `route-depot.policy.ts` ganha `endSource` e `ROUTE_END_KINDS`; `route-depot.query.ts` passa a
    preencher `endSource`.
  - `read-route-geometry.use-case.ts` ganha `depot.endKind`.
  - `trip-stop-coordinates.support.ts` devolve `{ points, excludedStopIds }`, e o traçado não muda.
    Se a 197 já estiver lá, as irmãs dela seguem como dois pontos com perna 0.
  - `writePlannedRoute` grava `excludedStopIds`.
  - Contratos antes, em `route-depot.contract.ts` e `route-geometry-depot.contract.ts`: as três
    políticas e o barracão ausente.
  - Integração:
    - `route-depot-query.integration.ts`: `endSource`;
    - `freeze-trip-planned-route.integration.ts`: `endKind = 'depot'` e uma parada sem geocódigo em
      `excludedStopIds`, com o traçado igual ao de antes.
  - Os contratos do painel sobre `route-geometry` continuam verdes (CA04).
- [ ] **T1.3** `GET /me/trips/current` leva `route` (RF1, RF6–RF8).
  - `listActiveTrips` passa a ler `-> 'depot'`, `-> 'excludedStopIds'` e `-> 'legs' -> -1`, nunca
    `planned_route` inteiro, e o mapeador chama `toDriverTripRoute`.
  - Passam a carregar o campo: o tipo em `find-current-driver-trip.use-case.ts` e `serializeTrip`.
  - **Antes e depois**, anotar no `evidence.md`:
    - `select pg_column_size(planned_route)` (mediana e máximo) numa base com viagens planejadas;
    - o `EXPLAIN (ANALYZE, BUFFERS)` da consulta de `listActiveTrips`.
  - Contratos antes:
    - `current-trip.contract.ts`: os estados de `route`;
    - `me-routes.contract.ts`: o CA01 negativo sobre o corpo HTTP, varrendo só dentro de `route`.
  - Integração (`me-trip.integration.ts`):
    - viagem planejada → `route` com `end.kind = 'depot'` e `excludedStopCount = 1`;
    - viagem sem rota → `null`;
    - viagem de outra empresa fora;
    - o CA01 negativo.
- [ ] **T1.4** _(condicional: convivência com a 192, RF9.)_ Só se a tabela `trip_stop_order_events`
      da 192 já estiver em `origin/staging`:
  - `route.isFromPreviousStopOrder = true` quando o **último** evento da viagem tem
    `route_recomputed = false`;
  - a leitura é em lote;
  - contrato e integração.

  Senão, anotar no `evidence.md`: "N/A — pendente; implementa quem chegar por último (spec 198
  RF9)". A 198 **não** edita os arquivos da 192.

- [ ] **T1.5** 🧠 Tempo de parada: as duas políticas puras (D14, D15).
  - `stop-service-sample.policy.ts` (`toStopServiceSample`, `STOP_SERVICE_SAMPLE_BOUNDS`) e
    `trip-stop-time.policy.ts` (`estimateTripStopTime` sobre `resolveServiceTime`), com os tipos
    `*Params`/`*Result`.
  - Contratos antes (CA14), em `stop-service-sample.contract.ts` e `trip-stop-time.contract.ts`:
    - vai do primeiro `arrived` ao último desfecho;
    - **mesmo relógio:** os dois extremos com `captured_at`, ou os dois com `recorded_at`. A amostra
      mista fica fora, com o motivo `mixed_clock` no resultado, para o `debug` contar;
    - **irmãs:** duas paradas da mesma viagem e do mesmo `address_key`, com "Cheguei" juntos. A
      segunda começa no último desfecho da primeira, quando ele cai dentro da janela dela;
    - ficam fora: canal diferente de `driver_app`, < 30 s, > 2 h, parada sem `arrived` e parada não
      concluída;
    - o cliente é o CNPJ/CPF normalizado por `normalizeTaxId` e conta só com todas as notas dele.
      Parada mista, ou nota sem documento, conta só para a empresa;
    - `stopCount` conta todas as paradas, inclusive as fora do traçado;
    - a escala é cliente → empresa → `measuring`, e a soma cobre todas as paradas;
    - 91 dias fica fora da janela; o mínimo vem da configuração, com 5 sem linha.
  - Validar o desenho com `architect` (`opus`) antes de implementar.
- [ ] **T1.6** Tempo de parada: consulta, cache e snapshot (D16, D17, RF10).
  - `drizzle-stop-service-samples.query.ts`, `StopServiceTimeEstimatePort` e
    `cached-stop-service-time-estimate.adapter.ts`:
    - TTL de 1 h, relógio injetado e `Promise` em voo dividida;
    - valor vencido serve enquanto recalcula;
    - `statement_timeout` de 2 s;
    - falha → `warn`, `Promise` fora do mapa, valor antigo ou `unavailable`.
  - A consulta seleciona `trip_id`, `address_key`, eventos `driver_app` com `captured_at` e
    `recorded_at`, e o `tax_id` do destinatário.
  - `find-current-driver-trip.use-case.ts` monta `stopTime`. A composição em `main.ts` inclui o
    WhatsApp.
  - `EXPLAIN (ANALYZE, BUFFERS)` da consulta com volume semeado. Com varredura cara, entra o índice
    aditivo `(company_id, completed_at)`, com `rollback.sql`, `make migration-test` e `db:generate` =
    `no_changes`.
  - Contratos antes:
    - o adaptador com relógio falso;
    - o **caminho de falha** (CA15a): rejeição e timeout → `warn`, `stopTime` omitido, GET `200`,
      valor antigo servido quando existe, e a leitura seguinte tenta de novo; `stopTime` nos três estados; o CA16 (a consulta
      não seleciona `actor_user_id`, `reported_by_driver_id` nem `on_behalf_of_driver_id`, e a
      resposta não traz mediana nem chave de cliente).
  - Integração (CA15):
    - eventos reais gravados pelo caso de uso do app, com `location.capturedAt` **espaçado** (10 min
      entre chegada e entrega; com `recorded_at` em `defaultNow` a amostra cairia no piso) →
      `measured`;
    - outra empresa → `measuring`;
    - uma segunda leitura na mesma hora não consulta o banco.
  - Um `debug` do recálculo com os descartes por motivo, sem CNPJ.
- [ ] **T1.7** Publicar a API em staging, no primeiro push da spec. O comando é
      `git fetch && git rebase origin/staging && bun install --frozen-lockfile`, seguido dos gates e
      do push, tudo encadeado com `&&`. Antes, repetir o cruzamento da tabela da § Convivência e
      anotar.

## Fase 2 — App do motorista

> 🤖 Modelo: `sonnet` (T2.2 é `haiku`)

- [ ] **T2.1** Tipos e validador (RF11).
  - `route?` e `stopTime?`, com três estados cada.
  - Contrato antes, em `test/driver-trip/route-response.contract.ts` (novo, no entrypoint, CA05):
    ausente, `null`, objeto e malformado. Inclui um snapshot sem os campos relido pelo caminho do
    IndexedDB.
- [ ] **T2.2** Formatadores (RF13).
  - `driverRouteFormat.service.ts`: `formatRouteDistance`, com a regra de
    `driverStopDistance.service.ts:59`, e `formatDuration`, **cópia por valor** da 138
    (`suggestionValuation.service.ts:149`) com o cabeçalho da ADR-0075 §7.
  - Acrescentar a entrada no mapa de `copy-by-value-header.contract.ts`.
  - Contrato CA07 em `route-summary.contract.ts` (novo).
- [ ] **T2.3** Porcentagem por nota (RF12). `computeDocumentProgress`, com a tabela do CA06 em
      `progress.contract.ts`. `computeTripProgress` não muda.
- [ ] **T2.4** Visão, quadro e legenda (RF14, RF15, RF17, RF18).
  - `driverTripRouteView.service.ts` e `DriverTripRouteSummary.component.tsx`, montado em
    `DriverTripWorkspace.page.tsx`. A legenda vai para a `DriverTripProgress`.
  - Duração:
    - `measured` → "~total" e "X de estrada + ~Y em N paradas";
    - `measuring` → "X de estrada" e "Tempo nas paradas ainda sendo medido";
    - ausente → "X de estrada".
  - Último trecho: `depot` → "Inclui a volta"; `address` → "Inclui o trecho até o término".
  - Paradas fora: "N paradas fora da conta".
  - CSS: as classes novas usam só `var(--…)`. O aceite verificável é
    `test/driver-trip/route-summary-tokens.contract.ts` (novo, CA17): lê o `.module.css` e reprova
    `#`, `rgb(`, `hsl(` e `px` fora de `0`/`1px` nas classes novas.
  - Contratos antes, cobrindo as variantes do § Preview e a viagem única.
- [ ] **T2.5** Seletor (RF16), com contrato em `trip-selection.contract.ts`.
- [ ] **T2.6** Smoke.
  - O fixture ganha `route`/`stopTime`, e entra um CA novo em `driver-app.smoke.spec.ts`: quadro com e
    sem rota, 375 px sem rolagem horizontal, boot sem rede.
  - Antes de mexer no CA12 da 189 (`:562-608`), rodá-lo. Ele casa por substring e provavelmente
    passa. Só ajustar se quebrar, sem afrouxar.
  - Rodar `bun run --cwd apps/frontend-driver smoke` em primeiro plano, e depois o `check`.

## Fase 3 — Preview, design, docs e publicação da app

> 🤖 Modelo: `sonnet` (T3.5 é `opus`)

- [ ] **T3.1** API de demonstração.
  - O arquivo é `apps/frontend-driver/scripts/driver-preview-api.ts`, **depois da T5.0 da 196**.
    Antes dela, é o do scratchpad apontado pelo `.claude/launch.json` (`motorista-api-demo`).
  - **A** (`GCQ8E47`): 3 paradas e **6 notas** (2 entregues, 1 devolvida, 3 pendentes → 50%).
    - `route`: `distanceMeters: 38600`, `durationSeconds: 4320`, `lastLegDistanceMeters: 9400`,
      `lastLegDurationSeconds: 1080`, `excludedStopCount: 0`.
    - Origem: `depot`, com `name` "Transportes Exemplo" e `address` "Rua do Galpão, 10 · Centro ·
      São Paulo/SP · 01000-000".
    - Fim: `{ kind: 'depot' }`.
    - `stopTime`: `measured`, com `estimatedSeconds: 2400` e `stopCount: 3`.
  - **B** (`DKT4F19`, nova): 3 paradas, uma delas excluída.
    - `route`: `12400` m, `1860` s, último trecho `0`/`0`, `excludedStopCount: 1`.
    - Origem: `first_stop`; fim: `last_stop`.
    - `stopTime`: `{ status: 'measuring', stopCount: 3 }`.
  - **C** (`FXY2B31`): `route: null`, `stopTime: null`.
  - `?legacy=1` devolve as viagens sem `route` nem `stopTime`.
  - `?end=address` troca o fim de A para `address`.
- [ ] **T3.2** 👤 **Preview local antes de staging.**
  - Subir `motorista-api-demo` (53901) e `motorista-local` (53200).
  - Tirar prints em **375 e 768 px**:
    - o seletor com as três viagens;
    - o cabeçalho de A (duração total);
    - B (sem barracão, "ainda sendo medido", parada fora);
    - A com `?end=address`;
    - C (sem roteiro);
    - o modo `legacy`;
    - a viagem única.
  - O usuário vê e diz **"pode subir"**. Anotar no `evidence.md` (CA12).
- [ ] **T3.3** Revisão de design (web.md §15), contra `DriverManifestCard`, os cartões e o botão
      atual do seletor. Conferir contraste nos dois estados, 44 px, quebra em 375 px, leitor de tela
      e tokens. Achado vai corrigido na mesma task ou vira pendência explícita.
- [ ] **T3.4** Documentação viva, com prettier nos `.md`:
  - `apps/frontend-driver/CLAUDE.md`;
  - `apps/api-transportada/CLAUDE.md` e `docs/ai-context/*.md`: `route` e `stopTime`, `endKind` e
    `excludedStopIds` no jsonb, tempo de parada sem motorista;
  - `docs/SECURITY.md`: nome e endereço fiscal da empresa no snapshot, e a meia linha sobre ME.
- [ ] **T3.5** Revisão final com `code-reviewer` (`opus`) e auditoria do `code-standart.md` §15: N+1,
      jsonb sem `points`, logs sem PII, 500 sem stack.
- [ ] **T3.6** Publicar a app em staging, **só depois da T3.2**.

## Fase 4 — Painel: a porcentagem por nota (Q2)

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** Emenda à 079 e contrato do painel (RF19, CA18).
  - Acrescentar a `specs/079-a-viagem-se-acompanha-pela-tela/spec.md` a nota "Emenda (spec 198,
    2026-09-25)": a porcentagem conta notas entregues e devolvidas sobre o total, com piso; o ritmo
    da previsão continua por parada.
  - Contrato antes, em `apps/frontend-transportada/test/trip/progress.contract.ts`, com a mesma
    tabela do CA06 da app. As asserções de hoje (`completedStops`, rascunho sem progresso, previsão)
    continuam.
  - `resolveTripProgress` recebe `documents` (o conjunto da premissa 9), e o `TripDetail` passa
    `trip.documents`. **Nota liberada (`released_at`) não conta**, com um caso na tabela do contrato,
    igual à app.
- [ ] **T4.2** Exibir a porcentagem (RF20). `TripProcessFlow` ganha "N% da viagem · X de Y notas
      resolvidas" junto da previsão, com chaves pt-BR e en e contrato do serviço/visão.
- [ ] **T4.3** 👤 Preview do painel.
  - Print do detalhe de uma viagem em curso em 1280 e 375 px (`painel-local` ou `painel-worktree`
    do `.claude/launch.json`).
  - Revisão de design contra o `TripProcessFlow`.
  - O "pode subir" do usuário vai para o `evidence.md`.
- [ ] **T4.4** Publicar o painel em staging, só depois da T4.3.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/198-a-viagem-diz-seu-tamanho-e-quanto-ja-foi/ (leia
spec.md, plan.md, tasks.md e docs/adr/0083-a-viagem-diz-seu-tamanho-e-quanto-ja-foi.md antes de
começar; leia também apps/frontend-driver/CLAUDE.md e a seção "Viagem (trips)" de
apps/api-transportada/CLAUDE.md). Uma task por vez, na ordem do tasks.md.
BASE: só comece se work/driver-app já estiver em origin/staging (T0.1); senão pare e avise. Branch
na própria árvore: git switch -c work/spec-198 origin/staging. Nada de make worktree nem git stash.
Modelos: Fase 0 → opus · Fase 1 → executor model=sonnet (T1.2 e T1.5 🧠 → opus, validadas por
architect opus antes) · Fase 2 → executor model=sonnet (T2.2 → haiku) · Fase 3 → executor
model=sonnet (T3.5 → code-reviewer opus) · Fase 4 → executor model=sonnet.
Cada task: contrato/teste antes (visto vermelho), typecheck + lint + testes da app; na API os DOIS
comandos (bun --env-file=../../.env.test test --timeout 120000 e
bun --env-file=../../.env.test run test:integration); suíte nova no entrypoint; evidência em
evidence.md; commit isolado com --no-verify e caminhos explícitos.
PROIBIDO: tocar listStops/toDriverStop (outra sessão corrige a coordenada); migration fora do índice
condicional da T1.6; editar arquivos de spec irmã (192/193/196/197), salvo a emenda da 079 na T4.1.
REGRA DO USUÁRIO: tela nova roda primeiro no PREVIEW — motorista-local 53200 + motorista-api-demo
53901 (apps/frontend-driver/scripts/driver-preview-api.ts depois da T5.0 da 196; antes, o do
scratchpad do .claude/launch.json) e o painel local — com prints 375 e 768 (painel 1280 e 375), e só
sobe depois do "pode subir". Ordem de deploy: API (T1.7) → app (T3.6) → painel (T4.4).
Tempo de parada: nunca por motorista, nunca na nota dele (ADR-0070); sem amostra, "ainda sendo
medido", nunca os 600 s padrão.
Publicar: git fetch && git rebase origin/staging && bun install --frozen-lockfile && gates && push,
com o cruzamento git diff --name-only origin/staging...HEAD × tabela de convivência anotado.
Pare e pergunte antes de: deploy em produção, migration fora da exceção, divergência das premissas
da T0.1 (base, estado otimista, distribuição do piso/teto), qualquer [NEEDS CLARIFICATION].
```
