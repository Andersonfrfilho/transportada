# Evidência — 042 A nota rejeitada tem saída

## Diagnóstico do caso que originou a feature

Produção, 17/08/2026. Fatura de NFS-e rejeitada às 17:46:02Z com 16 notas de origem presas.

Consulta ao banco de produção (via `railway ssh --service api`, sem PII na saída):

```
invoice 111e44f5-03bb-407e-9d5c-7747c45075cd rejected 2026-08-17T17:46:02.931Z
links   111e44f5-03bb-407e-9d5c-7747c45075cd total=16 canceladas=0
outbox  total=1 publicadas=1
```

Causa da rejeição, lida da tentativa:

```
last_error_code    = NOTA_RP_UNKNOWN
last_error_message = Por favor informe o campo "Exigibilidade ISS"
```

— corrigida pela 040 (`ExigibilidadeISS` em caixa alta,
`worker-transportada/src/nfse-issuance/infrastructure/nfse-fiscal-gateway.ts:265`), já em produção.

### Por que as notas ficaram presas

Quatro portas fechadas, todas conferidas no código:

| Porta                           | Onde                                | Veredito                                                                      |
| ------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| Vínculo solto na rejeição       | não existe                          | nenhum caminho carimba `cancelled_at` fora do cancelamento                    |
| Seleção ignora fatura rejeitada | `nfse-invoice-issuance.query.ts:46` | filtra só `isNull(cancelledAt)`, sem status                                   |
| Cancelar a rejeitada            | `nfse-invoice-state.policy.ts:52`   | `NFSE_INVOICE_NOT_AUTHORIZED`                                                 |
| Reemitir                        | `nfse-invoice-state.policy.ts:36`   | transição existe, `checkNfseInvoiceTransition` só é chamado pelo cancelamento |
| Reentregar a mensagem           | `nfse-attempt-status.policy.ts:10`  | `rejected` é liquidada, consumidor recusa                                     |

E o banco fecha a saída de emergência — corrigir só a leitura não resolveria:

```
nfse_service_invoice_documents_active_nfe_unique
  on (company_id, nfe_document_id) where cancelled_at is null
```

O mesmo vínculo bloqueia o lado do CT-e (`cte-batch-selection.query.ts:100`, forma idêntica), então as
16 notas estavam fora dos dois caminhos.

---

## T001

Contrato estendido em `test/nfse-domain/state.contract.ts` (arquivo já existente e já registrado no
`package.json` — o caminho `test/nfse-invoices/invoice-state.contract.ts` do `tasks.md` não
correspondia à convenção real do repo, corrigido na task). Três testes novos: `discard` de `rejected`/
`failed`, bloqueio de `discard` nos outros seis status, e as quatro ações bloqueadas sobre `discarded`.

Vermelho, `bun test ./test/nfse-domain.contract.test.ts`:

```
34 pass
3 fail

(fail) discards only what never existed fiscally
  expect nextStatus "discarded", recebeu "issuing"
  — checkNfseInvoiceTransition não tem ação `discard`; cai no fallback de `issue`

(fail) refuses to discard anything mid-flight, pending, authorized or already settled
  expect allowed=false reason=NFSE_INVOICE_IN_FLIGHT, recebeu allowed=true nextStatus="issuing"
  — mesma causa

(fail) refuses every action over a discarded invoice
  expect objeto com reason=NFSE_INVOICE_ALREADY_DISCARDED, recebeu undefined
  — status "discarded" não existe em NfseServiceInvoiceStatus nem nas quatro tabelas de transição
```

Falhou exatamente pelos dois motivos previstos: `discard` inexistente e `discarded` fora do catálogo.

---

## T002

`'discarded'` acrescentado a `NFSE_SERVICE_INVOICE_STATUSES` (`database/nfse.schema.ts`) — o `CHECK`
`nfse_service_invoices_status_check` é derivado do array via `inList()`, sem edição manual de SQL no
schema.

Migration gerada com `bun run db:generate --name nfse_invoice_discarded_status`:

```
drizzle/20260817201606_nfse_invoice_discarded_status/migration.sql
  ALTER TABLE "nfse_service_invoices" DROP CONSTRAINT "nfse_service_invoices_status_check",
    ADD CONSTRAINT "nfse_service_invoices_status_check" CHECK ("status" in
    ('requested', 'issuing', 'pending_authorization', 'authorized', 'cancellation_requested',
     'rejected', 'cancelled', 'failed', 'discarded'));
```

`rollback.sql` ao lado, no molde de `20260729105113_mdfe_manifest_discarded_status/rollback.sql`:
devolve o `CHECK` sem `'discarded'` (destrutivo se alguma linha já estiver nesse status — documentado
no cabeçalho do próprio arquivo) e remove a entrada do `drizzle.__drizzle_migrations` conferindo o
hash SHA-256 do `migration.sql` (`3edc0dbfb23464af6e430002e1846f599f66f789cded2896058ff6e3980fd734`,
verificado com `shasum -a 256`).

`bun run db:check` — limpo ("Everything's fine 🐶🔥").

Primeira rodada de `make migration-test` falhou: `test/database-migration/static-migration.contract.ts`
mantém a lista ordenada e explícita de diretórios de migration, e a nova não estava nela. Corrigido
acrescentando `'20260817201606_nfse_invoice_discarded_status'` à lista. Segunda rodada:

```
70 pass
0 fail
703 expect() calls
Ran 70 tests across 6 files. [10.58s]
```

Verde.

---

## T003

