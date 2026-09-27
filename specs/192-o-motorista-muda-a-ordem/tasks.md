# Tasks — Spec 192

**👤 = ação humana.** O executor para, descreve o passo exato, espera o "feito" e confere o efeito.
**🧠 = task que sobe para `opus`** dentro de uma fase mais barata.

## Regras que valem para todas as tasks

Toda task de comportamento começa pelo contrato ou pelo teste, **visto vermelho**, e fecha com:

- `bun run typecheck`, `bun run lint` e os testes da app tocada;
- na API, os **dois** comandos, rodados de dentro de `apps/api-transportada`:
  - `bun --env-file=../../.env.test test --timeout 120000`;
  - `bun --env-file=../../.env.test run test:integration`, sempre que a task tocar query, repositório
    ou `test/integration/**`. Sem o `--env-file` a integração **pula**, e pular não é passar;
- no worker, `make worker-integration`, com a contagem de testes **executados** (não pulados) no
  `evidence.md`;
- teste novo registrado no entrypoint da área, na lista do `package.json` da app e, na API, em
  `test/test-registry/declaration.contract.ts`;
- evidência no `evidence.md`: comando, contagem e trecho;
- commit isolado, com `--no-verify` e caminhos explícitos.

**Migration:** existe uma só, a T1.1. Ela é aditiva, vem com `rollback.sql` e fecha com
`make migration-test` e `db:generate` = `no_changes`. Confira o timestamp contra `origin/staging`
(193, 195 e 196 também criam migration).

**Tela:** toda tela nova ou mudada roda primeiro no preview local (T5.1) e só sobe depois de o usuário
ver.

**Publicação:** API e worker sobem depois dos gates, na ordem de `spec.md` § "Interseções".

## Fase 0 — ADR, premissas e tolerância do painel

> 🤖 Modelo: `opus` (T0.2 é `sonnet`)

- [ ] **T0.1** Conferir a ADR-0077 contra o código e passá-la a `aceita`, sem mudar decisão.
  - Conferir as cinco premissas de `plan.md` § "Contexto e premissas".
  - Conferir o estado da 196, da 198 e da 197 em `origin/staging`.
  - Confirmar que 192 e 0077 continuam livres:
    `git fetch && git log --all --oneline -- 'specs/192*' 'docs/adr/0077*'`.
  - Anotar arquivo:linha de cada premissa. Se alguma divergir, pare e pergunte.
- [ ] **T0.2** Painel tolerante (RF10), depois de um rebase sobre a mudança da 179 T304.
  - `stopOrderVersion` entra em `TRIP_DETAIL_OPTIONAL_KEYS` (`trip.constant.ts:300`).
  - O item de tipo conhecido passa a exigir as chaves obrigatórias e ignorar as extras
    (`tripResponse.validation.ts:1276-1277`).
  - O tipo desconhecido é descartado (:898-906, :1285).
  - Contratos:
    - o detalhe com `stopOrderVersion` passa;
    - um item conhecido com `stopOrder`/`location`/`locationState` extra passa;
    - uma lista com um `kind` desconhecido entre dois conhecidos devolve os dois conhecidos;
    - a resposta do `PATCH` segue validada por `reorderTripStopsResultFromApi` (:790-792), sem
      mudança.
  - **É o primeiro push da spec.** Não muda tela.

## Fase 1 — Dados, trava, planta e domínio

> 🤖 Modelo: `opus`

- [ ] **T1.1** 🧠 Migration `<ts>_driver_stop_order`, conforme `plan.md` § "Dados".
  - Tabelas: `trips.stop_order_version`, `trip_stop_order_events` (com o carimbo da ADR-0081 e
    `channel`), `trip_stop_order_outcomes` e `trip_loaded_cargo_layouts`.
  - Schemas Drizzle da API e o espelho no worker.
  - Se a 196 estiver em staging, a tabela entra em `TRIP_LOCATION_STAMPED_TABLES` e o redator vai para
    o worker.
  - Testes de migration:
    - o trigger recusa `DELETE` e recusa `UPDATE` de qualquer coluna fora do expurgo;
    - o trigger **aceita** o `UPDATE` do expurgo (posição para `NULL`, `captured → expired`);
    - os CHECKs recusam valor fora do vocabulário;
    - o `rollback.sql` volta ao estado anterior.
