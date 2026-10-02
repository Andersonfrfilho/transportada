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

- [ ] T1.1 Ler `read-delivery-proof.use-case.ts` inteiro e registrar em `evidence.md` como a URL
      assinada é produzida (HMAC local ou chamada ao storage) — é o que decide se a rota em lote
      assina original + miniatura ou só a miniatura (plan.md § "Grupo A — maço (API)")
- [ ] T1.2 Contrato da rota em lote **antes da implementação**: `GET /trips/:id/delivery-proofs`
      responde 200 com `documentId` em cada item, `fleet.read` basta, `trip.manage` não é exigido,
      e `?documentIds=` filtra com teto (CA01) — `apps/api-transportada/test/`
- [ ] T1.3 Porta + consulta: `findByTrip` em `ReadDeliveryProofPort` e o Drizzle filtrando por
      `companyId` + `tripId` (nunca por payload)
- [ ] T1.4 `readDeliveryProofsByTrip` ao lado do que existe, sem tocar no caminho de uma nota
- [ ] T1.5 Rota em `trip.routes.ts` com `TRIP_FIELD_READ_POLICY`, serialização com `documentId`
- [ ] T1.6 Integração sobre viagem semeada: três comprovantes de três notas numa chamada
      (`test/integration/*.integration.ts` + comando do aviso acima)

## Fase 2 — O maço confere o canhoto

> 🤖 Modelo: `sonnet`

- [ ] T2.1 [P] Contrato de `canhotoBatchSelection.service.ts` **antes da função**: da seleção +
      comprovantes sai `eligible` (canhoto `pending`), `excluded` (contagem) e os itens do diálogo;
      nota sem comprovante, comprovante que não é canhoto e canhoto já conferido ficam de fora
      (CA02, CA03)
- [ ] T2.2 A função pura `shared/canhotoBatchSelection.service.ts`
- [ ] T2.3 [P] Contrato do lote no cliente: sequência de `canhotoReviewProof`, 409 vira
      `conflicted` (não falha), falha de rede remarca só o que falhou e relata "1 de 5"
      (CA07, CA08)
- [ ] T2.4 `useTripDeliveryProofs.query.ts`, `enabled` só com `trip.manage` **e** seleção não vazia
      — o detalhe da viagem não passa a buscar comprovante de graça (plan.md § frontend)
- [ ] T2.5 `approveCanhotoBatch` em `useTripWorkspace.hook.ts`, devolvendo
      `{ approved, conflicted, failed }` e invalidando a consulta da viagem
- [ ] T2.6 `TripCanhotoBatchDialog.component.tsx`: grid com `ProofImage`, número e série da nota, a
      leitura automática quando houver, caixa marcada por item, rótulo com a contagem (CA05, CA06)
- [ ] T2.7 Item cuja imagem não carregou nasce **desmarcado**, com aviso — a tela não aprova o que
      não mostrou (RF-A8, CA09)
- [ ] T2.8 Botão no maço em `TripStateActions.component.tsx`, no molde de `batchFieldDelivery`, com
      o aviso de exclusão reaproveitando a contagem da T2.2 (CA02–CA04)
- [ ] T2.9 Textos em `trip.locale.json` (`stateActions.batchCanhoto*`, `deliveryProof.canhotoBatch.*`)
- [ ] T2.10 Revisão de design e usabilidade do diálogo (`web.md` §15): teto de itens, foco no
      diálogo, leitura por teclado, e **print ao usuário** antes de fechar a fase

## Fase 3 — O robô tem porta própria

> 🤖 Modelo: `sonnet` (T3.1 e T3.2 são 🧠 — validar com `architect` em `opus` ANTES de implementar)

- [ ] T3.1 🧠 ADR-0091 — "o canhoto é lido sem ninguém abrir a viagem": a 220 cravou a leitura no
      navegador ("não existe outro chamador"); este ADR registra o canal novo, por que o veredito
      continua no servidor e por que o robô não herda `trip.manage`
