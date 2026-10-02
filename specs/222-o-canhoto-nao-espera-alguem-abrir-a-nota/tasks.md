# Tasks

Uma task por vez, na ordem. Teste de aceite/contrato **antes** da implementação. Task só fecha com
evidência em `evidence.md` e commit isolado.

⚠️ Arquivo de teste novo entra na **lista explícita** do `package.json` da app — senão não roda.
⚠️ Teste de integração da API é **outro comando**: `bun --env-file=../../.env.test run test:integration`
de dentro de `apps/api-transportada`. Sem o `--env-file` ele **pula** em vez de falhar.
⚠️ `TripStateActions.component.tsx`, `trip.locale.json` e `main.ts` do worker são disputados por
outras sessões: `git fetch && git rebase origin/staging` antes das Fases 2, 5 e 6.
⚠️ A numeração de spec, ADR e migration colide com outras sessões: confira em `origin/staging` antes
de criar o arquivo (esta spec nasceu como 222 e o ADR como 0091 — confira os dois).

As Fases 1 e 2 entregam o maço e **não dependem** do resto: elas podem ir a staging antes de a
rotina existir. A Fase 4 é o portão do Grupo B — se o decodificador não fechar, as Fases 5 e 6 não
começam.

---

## Fase 1 — A viagem entrega seus comprovantes de uma vez

> 🤖 Modelo: `sonnet`

- [x] T1.1 Ler `read-delivery-proof.use-case.ts` inteiro e registrar em `evidence.md` como a URL
      assinada é produzida (HMAC local ou chamada ao storage) — é o que decide se a rota em lote
      assina original + miniatura ou só a miniatura (plan.md § "Grupo A — maço (API)")
- [x] T1.2 Contrato da rota em lote **antes da implementação**: `GET /trips/:id/delivery-proofs`
      responde 200 com `documentId` em cada item, `fleet.read` basta, `trip.manage` não é exigido,
      e `?documentIds=` filtra com teto (CA01) — `apps/api-transportada/test/`
- [x] T1.3 Porta própria `ReadTripDeliveryProofsPort` (não `findByTrip` no port de uma nota, que
      quebraria o typecheck dos dublês existentes) e o Drizzle filtrando por
      `companyId` + `tripId` (nunca por payload)
- [x] T1.4 `readDeliveryProofsByTrip` ao lado do que existe, sem tocar no caminho de uma nota
- [x] T1.5 Rota em `trip.routes.ts` com `TRIP_FIELD_READ_POLICY`, serialização com `documentId`
- [x] T1.6 Integração sobre viagem semeada: três comprovantes de três notas numa chamada
      (`test/integration/*.integration.ts` + comando do aviso acima)

## Fase 2 — O maço confere o canhoto

> 🤖 Modelo: `sonnet`

- [x] T2.1 [P] Contrato de `canhotoBatchSelection.service.ts` **antes da função**: da seleção +
      comprovantes sai `eligible` (canhoto `pending`), `excluded` (contagem) e os itens do diálogo;
      nota sem comprovante, comprovante que não é canhoto e canhoto já conferido ficam de fora
      (CA02, CA03)
- [x] T2.2 A função pura `shared/canhotoBatchSelection.service.ts`
- [x] T2.3 [P] Contrato do lote no cliente: `canhotoReviewProof` por item, 409 vira `conflicted`
      (não falha), falha de rede remarca só o que falhou e relata "1 de 5" (CA07, CA08).
      ⚠️ **Reaproveitar, não reinventar**: `runFieldActionQueue`
      (`shared/tripFieldActionQueue.service.ts`, `concurrency: 3`) já devolve `{errorCode, item,
value}` por item e isola a falha; `batchFieldReturnMutation`
      (`useTripWorkspace.hook.ts:861`) é o molde da mutation. E o código do 409 já existe:
      `CANHOTO_REVIEW_ALREADY_RESOLVED_CODE` em `shared/trip.constant.ts:69` — importar, nunca
      redeclarar (§16)
- [ ] T2.4 `useTripDeliveryProofs.query.ts`, `enabled` só com `trip.manage` **e** seleção não vazia
      — o detalhe da viagem não passa a buscar comprovante de graça (plan.md § frontend)
- [ ] T2.5 `approveCanhotoBatch` em `useTripWorkspace.hook.ts`, devolvendo
      `{ approved, conflicted, failed }` e invalidando a consulta da viagem