- [ ] **T1.2** 🧠 `unload-blocking.policy.ts` (ADR-0077 §8). **Aceite numérico:**
  - Fixture de 4 caixas (baú 4 m, porta em x = 4). Caixa A da parada 1 em x 0–1, y 0–1, z 0–1.
    - Caixa B da parada 2 em x 1–2, y 0–1, z 0–1: cobre A por (b).
    - Caixa C da parada 3 em x 0–1, y 0–1, z 1–2: cobre A por (a).
    - Caixa D da parada 4 em x 1–2, y 1.2–2, z 0–1: **não** cobre A.
    - A matriz tem exatamente 2 pares.
  - Mesma fixture:
    - `open` dá 0 pares;
    - `rear_and_side` com a parada 1 `sideReachable` dá 1 par (só C).
  - Ordem 1, 2, 3: parada 1 bloqueada por {2, 3}. Ordem 2, 3, 1: nenhuma.
  - Com a nota de B `returned` e a parada 2 concluída, B bloqueia 1 como depósito. Com a nota de B
    `delivered`, não bloqueia.
  - `resolveAddedBlockedStops` da ordem 1, 2, 3 para a própria 1, 2, 3 dá vazio.
  - Duas paradas no mesmo endereço (197), com pernas de 0 m, não quebram nada.
  - Fixture real `real-mixed-cargo`: toda caixa com `coversStops: [s]` aparece na matriz cobrindo uma
    nota da parada `s` (recall de 100 % sobre as marcas da 148 D5).
  - Tempo com ~1.400 caixas: `buildCoverMatrix` ≤ 2 s e `resolveBlockedStops` ≤ 5 ms, anotados.
- [ ] **T1.3** 🧠 Cópia fixada (RF7).
  - `pin-loaded-cargo-layout.service.ts` roda em `dispatch()`, depois de `releaseUnloadedDocuments`.
  - O worker fixa quando a planta fica `ready`.
  - Na primeira reordenação, fixa com `first_reorder`.
  - `readTripDetail` e o gatilho eager leem a cópia (filtrada e remapeada) e não enfileiram.
  - Integração:
    - despachar fixa (`dispatch`);
    - CA10;
    - **CA11 (despacho forçado com nota deixada para trás)**;
    - **CA12 (planta `queued` fixada pelo worker)**;
    - o expurgo de `trip_cargo_layouts` não afeta a cópia.
- [ ] **T1.4** 🧠 Trava e versão.
  - `lockTripForStopOrder` trava `trip_stops FOR UPDATE ORDER BY id` e depois
    `trips FOR NO KEY UPDATE`. Escritório, motorista e reentrega usam a mesma trava (a reentrega hoje
    trava `trips` primeiro).
  - `writeStopOrder` sobe a versão.
  - O `PATCH` do escritório ganha `expectedStopOrderVersion?` e evento `backoffice`.
  - O adaptador `createTripStopOrderWriter` passa a levar o ator (`source = route_suggestion`).
  - A reentrega grava `source = redelivery`.
  - A repetição por `40P01`/`40001` é limitada.
  - Integração:
    - CA05;
    - **CA06 (chegada concorrente com reorder, duas conexões)**;
    - o aceite de sugestão e a reentrega sobem a versão e gravam evento;
    - o escritório continua recusado depois do despacho.

## Fase 2 — API do motorista

> 🤖 Modelo: `opus` (T2.4 e T2.5 podem ir a `sonnet`, validadas por `architect`)

- [ ] **T2.1** 🧠 Fase 1 da reordenação: `reorder-field-stops.use-case.ts`.
  - Checagens na ordem do RF3: posse, estado, conjunto (parada com chegada e sem conclusão entra),
    mesma ordem, versão e bloqueios novos contra a cópia.
  - Exige a confirmação exata.
  - Grava ordem, versão e evento sob a trava.
  - Integração: CA01, CA03, CA04, CA07 (parte "mesma ordem"), CA08 e CA09.