`nfse-invoice-state.policy.ts`: nova ação `discard` em `NFSE_INVOICE_ACTION`, novo motivo de bloqueio
`alreadyDiscarded` em `NFSE_TRANSITION_BLOCK`, e a coluna `discarded` acrescentada às três tabelas
existentes (`ISSUE_TRANSITIONS`, `CANCEL_TRANSITIONS`, `CONFIRM_CANCELLATION_TRANSITIONS`) — sempre
bloqueando, porque `discarded` é terminal. Nova tabela `DISCARD_TRANSITIONS`: permite só a partir de
`rejected` e `failed` (→ `discarded`); bloqueia `requested`/`issuing` por `inFlight`,
`pending_authorization` por `pendingAuthorization`, `authorized` por `alreadyAuthorized`,
`cancellation_requested` por `cancellationInFlight`, `cancelled` por `alreadyCancelled`, e `discarded`
por `alreadyDiscarded`. `checkNfseInvoiceTransition` passa a despachar `discard` para a tabela nova.

`bun test ./test/nfse-domain.contract.test.ts`:

```
37 pass
0 fail
179 expect() calls
Ran 37 tests across 1 file. [203.00ms]
```

Verde — os três testes vermelhos do T001 passaram a verdes sem alterar nenhuma asserção.

`bun run typecheck` pegou o que o teste de domínio não cobre: `BLOCK_MESSAGE` em
`nfse-issuance.error.ts` é `Record<NfseTransitionBlock, string>` completo, e `alreadyDiscarded` não
tinha mensagem — `NfseInvoiceTransitionBlockedError` quebraria em runtime na primeira nota descartada.
Acrescentada a entrada `'The service invoice is already discarded.'`. `bun run typecheck` limpo depois.

---

## T004

Contrato novo em `test/nfse-invoices-http/invoice-discard.contract.ts` (8 testes), registrado em
`test/nfse-invoices-http.contract.test.ts`. Fixture `test/fixtures/nfse-invoices-http.fixture.ts`
estendida com `NfseInvoiceDiscardSummary`, a constante `DISCARD`, a dependência
`discardNfseInvoice` (mock que grava em `discardCalls` e lança `params.discardError` quando
fornecido) e o array `discardCalls` no retorno — o mesmo molde de `cancelCalls`.

`bun test ./test/nfse-invoices-http.contract.test.ts`:

```
55 pass
7 fail

(fail) o descarte devolve 202 com os documentos liberados
  expect status 202, recebeu 404
(fail) a rota propaga chave de idempotência, correlation-id e empresa
  expect discardCalls length 1, recebeu 0
(fail) descartar exige nfse.cancel — leitura sozinha não basta
  expect status 403, recebeu 404
(fail) descartar sem chave de idempotência é recusado
  expect status 400, recebeu 404
(fail) campo desconhecido no corpo é recusado, inclusive companyId
  expect status 400, recebeu 404
(fail) nota fora de rejected/failed devolve o bloqueio de transição como 409 tipado
  expect status 409, recebeu 404
(fail) descartar o que já foi descartado devolve 409 com o motivo próprio
  expect status 409, recebeu 404
```

Vermelho pelo motivo único esperado: `nfse-invoices.routes.ts` ainda não declara `POST
/nfse-service-invoices/:id/discard`, então toda chamada cai no fallback de rota não encontrada
(404) antes de chegar em qualquer validação de permissão, corpo ou idempotência. O teste de UUID
inválido (404 esperado) já passava, porque 404 é o resultado tanto para "rota inexistente" quanto
para "id fora do formato" — mas ele é o único onde o vermelho e o verde coincidem por acidente, e
ficará provado quando os outros seis virarem verde sem mexer nele.

## T005

Caso de uso e rota de descarte, reusando o mesmo seam do cancelamento
(`releaseDocumentLinks`/`findInvoiceForUpdate`) — sem chamada à prefeitura: sem tentativa, sem
outbox, sem credencial. `markDiscarded` só atualiza `status`, `updated_at` e incrementa `version`;
não toca `cancellation_motive`/`cancellation_reason`, que são do fluxo de cancelamento. Não há
replay por chave de idempotência como no cancelamento — uma segunda chamada encontra a nota já
`discarded` e cai no bloqueio de transição de `checkNfseInvoiceTransition`, que já é idempotência
suficiente para uma operação síncrona.

Peças adicionadas:

- `nfse-invoice.port.ts`: `MarkNfseInvoiceDiscardedInput` e `markDiscarded` em
  `NfseInvoiceTransactionPort`.
- `drizzle-nfse-invoice.repository.ts`: implementação de `markDiscarded`.
- `nfse-invoice-discard.use-case.ts`: `createNfseInvoiceDiscardUseCase` — novo arquivo.
- `nfse-invoices.schema.ts`: `nfseInvoiceDiscardSchema` (`z.object({}).strict()` — corpo vazio).
- `nfse-invoices.routes.ts`: rota `POST /nfse-service-invoices/:id/discard`, política
  `NFSE_CANCEL_POLICY` (reusa `nfse.cancel` — cancelar e descartar encerram a fatura sem passar
  pela emissão), `serializeDiscard`.
- `main.ts`: instancia `discardNfseInvoice` e passa para `createNfseInvoiceRoutes`.
- `test/fixtures/nfse-invoices-application.fixture.ts`: `markDiscarded` no repositório fake, com
  `recording.discards` no mesmo molde de `recording.cancellations`.

`bun test ./test/nfse-invoices-http.contract.test.ts ./test/nfse-invoices-application.contract.test.ts`:

```
121 pass
0 fail
290 expect() calls
```

`bun run typecheck` (as quatro apps do monorepo): limpo, sem erros.

## T006