- [ ] T2.6 `TripCanhotoBatchDialog.component.tsx`: grid com `ProofImage`, número e série da nota, a
      leitura automática quando houver, caixa marcada por item, rótulo com a contagem (CA05, CA06).
      Molde de diálogo: `TripReturnReasonDialog.component.tsx` — `createPortal` + `useModalDialog`,
      classes `styles.mdfeGateOverlay` / `styles.mdfeGateDialog`, `aria-modal` e `aria-labelledby`.
      Nenhuma biblioteca de modal nova
- [ ] T2.7 Item cuja imagem não carregou nasce **desmarcado**, com aviso — a tela não aprova o que
      não mostrou (RF-A8, CA09). O gancho é o `onError` que o `ProofImage` já tem
- [ ] T2.8 Botão no maço em `TripStateActions.component.tsx`, no molde de `batchFieldDelivery`, com
      o aviso de exclusão reaproveitando a contagem da T2.2 (CA02–CA04)
- [ ] T2.9 Textos em `trip.locale.json` (`stateActions.batchCanhoto*`, `deliveryProof.canhotoBatch.*`)
- [ ] T2.10 Revisão de design e usabilidade do diálogo (`web.md` §15): teto de itens, foco no
      diálogo, leitura por teclado, e **print ao usuário** antes de fechar a fase

## Fase 3 — O robô tem porta própria

> 🤖 Modelo: `sonnet`. **T3.1 e T3.2 já foram feitas e validadas pelo `architect`** em 2026-10-01 —
> o ADR-0091 está escrito e o nome da permissão está decidido. Quem executa a fase lê o ADR e
> implementa; não reabra as duas decisões.

- [x] T3.1 🧠 ADR-0091 — "o canhoto é lido sem ninguém abrir a viagem". Escrito e corrigido depois
      da revisão: §1 diz a garantia **real** (não aprova leitura divergente, nunca `rejected`, mas
      aprova o que não leu se souber o número certo), §7 decide a trilha por comprovante e §8 a
      regra de parada
- [x] T3.2 🧠 Permissão: **`trip.canhoto-auto-review`**. Prefixo `trip` porque `canhoto` não é
      domínio; sufixo `-review` porque `.read` significa ver em todo o catálogo
- [ ] T3.3 Contrato **antes da rota**: a rota do robô aceita o token da automação, recusa token de
      gente com `trip.manage`, o schema recusa `action` no corpo, e `isGrantablePermission` recusa a
      permissão a grupo e a concessão avulsa (CA13, CA16)
- [ ] T3.4 A permissão em **três** lugares: catálogo, papel `automation` e `SERVICE_ONLY_PERMISSIONS`
      (`authorization.policy.ts:366`). ⚠️ São oito arquivos no total, e três comparam listas por
      igualdade exata — a lista está no plan.md § "Grupo B". Sem a entrada em
      `SERVICE_ONLY_PERMISSIONS`, quem tem `groups.manage` concede a porta do robô a uma pessoa
- [ ] T3.5 A rota `PATCH .../proof/review/automatic` em `canhoto-review.routes.ts`, no **mesmo**
      caso de uso, com **schema próprio**: os quatro campos de leitura `nullable()` e
      **obrigatórios**, nunca `optional()` (com `exactOptionalPropertyTypes` o ausente chega
      `undefined` e `assertReadingIsConsistent` compara contra `null`). A rota de gente não muda
- [ ] T3.6 O caminho do robô grava `audit_logs` por comprovante (ação
      `trip.canhoto-review.automatic`, ator = usuário do serviço, sem PII) — hoje
      `reviewCanhotoProof` **pula** `insertAudit` quando a ação é automática, e é essa linha que
      muda, só para o canal do robô (RF-B10, CA19)
- [ ] T3.7 Integração: veredito, leitura e trilha gravados; sobre veredito humano devolve
      `unchanged` (CA10, CA12, CA19)

## Fase 4 — Portão: dá para decodificar imagem no servidor?

> 🤖 Modelo: `opus` 🧠 — é decisão de dependência e de arquitetura (`code-standart.md` §13).
> **O portão já foi aberto em 2026-10-01: T4.1 e T4.2 estão feitas e o veredito é verde.** Resta a
> T4.3, que é a instalação.

- [x] T4.1 🧠 Spike medido, em `spike-decodificador.md`: `@jsquash` em `worker_thread` lê uma foto de
      12,2 MP em 101 ms (JPEG), 179 ms (PNG) e 312 ms (WebP), casando a chave exata, inclusive sob
      `bun build --target=bun --packages=external`. `sharp` saiu ~1,8x mais rápido em 4,3 MP no
      processo principal e não foi medido no worker