- [ ] **T2.2** 🧠 Fase 2: `complete-stop-order-outcome.service.ts`.
  - Congelador com `keepPreviousOnUnavailable` e `criterion` reproduzido.
  - ETA das não concluídas e âncora em agora.
  - Pernas.
  - Tudo em compare-and-set por versão, com o desfecho em `trip_stop_order_outcomes`.
  - Integração:
    - **CA13 (`no_toll` continua `no_toll`; OSRM fora mantém a rota e a distância nova é nula)**;
    - **CA14 (versão velha nunca sobrescreve)**;
    - **CA15 (ETA, portal, e reordenar em `dispatched` seguido de "Iniciar rota" não desloca)**;
    - CA16.
  - Conferir com a 198: o congelamento grava `depot.endKind` se ela já estiver em staging.
- [ ] **T2.3** 🧠 Rota `PUT /me/trips/current/stop-order`.
  - Schema `.strict()` com `location?`; ledger `stop_order` com `recall` do estado atual; erros e
    códigos do RF2.
  - Contratos:
    - formato;
    - chave ausente dá `400`;
    - **CA07** (mesma chave, mesma resposta, um evento);
    - `TRIP_FIELD_REPORT_KEY_REUSED`;
    - negativos de CA02;
    - `location` só pelo `locationSchema`.
  - Expor ao snapshot se o desfecho mais recente é `kept_previous`, para a RF9 da 198.
- [ ] **T2.4** `GET /me/trips/current` (RF8).
  - Campos aditivos.
  - `cargoBlockedBy` calculado da matriz, O(pares).
  - Contrato de formato e integração com uma parada `fromLoading` e outra `fromOrderChange`.
  - **Medir o CA17** (p95 ≤ 50 ms a mais com ~1.400 caixas) e anotar.
- [ ] **T2.5** Linha do tempo (RF9).
  - Oitava consulta.
  - `trip.stops_reordered` com `stopOrder`; os outros tipos com `stopOrder: null`.
  - Integração: canais `driver_app` e `backoffice`; paginação por cursor intacta.

## Fase 3 — App do motorista

> 🤖 Modelo: `sonnet`

Antes da T3.1, conferir `DriverStopCard.component.tsx` (798 linhas), `DriverTripWorkspace.page.tsx`
e `useDriverTrip.hook.ts` contra `origin/staging`. As specs 179, 193, 195, 196 e 198 mexem ali.

- [ ] **T3.1** Editor de ordem.
  - `@dnd-kit/*`.
  - `driverStopOrder.service.ts`, puro.
  - `DriverStopOrderEditor.component.tsx`:
    - `PointerSensor` **e** `KeyboardSensor` + `sortableKeyboardCoordinates`;
    - alça com `touch-action: none`;
    - botões ↑/↓ de 44 px;
    - concluídas fixas;
    - anúncios traduzidos.
  - `'stop-order'` no `captureRegistry`.
  - Contratos:
    - o serviço;
    - o texto-fonte tem `KeyboardSensor`;
    - o `captureRegistry`;
    - o `touch-target` continua verde.
- [ ] **T3.2** Salvar (RF15–RF17).
  - `PUT` direto, com a chave e o `location?` (se a 196 estiver em staging).
  - `DriverCargoBlockingDialog`.
  - Confirmar reenvia com chave nova.
  - Versão, conjunto e concorrência descartam o rascunho e recarregam.
  - Botão desabilitado sem rede ou com `getDrainable() > 0`.
  - Validação aditiva dos campos novos.
  - Contratos: CA21 e CA22.
- [ ] **T3.3** Selo "Carga atrás da Parada N" (RF18), a partir de `fromOrderChange`. Contrato de texto
      e de snapshot.
- [ ] **T3.4** Preview e smoke.
  - Estender a API de demonstração (ver T5.1) com o `PUT`: a primeira tentativa do cenário devolve
    `409 STOP_ORDER_BLOCKS_CARGO`.
  - Levar os campos novos ao `GET`.
  - No `driver-app.smoke.spec.ts`, cobrir ↑/↓, teclado, aviso e 44 px em 375 px (CA20).

## Fase 4 — Painel

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** Linha do tempo e planta (RF11, RF12).
  - Tipo e `case` no título.
  - Detalhe "de → para", com bloqueios confirmados, diferença de distância e pedágio, e "rota não
    recalculada".
  - Selo "marcas da ordem do carregamento".
  - Locales.
  - Contrato do título e do detalhe (CA19).

## Fase 5 — Revisão de design, documentação e publicação

> 🤖 Modelo: `sonnet` (T5.3 é `opus`)