Contrato novo em `test/nfse-invoices-http/invoice-reissue.contract.ts` (8 testes), registrado em
`test/nfse-invoices-http.contract.test.ts`. Fixture `test/fixtures/nfse-invoices-http.fixture.ts`
estendida com `NfseInvoiceReissueSummary` (`attemptId`, `attemptNumber`, `invoiceId`,
`payloadSha256`, `replayed`, `requestedAt`, `status: 'issuing'`), a constante `REISSUE`, a
dependência `reissueNfseInvoice` (mock que grava em `reissueCalls` e lança `params.reissueError`
quando fornecido) e o array `reissueCalls` no retorno — o mesmo molde de `discardCalls`.

Permissão escolhida: `nfse.issue` (não `nfse.cancel`) — reemitir volta a passar pela emissão, é a
mesma porta da criação, diferente do descarte que a encerra sem transmitir. Corpo do T006 é
`{}` sem campos: a correção com os nove campos corrigíveis é do T008, e mandar qualquer campo aqui
já deve ser recusado por `.strict()` quando a rota existir.

`bun test ./test/nfse-invoices-http.contract.test.ts`:

```
63 pass
7 fail
168 expect() calls
Ran 70 tests across 1 file. [221.00ms]

(fail) a reemissão sem corpo devolve 202 com a nova tentativa
  expect status 202, recebeu 404
(fail) a rota propaga chave de idempotência, correlation-id e empresa
  expect reissueCalls length 1, recebeu 0
(fail) reemitir exige nfse.issue — leitura sozinha não basta
  expect status 403, recebeu 404
(fail) reemitir sem chave de idempotência é recusado
  expect status 400, recebeu 404
(fail) campo desconhecido no corpo é recusado, inclusive companyId
  expect status 400, recebeu 404
(fail) nota autorizada devolve o bloqueio de transição como 409 tipado
  expect status 409, recebeu 404
(fail) nota descartada devolve 409 com o motivo próprio
  expect status 409, recebeu 404
```

Vermelho pelo motivo único esperado, o mesmo do T004: `nfse-invoices.routes.ts` ainda não declara
`POST /nfse-service-invoices/:id/reissue`, então toda chamada cai no fallback de rota não
encontrada (404). O teste de UUID inválido (404 esperado) passou de cara — mesma coincidência
documentada no T004, que se resolve quando os outros seis virarem verde sem tocar nele.

`bun run typecheck` (api-transportada): limpo, sem erros.

---

## T007 — Caso de uso e rota de reemissão (verde)

`bun test ./test/nfse-invoices-http.contract.test.ts ./test/nfse-invoices-application.contract.test.ts`:

```
bun test v1.3.14 (0d9b296a)

 129 pass
 0 fail
 314 expect() calls
Ran 129 tests across 2 files. [233.00ms]
```

Suíte completa da app, sem regressão em nenhuma das outras 105 áreas:

```
bun test v1.3.14 (0d9b296a)

 2575 pass
 15 skip
 0 fail
 10600 expect() calls
Ran 2590 tests across 107 files. [3.34s]
```

`bun run typecheck` (api-transportada): limpo, sem erros.

### O que a implementação decidiu

**O payload é copiado, o `providerConfig` é remontado.** `findLatestPayload` devolve só
`{payload, payloadSha256}` — a nova tentativa grava os dois **verbatim**, e é isso que faz o hash
da tentativa 2 ser idêntico ao da tentativa 1 (assertiva do T006). O `providerConfig` fica **fora**
do tipo de propósito: ele é transporte, não conteúdo fiscal, não entra no hash, e a reemissão o
reconstrói pela credencial ativa de hoje (`buildNfseProviderConfig`). É o que faz uma inscrição
municipal corrigida — o achado da spec 040 — valer na próxima tentativa; copiar o bloco velho
falharia exatamente do mesmo jeito.

**`markIssuing` limpa `rejection_code` e `rejection_message`.** O CHECK
`nfse_service_invoices_rejected_check` só as exige em `rejected`, então `issuing` com as duas nulas
é legal. Deixá-las preenchidas mostraria "em emissão" ao lado da mensagem da recusa anterior. A
trilha não se perde: código e texto continuam na tentativa que os recebeu.

**`findLatestPayload` ordena por `attempt_number desc`, não por data** — é essa coluna que numera
as tentativas da nota. O join com `nfse_issuance_attempts` carrega `company_id` na condição, senão
o `attemptId` sozinho alcançaria a tentativa de outra empresa.

**Os vínculos permanecem.** Nenhuma chamada a `releaseDocumentLinks`: a nota continua sendo a
mesma, e devolver os 16 documentos à seleção aqui abriria a porta para eles entrarem noutra nota
enquanto esta ainda tenta.

**`attempt_number` já era do banco.** `createAttempt` calcula
`coalesce(max(attempt_number), 0) + 1` em SQL desde a spec 036 — a aplicação não numera nada, e o
`attemptNumber: 2` do T006 saiu sem código novo. O fake do fixture passou a contar as tentativas em
vez de devolver `1` fixo, para dizer a mesma coisa que o repositório.

**Uma cópia a menos, não uma a mais.** `loadCredential` existia idêntico em
`nfse-invoice.use-case.ts` e em `nfse-invoice-cancellation.use-case.ts`; a reemissão seria a
terceira. Os três passaram a chamar `loadNfseCredential` de `nfse-issuance-attempt.service.ts`.

**Permissão `nfse.issue`, decidida no T006:** reemitir volta a passar pela emissão; cancelar e
descartar encerram a nota sem transmitir.

---

## T008

Dois tipos de produção alargados de forma **inerte** — nenhum deles é lido em lugar nenhum ainda,
só existem para o teste construir entrada tipada; `requestReissue()` continua copiando
`frozen.payload`/`frozen.payloadSha256` verbatim e chamando `markIssuing` sem as duas colunas novas:

- `ReissueNfseInvoiceInput` (`nfse-invoice-reissue.use-case.ts`) ganha `correction?:
NfseInvoiceCorrectionInput`, tipo novo com os nove campos corrigíveis da spec, todos opcionais.
- `MarkNfseInvoiceIssuingInput` (`nfse-invoice.port.ts`) ganha `description?: string` e
  `issAmount?: string`.

O schema HTTP (`nfseInvoiceReissueSchema`) **não muda** — continua `.strict({})`, como o próprio
comentário no arquivo já dizia ("os campos corrigíveis entram no T009"). Por isso o vermelho útil
mora em dois lugares:

- `test/nfse-invoices-http/invoice-reissue-correction.contract.ts` (6 testes, novo, registrado em
  `test/nfse-invoices-http.contract.test.ts`): as 2 primeiras testes mandam um campo corrigível no
  corpo e esperam `202` — vermelho hoje porque o schema ainda recusa qualquer campo. As 4 seguintes
  (`serviceAmount`/`issAmount`/`taker`/`documents` → `400`) já passam, e ficam como trava de
  regressão para quando o schema aceitar os nove campos no T009.
- `test/nfse-invoices-application/invoice-reissue.contract.ts` (6 testes, novo, registrado em
  `test/nfse-invoices-application.contract.test.ts`): exercita o caso de uso real contra
  `createNfseRepositoryFixture({invoiceStatus: 'rejected'})`. É aqui que mora o vermelho de verdade:
  payload da tentativa nova com os campos corrigidos e hash diferente do congelado; `issRate`
  corrigida recalculando `issAmount = serviceAmount × issRate` (`'10000.0000' × '0.060000' =
'600.0000'`, 4 casas) tanto no payload quanto em `markIssuing`; `description` corrigida chegando a
  `markIssuing`. As duas últimas — sem correção o payload continua igual ao congelado, e o perfil de
  emissão nunca é tocado (nenhum método de escrita existe para ele no port) — já passam hoje, porque
  são o comportamento correto que o T007 já entrega.

`bun test ./test/nfse-invoices-http.contract.test.ts ./test/nfse-invoices-application.contract.test.ts`:

```
bun test v1.3.14 (0d9b296a)

 135 pass
 6 fail
 333 expect() calls
Ran 141 tests across 2 files. [258.00ms]

(fail) nfse service invoice reissue correction http > descrição corrigida no corpo chega ao caso de uso, sem 400
  expect status 202, recebeu 400
(fail) nfse service invoice reissue correction http > issRate corrigida no corpo chega ao caso de uso, sem 400
  expect status 202, recebeu 400
(fail) nfse invoice reissue correction > a correção troca os campos no payload da tentativa nova, com hash diferente do congelado
  expect payload com description/issExigibility corrigidos, recebeu o payload congelado intacto
(fail) nfse invoice reissue correction > issRate corrigida recalcula o issAmount por Decimal no payload da tentativa nova
  expect payload.issAmount '600.0000', recebeu undefined (chave ausente)
(fail) nfse invoice reissue correction > issRate corrigida grava o issAmount recalculado em nfse_service_invoices, via markIssuing
  expect issuings[0].issAmount '600.0000', recebeu undefined
(fail) nfse invoice reissue correction > descrição corrigida reescreve a descrição da fatura, e nenhuma outra coluna muda
  expect issuings[0].description presente, recebeu ausente
```

Vermelho pelo motivo único esperado: `requestReissue()` ainda ignora `input.correction` por
completo — nenhuma correção chega ao payload nem a `markIssuing`. As duas falhas HTTP são o mesmo
motivo visto pela porta de fora: o corpo com campo corrigível ainda não passa do `.strict({})`.
Nenhuma falha é erro de tipo — os dois tipos alargados compilam e fluem sem tocar em comportamento.

`bun run typecheck` (api-transportada): limpo, sem erros.

## T009

`applyNfseIssuanceCorrection` nasce em domínio novo,
`src/nfse-invoices/domain/nfse-issuance-correction.policy.ts` — puro: payload anterior + correção
opcional → payload novo e `payloadSha256` novo. Sem correção (`undefined` ou `{}`), devolve o mesmo
payload e o mesmo hash por referência, sem recalcular nada — é o que mantém T006 verde. Com
correção, mescla `{...previousPayload, ...correction}` e, só quando `issRate` vem no corpo,
recalcula `issAmount = serviceAmount × issRate` em `Decimal` (`MONEY_SCALE` = 4 casas, o mesmo
`parseScaledDecimal`/`applyRate`/`formatScaledDecimal` de `shared/decimal.service.ts`, sem lib
externa) e assina o hash de novo com `createHash('sha256')`, a mesma fórmula do
`freezeNfseIssuancePayload`. `NfseInvoiceCorrectionInput` mudou de dono: saiu do caso de uso
(camada de aplicação) e passou a viver no domínio, para a função pura não importar tipo de camada
acima — o caso de uso reexporta o tipo (`export type { NfseInvoiceCorrectionInput }`) para não
quebrar quem já importava dali.