- [ ] T3.2 🧠 Nome da permissão da automação, validado contra o vocabulário de
      `authorization.policy.ts`, e a decisão de que ela entra **só** no papel `automation`
      (ADR-0047 §4)
- [ ] T3.3 Contrato **antes da rota**: a rota do robô aceita o token da automação, recusa token de
      gente com `trip.manage`, e o `.strict()` recusa `action` no corpo (CA13)
- [ ] T3.4 Permissão no vocabulário e no papel `automation`; contrato de que nenhum outro papel a
      recebeu
- [ ] T3.5 A rota `PATCH .../proof/review/automatic` em `canhoto-review.routes.ts`, no **mesmo**
      caso de uso — a rota de gente não muda, e o navegador continua pelo `action: 'automatic'`
- [ ] T3.6 Integração: o caminho do robô grava veredito, leitura e trilha; sobre veredito humano
      devolve `unchanged` (CA10, CA12)

## Fase 4 — Portão: dá para decodificar imagem no servidor?

> 🤖 Modelo: `opus` 🧠 — é decisão de dependência e de arquitetura (`code-standart.md` §13)

- [ ] T4.1 🧠 Spike medido: JPEG, PNG e WebP → luminância em Bun, no runtime do Railway, sem passo
      de build próprio. Medir tempo e memória numa foto de canhoto real de teste e registrar a
      tabela em `evidence.md`. Candidatos a comparar, não a presumir: wasm (`@jsquash/*`) e nativo
      (`sharp`)
- [ ] T4.2 Decisão escrita no ADR-0091 com o número medido. **Se nenhuma opção fechar**, PARE e
      pergunte ao usuário: o plano B é a leitura no navegador disparada pelo diálogo do maço, e isso
      muda o escopo das Fases 5 e 6
- [ ] T4.3 `bun add` da escolhida no `apps/worker-transportada` + `bun install --frozen-lockfile` na
      raiz, com `make check` limpo

## Fase 5 — A rotina entra no relógio

> 🤖 Modelo: `sonnet` (fase com migration — `make migration-test` fecha a T5.4)

- [ ] T5.1 [P] `trip.canhoto.read` nas **quatro** cópias do catálogo (cron, worker, API, frontend)
      com os `failureOutcomes` do plan.md e `minimumIntervalSeconds: JOB_TICK_INTERVAL_SECONDS`
- [ ] T5.2 [P] Paridade nos quatro `job-catalog` contracts
- [ ] T5.3 Migration no molde de `drizzle/20260915233000_rate_limit_windows/migration.sql`:
      recria `job_executions_job_check` e `job_schedules_job_check` com o nome novo
      (DROP → ADD NOT VALID → VALIDATE) e insere a linha em `job_schedules`
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
      `canhoto_read_source IS NULL`, empresa ativa, com `tripId`/`documentId`/`companyId`/`objectId`
      e as notas da viagem com chave de acesso
- [ ] T6.4 Decodificador + `worker_thread` (ADR-0053), com teto de bytes conferido **antes** de
      decodificar e contrato sobre um PNG sintético commitado (barra gerada no teste, sem foto real)
- [ ] T6.5 Gateway autenticado, decalque de `automatic-manifest-api.gateway.ts` (token em cache com
      margem, `x-company-id`), chamando a rota da Fase 3
- [ ] T6.6 Contrato do laço **antes da rotina**: teto de lote, teto de ciclo, `isStopRequested()`,
      falha de um comprovante contada sem derrubar o resto (CA14)
- [ ] T6.7 `application/canhoto-read.routine.ts` e a ligação em `main.ts` do worker
- [ ] T6.8 Contrato de log: o ciclo emite id e contagem, nunca nome, documento ou bytes (CA15)
- [ ] T6.9 Integração do ciclo: doze pendentes, os que casam ficam `approved` com origem
      `automatic`, os que não casam ficam `pending` **com o número lido**, nenhum `rejected`; e o
      segundo ciclo não toca em nada (CA10, CA11)

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