- [ ] **T5.1** 👤 **Preview local antes de staging.**
  - Subir `motorista-api-demo` (53901) e `motorista-local` (53200) de `.claude/launch.json`.
  - A API de demonstração fica fora do repositório, em
    `/private/tmp/claude-502/-Users-anderson-filho-Documents-personal-transportada--claude-worktrees-pensive-borg-f59971/bb453e02-a58a-48b5-833a-3401376ec42e/scratchpad/driver-preview-api.ts`.
    Se sumiu, recriar no scratchpad da sessão:
    - `Bun.serve` na 53901;
    - fixture de `GET /me/trips/current`;
    - as rotas desta spec;
    - proxy para o resto.
      Depois, apontar o `launch.json` para ela.
  - Prints em 375 e 768: modo de ordem, aviso, selo, botão desabilitado; no painel, a linha do tempo.
  - Revisão de design e usabilidade (tokens, contraste, alvo, foco, texto), com os achados corrigidos.
  - **O usuário vê e diz "pode subir".** Anotar no `evidence.md` (CA23).
- [ ] **T5.2** Documentação viva.
  - `apps/frontend-driver/CLAUDE.md`: modo de ordem, `'stop-order'`, sem rede e com fila.
  - `apps/frontend-transportada/CLAUDE.md`: tolerância do validador, tipo novo, marcas do
    carregamento.
  - `apps/api-transportada/CLAUDE.md` e `docs/ai-context/*.md`: trava única, duas fases, cópia da
    planta, versão.
  - Prettier nos `.md`.
- [ ] **T5.3** Revisão final.
  - `code-reviewer` (`opus`) na spec inteira.
  - `security-reviewer` em posse, idempotência e carimbo.
  - Auditoria do `code-standart.md` §15: N+1 na matriz e na linha do tempo, `Set`/`Map`, logs sem PII,
    500 sem stack.
- [ ] **T5.4** Publicação em staging, na ordem:
  1. T0.2;
  2. Fases 1–2 (API e worker);
  3. Fase 3 e T4.1, **só depois da T5.1**.

  Em cada push: `git fetch && git rebase origin/staging && bun install --frozen-lockfile`, depois os
  gates, `make migration-test` e o push, encadeados com `&&`. Produção fica fora.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/192-o-motorista-muda-a-ordem/ (leia spec.md — inclusive
"Interseções" —, plan.md, tasks.md e docs/adr/0077-a-ordem-muda-na-rua.md antes de começar; leia também
apps/frontend-driver/CLAUDE.md, a seção de trip/routing de apps/frontend-transportada/CLAUDE.md e as
specs 196 e 198). Uma task por vez, na ordem do tasks.md.
Árvore própria (make worktree NAME=spec-192; se a sessão já estiver num worktree do Claude, branch própria
nesta árvore) — nada de git stash.
Modelos: Fase 0 → opus (T0.2 → executor model=sonnet) · Fase 1 → opus (T1.1–T1.4 🧠) ·
Fase 2 → opus (T2.4 e T2.5 → executor model=sonnet, validados por architect opus) ·
Fase 3 → executor model=sonnet · Fase 4 → executor model=sonnet · Fase 5 → sonnet
(T5.3 → code-reviewer e security-reviewer model=opus).
Cada task: teste antes (visto vermelho), typecheck + lint + testes; na API os DOIS comandos (contrato e
test:integration com --env-file=../../.env.test); no worker make worker-integration com a contagem de
testes executados; teste novo registrado no entrypoint, no package.json e no test-registry; evidência em
evidence.md; commit isolado com --no-verify e caminhos explícitos. A T1.1 fecha com rollback.sql,
make migration-test e db:generate = no_changes.
REGRA DO USUÁRIO: toda mudança de tela roda primeiro no PREVIEW local — motorista-local na 53200 com
motorista-api-demo na 53901 (.claude/launch.json; o arquivo está no scratchpad e, se sumiu, recrie
conforme a T5.1) —, com prints 375 e 768, e só sobe para staging depois de o usuário ver e aprovar.
API/worker sobem após os gates, na ordem: T0.2 → API → app/painel.
Publicar: git fetch && git rebase origin/staging && bun install --frozen-lockfile && gates && push,
conferindo migration contra origin/staging (193, 195, 196).
Pare e pergunte antes de: deploy em produção, migration destrutiva, divergência das premissas da T0.1,
qualquer [NEEDS CLARIFICATION].
```