`nfse-invoice-reissue.use-case.ts`: `requestReissue()` chama `applyNfseIssuanceCorrection` logo no
início, com `frozen.payload`/`frozen.payloadSha256` como base, e passa o resultado para
`savePayload` (payload e hash corrigidos) e para o retorno final (`payloadSha256` corrigido).
`markIssuing` ganha `description`/`issAmount` só quando a correção realmente os produziu — chave
omitida via spread condicional, nunca `undefined` explícito, para bater com
`recording.issuings[0]?.description` ficando `undefined` de verdade quando não há correção (T006) e
com o `toEqual` exato do T008 quando só `description` muda (sem `issAmount` sobrando no objeto).
`createReissueFingerprint` (`nfse-issuance-attempt.service.ts`) ganha `correction?:
NfseInvoiceCorrectionInput` e espalha os campos da correção **direto no objeto do fingerprint**, não
aninhados sob uma chave `correction` — `createRequestFingerprint` só ordena as chaves de fora antes
de assinar, e aninhar deixaria a ordem interna sem canonicalização. Isso fecha uma lacuna que não
tinha teste algum cobrindo: duas correções diferentes mandadas sob a mesma `idempotency-key` agora
produzem fingerprints diferentes, em vez de a segunda colapsar em replay da primeira.

`nfseInvoiceReissueSchema` (`nfse-invoices.schema.ts`) troca `.object({}).strict()` pelos nove campos
corrigíveis, todos `.optional()` e sem `.default()` — ausência tem de continuar diferente de valor
vazio. As regras espelham `nfse-profile-request.schema.ts` (`CNAE`/`IBGE_CITY` `/^[0-9]{7}$/`,
`issRate` `/^(?:0\.[0-9]{6}|1\.000000)$/`, `issExigibility` no enum `NFSE_ISS_EXIGIBILITIES`).
`serviceAmount`/`issAmount`/`taker`/`documents` continuam sem campo — `.strict()` é quem devolve
`400`. A rota (`nfse-invoices.routes.ts`) passa a capturar o retorno de `parseBody(...)` (antes
descartado com `await parseBody(...)` sem variável) e encaminhar como `correction` no input do caso
de uso.

`bun test ./test/nfse-invoices-http.contract.test.ts ./test/nfse-invoices-application.contract.test.ts`:

```
bun test v1.3.14 (0d9b296a)

 141 pass
 0 fail
 336 expect() calls
Ran 141 tests across 2 files. [228.00ms]
```

Todos os 6 testes que estavam vermelhos no T008 passam, e os testes do T006 (reemissão sem corpo)
continuam verdes — corpo ausente segue distinto de corpo vazio.

Suíte completa da app, `bun test`:

```
bun test v1.3.14 (0d9b296a)

 2587 pass
 15 skip
 0 fail
 10622 expect() calls
Ran 2602 tests across 107 files. [3.38s]
```

`bun run typecheck` (api-transportada): limpo, sem erros — inclusive as duas mudanças que exigiram
espalhamento condicional (`...(input.correction === undefined ? {} : {correction: input.correction})`)
em vez de `correction: input.correction` direto, por causa de `exactOptionalPropertyTypes: true`.

`bun run lint` (api-transportada): limpo, sem erros.

## T010

Pesquisa antes de escrever o teste: li os dois seams que a task proíbe tocar.

- `buildActiveInvoiceLinkFilters` (`src/nfse-invoices/infrastructure/nfse-invoice-issuance.query.ts`)
  — seleção de NFS-e — filtra por `isNull(nfseServiceInvoiceDocuments.cancelledAt)`.
- `buildActiveNfseLinkFilters` (`src/cte-batches/infrastructure/cte-batch-selection.query.ts`) —
  seleção de lote de CT-e — filtra pelo mesmo `isNull(nfseServiceInvoiceDocuments.cancelledAt)`.

Os dois já são cobertos, sem tocar em nenhum dos dois, por
`test/nfse-schema/invoice-release-eligibility.contract.ts` — arquivo que **já existia antes da 042**
(commit `9991af7`, da feature de emissão de NFS-e). Ele prova, por comparação de SQL compilado
(`PgDialect.sqlToQuery`), que os quatro caminhos de elegibilidade (liberação, seleção de NFS-e,
seleção de lote de CT-e, listagem de NF-e) leem o mesmo recorte `cancelled_at is null`, preso ao
mesmo `company_id`. Essa suíte continua verde, intocada.

O elo que faltava: provar que o **descarte** (T005) carimba `cancelled_at` pelo **mesmo seam** do
cancelamento — não um caminho próprio que pudesse divergir. Confirmado lendo
`drizzle-nfse-invoice.repository.ts:265-267`: `releaseDocumentLinks` do descarte chama a mesma
função privada `releaseDocumentLinks(transaction, companyId, input)` (linha 550) que usa
`buildInvoiceLinkReleaseFilters` — byte a byte o que o cancelamento já chama. Não há bifurcação de
código entre as duas ações na camada de infraestrutura.

Novo teste, `test/nfse-invoices-application/invoice-discard.contract.ts`, no mesmo padrão de
`invoice-cancellation.contract.ts` (fixture de repositório, sem banco real — é assim que a
aplicação já testa liberação de vínculo nesta camada): prova que `createNfseInvoiceDiscardUseCase`
chama `releaseDocumentLinks` na mesma transação do descarte, antes de `markDiscarded`, com o
`invoiceId` e o `cancelledAt` corretos — o mesmo formato de chamada que o cancelamento já usa.
Registrado no entrypoint `test/nfse-invoices-application.contract.test.ts`.

A corrente fecha assim: descarte carimba `cancelled_at` pelo seam do cancelamento (teste novo) →
esse é o recorte que as duas seleções já ignoram (teste pré-existente, intocado) → logo, depois do
descarte, o documento passa nas duas seleções. Nenhum dos dois filtros da task foi tocado.

```
bun test ./test/nfse-invoices-application.contract.test.ts

 68 pass
 0 fail
 149 expect() calls
Ran 68 tests across 1 file. [278.00ms]
```

Suíte completa da app, `bun test`:

```
bun test v1.3.14 (0d9b296a)

 2590 pass
 15 skip
 0 fail
 10630 expect() calls
Ran 2605 tests across 107 files. [4.02s]
```

`bun run typecheck` (api-transportada): limpo, sem erros.

`bun run lint` (api-transportada): limpo, sem erros — `test/nfse-schema/invoice-release-eligibility.contract.ts` e as duas funções de filtro seguem sem nenhuma alteração.

---

## T011

Fase 3, `apps/worker-transportada`. O catálogo copiado do worker
(`src/database/nfse-issuance-execution.schema.ts:8-16`) ainda não tem `'discarded'` em
`NfseServiceInvoiceStatus`, e `ALLOWED_FROM` de `nfse-write-back.policy.ts` **já** recusa qualquer
`kind` sobre um `storedStatus` que não esteja listado — `'discarded'` nunca apareceu em nenhum dos
cinco arrays, então em runtime `resolveNfseWriteBack` já bloqueia corretamente. O vermelho da task
não é comportamental — é o próprio catálogo não reconhecer o status ainda, que é a garantia real:
sem a entrada no tipo, nenhum código do worker consegue nem _expressar_ uma fatura descartada, e o
que T012 muda é só o catálogo, nunca `ALLOWED_FROM`.

Teste novo em `test/nfse-issuance-write-back.contract.test.ts`, dentro do describe já existente
`'NFS-e write-back status guard contract'` (mesmo arquivo que já teste `resolveNfseWriteBack` para
os outros cinco `kind`): `never lets a late delivery resuscitate a discarded invoice` atribui o
literal `'discarded'` a uma variável tipada `NfseServiceInvoiceStatus` e chama
`resolveNfseWriteBack` para todo `kind` do catálogo `NFSE_WRITE_BACK_KIND`.

Vermelho, `bun run typecheck`:

```
$ bunx tsc --noEmit
test/nfse-issuance-write-back.contract.test.ts(212,11): error TS2322: Type '"discarded"' is not assignable to type 'NfseServiceInvoiceStatus'.
```

`bun test ./test/nfse-issuance-write-back.contract.test.ts` continua verde (bun não checa tipo em
runtime — a nova asserção passa porque `ALLOWED_FROM` já bloqueia por ausência):

```
bun test v1.3.14 (0d9b296a)

 17 pass
 0 fail
 56 expect() calls
Ran 17 tests across 1 file. [27.00ms]
```

O vermelho registrado é o de `typecheck` — precedente já usado em `specs/026-user-administration`
para o mesmo tipo de lacuna (tipo que ainda não existe, não asserção que ainda falha).

---

## T012

`NfseServiceInvoiceStatus` em `src/database/nfse-issuance-execution.schema.ts:8-17` ganha
`'discarded'` como última entrada. `ALLOWED_FROM` e `NEXT_STATUS` de `nfse-write-back.policy.ts`
**não foram tocados** — nenhum dos cinco arrays de `ALLOWED_FROM` listava `'discarded'` antes, e
continuam sem listar: é isso que a task pede (`git diff --stat` confirma o arquivo da política fora
do diff).

```
$ bunx tsc --noEmit
(sem saída — limpo)
```

`bun test ./test/nfse-issuance-write-back.contract.test.ts`:

```
bun test v1.3.14 (0d9b296a)

 17 pass
 0 fail
 56 expect() calls
Ran 17 tests across 1 file. [26.00ms]
```

T011 verde nos dois sinais: `typecheck` limpo e o teste de runtime continua passando.

Suíte completa do worker, `bun test`:

```
474 pass
0 fail
8 errors
1114 expect() calls
Ran 474 tests across 67 files. [564.00ms]
```

Os 8 erros são de `test/nfe-import-repository.integration.test.ts` — falha ao conectar num Postgres
real (`connection.adapter` undefined no `@adatechnology/drizzle-provider`), arquivo não tocado por
esta task e que exige a infra local (`make up`) para rodar; pré-existente neste ambiente sem docker.

---

## T013

Inserida depois de uma descoberta que reabriu o desenho da Fase 4: pesquisa antes de escrever
qualquer teste de frontend mostrou que **nenhuma resposta da API** expõe o payload congelado — nem o
detalhe da fatura (`serializeDetail`, `nfse-invoices.routes.ts:326-344`), nem a resposta da reemissão
(`serializeReissue`, só devolve `attemptId/attemptNumber/invoiceId/payloadSha256/replayed/
requestedAt/status`), nem existe schema de resposta nenhum declarado para `GET
/nfse-service-invoices/{id}` em `nfse-invoices.schema.ts` (só schemas de corpo de requisição). Os
nove campos corrigíveis só existiam como shape de **entrada** em `nfseInvoiceReissueSchema`. Decisão
tomada com o usuário: expor o payload no `GET` de detalhe existente, em vez de rota nova ou de
redesenhar o diálogo sem prefill real. `tasks.md` renumerado para abrir a Fase 4 — API: prefill da
reemissão (T013/T014) antes da Fase 5 — Frontend (T015/T016, era T013/T014) e da Fase 6 — Produção
(T017, era T015); nenhuma task já fechada (T001–T012) mudou de número.

`freezeNfseIssuancePayload` (`nfse-issuance-attempt.service.ts:169-189`) grava exatamente os nove
campos corrigíveis **mais** `serviceAmount`, `issAmount`, `taker: {legalName, taxId}` e `documents[]`
no mesmo objeto plano — o mesmo payload cobre pré-preenchimento **e** o resumo somente-leitura
(valor do serviço, valor do ISS, tomador, contagem de notas) que T015 pede, sem precisar de um
segundo campo ou de uma segunda chamada.