- [x] T4.2 Decisão no ADR-0091 §4: **`@jsquash`**, porque o critério é não pendurar binário nativo
      por plataforma no caminho do `--frozen-lockfile`, não velocidade. Teto de 8 MB conferido
      **antes do download**, pelo tamanho gravado em `stored_objects`
- [ ] T4.3 `bun add` da escolhida no `apps/worker-transportada` + `bun install --frozen-lockfile` na
      raiz, com `make check` limpo

## Fase 5 — A rotina entra no relógio

> 🤖 Modelo: `sonnet` (fase com migration — `make migration-test` fecha a T5.4)

- [ ] T5.1 [P] `trip.canhoto.read` nas **quatro** cópias do catálogo (cron, worker, API, frontend)
      com os `failureOutcomes` do plan.md e `minimumIntervalSeconds: JOB_TICK_INTERVAL_SECONDS`
- [ ] T5.2 [P] Paridade nos quatro `job-catalog` contracts. ⚠️ O contrato da API lê o SQL das
      migrations de uma lista fixa (`SEED_MIGRATIONS` em
      `apps/api-transportada/test/job-catalog/catalog.contract.ts:137`) e exige
      `Object.keys(seeded) === SCHEDULED_JOBS`: a migration da T5.3 **tem** de entrar nessa lista,
      ou o contrato reprova sem dizer por quê
- [ ] T5.3 Migration no molde de `drizzle/20260915233000_rate_limit_windows/migration.sql`:
      recria `job_executions_job_check` e `job_schedules_job_check` com o nome novo
      (DROP → ADD NOT VALID → VALIDATE) e insere a linha em `job_schedules`
- [ ] T5.3b Na **mesma** migration, a coluna `canhoto_read_attempted_at` (`timestamptz` anulável,
      sem backfill — nulo é "a máquina ainda não tentou", RF-B9) e o índice parcial da varredura
      (`trip_delivery_proofs_canhoto_pending_idx`), os dois declarados também no `trip.schema.ts`.
      ⚠️ O SQL está no plan.md § "Dados, migration e rollback" e **não** é o que estava aqui antes:
      chave `(created_at)` sozinha, `kind` **fora** do predicado, e os conjuntos como literais. As
      três decisões vêm de três jeitos de o índice ser ignorado em silêncio — leia o porquê antes de
      escrever a DDL
- [ ] T5.4 `rollback.sql` na ordem inversa + `make migration-test` verde
- [ ] T5.5 `db:generate` precisa dizer `no_changes` depois da migration à mão — se divergir, o
      schema e a migration não casam

## Fase 6 — A rotina lê o canhoto

> 🤖 Modelo: `sonnet`

- [ ] T6.1 [P] Contrato da régua da chave de acesso no worker **antes da cópia**: formato, DV mód.
      11, modelo 55, e casamento contra as notas da viagem — sobre as **mesmas** chaves de
      `apps/frontend-transportada/test/fixtures/canhotoBarcodeFrame.fixture.ts`
- [ ] T6.2 `domain/canhoto-barcode.policy.ts` (cópia por valor, com a razão no cabeçalho) e
      `domain/canhoto-read.constant.ts` (teto de lote, de ciclo, de bytes, orçamento de ms)
- [ ] T6.3 [P] Consulta dos pendentes: `kind='photo'`, `canhoto_review='pending'`,
      `canhoto_read_source IS NULL`, `canhoto_read_attempted_at IS NULL`, empresa ativa, **viagem
      não cancelada e nota não liberada**, `ORDER BY created_at LIMIT <teto>`, com os conjuntos do
      predicado como **literais SQL** (não `eq()` com valor de JS, ou o índice parcial é ignorado).
      ⚠️ `trip_delivery_proofs` **não tem** `trip_id` nem `document_id`: `tripId` e `documentId` vêm
      de dois joins (`stop_event_id` → `trip_stop_events.trip_document_id` → `trip_documents`), e
      são eles, não a varredura, que dominam o custo. Fecha com `EXPLAIN` mostrando `Index Scan`
      sobre `trip_delivery_proofs_canhoto_pending_idx` — colado no `evidence.md` (CA20)
- [ ] T6.4 Decodificador + `worker_thread` (ADR-0053), com o teto de 8 MB conferido **antes de
      baixar** (pelo tamanho gravado em `stored_objects`, não depois do download) e contrato sobre um
      **JPEG realista** commitado — barra sólida, fundo levemente granulado, gerado no teste.
      ⚠️ Fixture chapado esconde o caso ruim e fixture com ruído dentro da barra inventa um defeito
      que não existe: foi o que aconteceu no spike (`spike-decodificador.md` § "Um achado")