Teste novo em `test/nfse-invoices-application/invoice-queries.contract.ts`, describe `nfse invoice
detail — payload congelado da última tentativa` (3 casos). Fixture
`test/fixtures/nfse-invoices-application.fixture.ts` ganhou `FULL_FROZEN_PAYLOAD`, com a forma real
de `freezeNfseIssuancePayload` (monta a partir de `PROFILE`/`INVOICE_DETAIL`/`LINKED_DOCUMENT` já
existentes). Nenhum arquivo novo — suíte já registrada em
`test/nfse-invoices-application.contract.test.ts`.

`bun test test/nfse-invoices-application.contract.test.ts`:

```
bun test v1.3.14 (0d9b296a)

test/nfse-invoices-application.contract.test.ts:
124 |   test('o detalhe devolve os campos corrigíveis e o resumo somente-leitura do payload congelado', async () => {
...
error: expect(received).toEqual(expected)

- { cnaeCode: "4930202", description: "...", documentCount: 1, issAmount: "42.5000",
-   issExigibility: "1", issRate: "0.050000", issWithheld: false, municipalTaxationCode: "",
-   municipalityIbgeCode: "3543402", nbsCode: "", serviceAmount: "850.0000",
-   serviceListItem: "16.01", takerLegalName: "Cliente Sintético Ltda", takerTaxId: "98765432000188" }
+ undefined

(fail) nfse invoice detail — payload congelado da última tentativa > o detalhe devolve os campos
corrigíveis e o resumo somente-leitura do payload congelado [2.75ms]

148 |   test('fatura sem tentativa ainda devolve lastPayload nulo', async () => {
...
error: expect(received).toEqual(expected)
Received: undefined

(fail) nfse invoice detail — payload congelado da última tentativa > fatura sem tentativa ainda
devolve lastPayload nulo [0.69ms]

 69 pass
 2 fail
 152 expect() calls
Ran 71 tests across 1 file. [293.00ms]
```

Vermelho pelo motivo único esperado: `useCase.detail(...)` ainda não compõe `lastPayload` —
`nfse-invoice-query.use-case.ts` não foi tocado por esta task, então a propriedade sai `undefined`
nos dois casos que a exigem. O terceiro teste do describe (`buscar o payload congelado no detalhe não
abre transação`) já passa hoje — é guarda de desenho para a T014 (a leitura não pode virar
transação), não prova de capacidade nova, por isso não conta como vermelho.

```
$ bunx tsc --noEmit
test/nfse-invoices-application/invoice-queries.contract.ts(129,20): error TS2339: Property
'lastPayload' does not exist on type 'NfseInvoiceDetail'.
test/nfse-invoices-application/invoice-queries.contract.ts(153,20): error TS2339: Property
'lastPayload' does not exist on type 'NfseInvoiceDetail'.
```

Typecheck vermelho pelo mesmo motivo — esperado até T014 declarar o tipo e implementar. `lastPayload`
não entra em `NfseInvoiceDetail` (tipo usado também por item de lista): fica como campo composto só
no retorno de `NfseInvoiceQueryUseCase.detail(...)`, buscado por uma chamada separada a
`repository.findLatestPayload` (a promover de `NfseInvoiceTransactionPort` para
`NfseInvoiceReaderPort`) — o mesmo padrão de `download()`, que já faz `loadDetail` seguido de uma
segunda busca dirigida, em vez de inchar `findInvoiceDetail`.

`bun run lint` (worker-transportada): limpo, sem erros.

---

## T014 — Expor o payload na rota (verde)

`loadDetail` continua só a leitura já existente; `detail()` busca `lastPayload` numa segunda chamada
dirigida (`repository.findLatestPayload`) e devolve `NfseInvoiceDetail & {lastPayload}` — o mesmo
formato de composição que `download()` já usava para a localização do documento fiscal, em vez de
inchar `findInvoiceDetail`.

**`findLatestPayload` promovida para `NfseInvoiceReaderPort`, com `companyId` no input.** A versão
transacional já existia em `NfseInvoiceTransactionPort` sem `companyId` explícito porque a
transação captura o tenant no fechamento; a versão não-transacional que `detail()` chama fora de
transação não tinha de onde herdar isso, e ficaria sem filtro de empresa se copiasse a assinatura
antiga — corrigido acrescentando `companyId` ao input do port, propagado para as duas
implementações do repositório (`DrizzleNfseInvoiceRepository.findLatestPayload`, novo método de
nível superior, e o escopo transacional) e para os dois pontos de `nfse-invoice-reissue.use-case.ts`
que já chamavam `loadFrozenPayload`. A função de módulo em `drizzle-nfse-invoice.repository.ts`
passou a aceitar `NfseQueryable` (`NfseDatabase | NfseTransaction`) em vez de só `NfseTransaction` —
mesma convenção já usada por `findInvoiceDetail` — para servir às duas chamadas.

`serializeDetail` (`nfse-invoices.routes.ts`) ganhou `lastPayload`, extraído por uma função pura e
explícita nova, `serializeLastPayload`, que enumera os 14 campos — nunca espalha o `Record<string,
unknown>` sem checagem, seguindo a convenção de todo `serialize*` já existente no arquivo.

**Schema de resposta declarado, como o T013 exigia.** `nfseLastIssuancePayloadResponseSchema` em
`nfse-invoices.schema.ts` é o primeiro schema de **resposta** HTTP deste app (os cinco anteriores
são todos de corpo de requisição). Consumidor real: o novo teste HTTP abaixo faz `.parse()` no
`lastPayload` da resposta antes de comparar valor — não fica declarado e sem uso.

Teste novo em `test/nfse-invoices-http/invoice-queries.contract.ts`, describe `nfse service invoice
detail http`: `o detalhe devolve o payload congelado da última tentativa em lastPayload`. A fixture
`test/fixtures/nfse-invoices-http.fixture.ts` ganhou `LAST_PAYLOAD` e `DETAIL` passou a
`NfseInvoiceDetailWithPayload` — sem isso a suíte HTTP quebrava com `500` real (o roteador chamava
`serializeLastPayload(undefined)` sobre o `DETAIL` antigo, que não carregava `lastPayload`); esse
`500` foi observado e corrigido nesta task, não fazia parte do T013.

`bun test test/nfse-invoices-http.contract.test.ts`:

```
bun test v1.3.14 (0d9b296a)

 77 pass
 0 fail
 197 expect() calls
Ran 77 tests across 1 file. [178.00ms]
```

Suíte completa da app, sem regressão:

```
bun test v1.3.14 (0d9b296a)

 2594 pass
 15 skip
 0 fail
 10635 expect() calls
Ran 2609 tests across 107 files. [3.71s]
```

`bun run typecheck` (api-transportada): limpo, sem erros.

---

## T015 — Contrato dos dois botões e do formulário de correção (vermelho)

Teste novo em `apps/frontend-transportada/test/nfse-invoice/reissue-discard.contract.ts`, registrado
em `test/nfse-invoice.contract.test.ts`. Segue o desenho já estabelecido em `row-actions.contract.ts`
— nenhum teste monta React; comportamento puro via `loadFutureModule` (o serviço ainda não existe com
os campos novos) e o restante por asserção estrutural no texto-fonte dos componentes/cliente/locales
que ainda não existem.

Seis `describe`, 19 casos:

- **Disponibilidade** (3 casos) — `REISSUABLE_STATUSES`/`DISCARDABLE_STATUSES` fixados em
  `['failed', 'rejected']`; `resolveNfseRowActions` habilita as duas ações nesses dois status e as
  desabilita nos outros sete; Reemitir gated por `nfse.issue`, Descartar por `nfse.cancel`,
  independentes entre si.
- **Idempotência** (2 casos) — `buildNfseReissueIdempotencyKey`/`buildNfseDiscardIdempotencyKey`
  produzem chave estável (mesmo par `invoiceId`+`token` → mesma chave) e distinta uma da outra,
  casando com `IDEMPOTENCY_KEY_PATTERN` que a API já aceita.
- **Corpo da correção** (4 casos) — `buildNfseReissueCorrectionBody`: sem edição, corpo sem nenhuma
  chave de domínio; só o campo tocado aparece; editar de volta ao valor congelado remove o campo de
  novo (mesmo efeito de não editar); os quatro campos somente-leitura (`documentCount`, `issAmount`,
  `serviceAmount`, `takerLegalName`) nunca vazam para o corpo, mesmo presentes no rascunho editado —
  é o que impediria o `400` que a API já devolve para esses campos (T008).
- **Renderização** (8 casos, todos por leitura de texto-fonte) — a linha ganha os dois botões gated
  pelo serviço puro (nunca por comparação direta de status no componente), com ícone do design
  system (`<svg>` cru proibido); os dois diálogos novos vão a portal sobre `document.body` com
  `useModalDialog`, `role="dialog"`, `aria-modal="true"`, no molde do `NfseInvoiceCancelDialog`; o
  diálogo de descarte pede confirmação e avisa que é irreversível; o de reemissão pré-preenche os
  nove campos corrigíveis a partir de `lastPayload` e mostra os quatro somente-leitura sem
  recalcular nada no cliente (`Number(` ausente); o select de exigibilidade usa
  `@/components/ui/select` (`<select` nativo proibido); o toggle de ISS retido usa
  `@/components/ui/checkbox` (`type="checkbox"` cru proibido); a página monta os dois diálogos novos.
- **Cliente** (1 caso) — `nfseInvoiceClient.service.ts` ganha `reissueInvoice`/`discardInvoice`, os
  dois com `idempotencyKey`.
- **Locales** (1 caso) — pt-BR e en declaram exatamente o mesmo conjunto de chaves novas
  (`rowActions.reissue`/`discard`, `status.discarded`, `discardDialog.*`, `reissueDialog.*`).

```
$ bun test test/nfse-invoice.contract.test.ts

 228 pass
 19 fail
 1124 expect() calls
Ran 247 tests across 1 file. [78.00ms]
```

Os 19 vermelhos batem exatamente com os 19 casos novos acima — nenhuma regressão nos 228 já
existentes. As causas, conforme o esperado por não existir nada ainda da Fase 5:

- `ENOENT` em `NfseInvoiceReissueDialog.component.tsx` e `NfseInvoiceDiscardDialog.component.tsx`
  (arquivos não existem) — cobre disponibilidade, idempotência, corpo da correção (o
  `loadFutureModule` do serviço falha porque `REISSUABLE_STATUSES`, `DISCARDABLE_STATUSES`,
  `buildNfseReissueIdempotencyKey`, `buildNfseDiscardIdempotencyKey`, `buildNfseReissueCorrectionBody`
  e os campos novos de `NfseRowActionState` ainda não são exportados por
  `nfseInvoiceRowActions.service.ts`) e os seis casos de renderização que leem os dois diálogos.
- `toContain` falhando em `NfseInvoiceRowActions.component.tsx` (`state.isReissueVisible` ausente),
  em `NfseInvoiceWorkspace.page.tsx` (não monta os dois diálogos novos), em
  `nfseInvoiceClient.service.ts` (sem `reissueInvoice`) e em `nfseInvoice.locale.json` (sem
  `rowActions.reissue`).

**Aceite cumprido:** vermelho registrado.