- [ ] T6.5 Gateway autenticado, decalque de `automatic-manifest-api.gateway.ts` (token em cache com
      margem, `x-company-id`), chamando a rota da Fase 3
- [ ] T6.6 Contrato do laço **antes da rotina**: teto de lote, teto de ciclo, `isStopRequested()`,
      falha de um comprovante contada sem derrubar o resto (CA14), e a **regra de parada** — leitura
      que terminou sem código grava `canhoto_read_attempted_at`; falha de infraestrutura e 4xx
      **não** gravam, e 4xx/401/403 vão para o Sentry (RF-B8, RF-B9)
- [ ] T6.7 `application/canhoto-read.routine.ts` e a ligação em `main.ts` do worker
- [ ] T6.8 Contrato de log: o ciclo emite id e contagem, nunca nome, documento ou bytes (CA15)
- [ ] T6.9 Integração do ciclo: doze pendentes, os que casam ficam `approved` com origem
      `automatic`, os que não casam ficam `pending` **com o número lido**, nenhum `rejected`; e o
      segundo ciclo não toca em nada (CA10, CA11)
- [ ] T6.10 Integração da convergência: canhoto **sem** código de barras é lido uma vez, grava
      `canhoto_read_attempted_at`, e no segundo ciclo **não é baixado** (CA17). Sem esta prova, o
      caso comum do escritório seria redecodificado a cada cinco minutos para sempre

## Fase 7 — Fechamento

> 🤖 Modelo: `haiku` (T7.3 é `opus`)

- [ ] T7.1 [P] `docs/ai-context/api-transportada.md`, `.../worker-transportada.md` e o `CLAUDE.md`
      da raiz: a rotina nova, a rota do robô e a permissão da automação (`code-standart.md` §14)
- [ ] T7.2 [P] `evidence.md` fechado: comandos, contagens e o print do diálogo
- [ ] T7.3 Revisão final com `code-reviewer` em `opus` sobre o diff inteiro, com olho em: nenhum
      `Promise.all` capaz de derrubar lote (§15), nenhuma string repetida sem constante (§16),
      cabeçalho de copyright em todo arquivo novo (§17), e nenhum PII em log
- [ ] T7.4 `make check` + `make migration-test` + integração da API, todos em primeiro plano, antes
      de qualquer push

---

## Prompt de execução

```text
/oh-my-claudecode:autopilot Crie o worktree com `make worktree NAME=canhoto-em-maco` e trabalhe
dentro dele. Execute a spec specs/222-o-canhoto-nao-espera-alguem-abrir-a-nota/ (leia spec.md,
plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fases 1, 2, 3, 5 e 6 → executor model=sonnet · Fase 7 → executor model=haiku ·
Fase 4 inteira e as tasks T3.1, T3.2 🧠 → opus (validar com architect ANTES de implementar) ·
revisão final T7.3 → code-reviewer model=opus.
Teste de aceite/contrato ANTES da implementação em toda task. Cada task fecha com typecheck +
testes + commit isolado, evidência em evidence.md. Arquivo de teste novo entra na lista explícita
do package.json da app. Integração da API é outro comando, de dentro de apps/api-transportada:
`bun --env-file=../../.env.test run test:integration` — sem o --env-file ela pula em vez de falhar.
A Fase 5 tem migration: `make migration-test` verde e `db:generate` dizendo no_changes antes de
fechar, e toda migration nasce com rollback.sql.
As Fases 1 e 2 entregam o maço e não dependem do resto — podem ir a staging antes da rotina.
A Fase 4 é PORTÃO: se nenhum decodificador de imagem fechar em Bun no runtime do Railway, PARE e
pergunte; o plano B (leitura no navegador disparada pelo diálogo) muda o escopo das Fases 5 e 6.
O veredito do canhoto NÃO sai do servidor: o worker só reporta o que leu, e quem decide continua
sendo resolveAutomaticCanhotoReview. Máquina nunca recusa. O robô não recebe trip.manage.
A Fase 2 fecha com revisão de design e print ao usuário (web.md §15).
Confira numeração de spec, ADR (0091) e migration contra origin/staging antes de criar arquivo.
Pare e pergunte antes de: deploy em produção, migration destrutiva, dar trip.manage à conta de
serviço, mexer na leitura do navegador (CanhotoAutomaticReview), recusa de canhoto em massa,
qualquer [NEEDS CLARIFICATION].
```
