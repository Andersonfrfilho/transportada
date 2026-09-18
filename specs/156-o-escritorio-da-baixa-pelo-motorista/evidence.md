# Spec 156 — Evidências

## T1

Arquivos alterados:

- `apps/frontend-transportada/src/modules/trip/shared/tripStatus.service.ts` — `canReturnDocuments`
  passou a delegar para `isTripDispatched` (que já inclui `on_delivery_route`), excluindo
  `completed` (terminal), em vez de aceitar só `dispatched`/`in_transit` na mão.
- `apps/frontend-transportada/test/trip/trip.fixture.ts` — `TripStatusContract` ganhou
  `on_delivery_route`.
- `apps/frontend-transportada/test/trip/state-gates.contract.ts` — nova linha em
  `GATES_BY_STATUS` para `on_delivery_route` (`editable: false, return: true, separateOrLoad:
false`), exercitada pelo teste já existente `every trip status opens exactly the gates the
domain opens` (e, por composição, por `delivering opens exactly where returning opens`, já que
  `canDeliverDocuments` delega em `canReturnDocuments`).

Nenhum arquivo de teste novo — os dois arquivos de teste tocados já estavam na lista de
`test/trip.contract.test.ts` (via import), que já consta no `package.json` da app.

### Teste falhando antes da correção

Comando: `bun test test/trip.contract.test.ts` (dentro de `apps/frontend-transportada`), com a
regra antiga (`status === 'dispatched' || status === 'in_transit'`) e a fixture/gate já
alterados para exigir `on_delivery_route`:

```
test/trip.contract.test.ts:
55 |           separateOrLoad: canSeparateOrLoadDocuments(status as TripStatusContract),
56 |         },
57 |       ]),
58 |     )
59 |
60 |     expect(actual).toEqual(GATES_BY_STATUS)
                        ^
error: expect(received).toEqual(expected)

@@ -33,3 +33,3 @@
      "editable": false,
-     "return": true,
+     "return": false,
      "separateOrLoad": false,

- Expected  - 1
+ Received  + 1

      at <anonymous> (.../test/trip/state-gates.contract.ts:60:20)
(fail) trip state gates mirror the backend transition policy > every trip status opens exactly the gates the domain opens [1.81ms]

 903 pass
 1 fail
 17708 expect() calls
Ran 904 tests across 1 file. [582.00ms]
```

### Teste passando depois da correção

Mesmo comando, após trocar `canReturnDocuments` para `isTripDispatched(status) && status !==
'completed'`:

```
bun test v1.3.14 (0d9b296a)

 904 pass
 0 fail
 17708 expect() calls
Ran 904 tests across 1 file. [548.00ms]
```

### Gates (raiz do monorepo)

- `bun run typecheck` → exit 0, `0` ocorrências de "error" no log (6 subprojetos: api, worker,
  cron, frontend-transportada, frontend-client, frontend-landing — todos `tsc --noEmit` limpo).
- `bun run lint` → exit 0, `0` ocorrências de "error" no log (mesmos 6 subprojetos, `eslint
--max-warnings=0`).
- `bun run --cwd apps/frontend-transportada test` → exit 0, `4237 pass`, `0 fail`, `36833
expect() calls`, 29 arquivos de teste. (Avisos de `standardFontDataUrl` do pdf.js em
  `document-intake.contract.test.ts` são pré-existentes, não relacionados a esta task.)

### Nada estranho encontrado

A política da API (`checkTripAcceptsDocumentWork`) já cobria `on_delivery_route` desde que a
lista `TRIP_DISPATCHED_STATUSES`/`isTripDispatched` foi centralizada — o frontend apenas nunca
foi atualizado para delegar a ela em vez de repetir a condição à mão. `canDeliverDocuments` já
delegava corretamente em `canReturnDocuments`, então corrigir uma função corrigiu as duas, como o
comentário da função já previa.

## T2

ADR-0067 (próximo número livre em `origin/staging`, conferido em 2026-09-18; não existe índice de
ADRs em `docs/adr/`) e a permissão `trip.report-on-behalf` para `company-admin`, `operator` e
`finance` (D1 confirmada).

Arquivos:

- `docs/adr/0067-o-escritorio-da-baixa-em-nome-do-motorista.md` — D1, D3, D4 e D6.
- `apps/api-transportada/src/identity/domain/authorization.policy.ts` — permissão no catálogo, logo
  depois de `trip.report`, e nos três papéis; o comentário do `separator` cita a ADR.
- `apps/api-transportada/test/authorization.contract.test.ts` — catálogo e matriz atualizados, e dois
  contratos novos: positivo (`company-admin`, `operator`, `finance`) e negativo (`separator`,
  `driver`, `aggregate`, `viewer`, `fiscal`, `contractor`, `automation`; o separador tem
  `trip.manage` e continua sem ela; o motorista tem `trip.report` e continua sem ela; o escritório
  continua sem `trip.report`). Arquivo já listado no `package.json` da API.
- Espelhos do frontend: `identity/queries/useAuthMe.query.ts` (allowlist do `/auth/me`),
  `identity/shared/permissionGroups.constant.ts` (grupo `trip`), `identity/locales/identity.locale.json`
  e `identity.en.locale.json` (rótulo e onde vale). Sem arquivo de teste novo: os contratos de
  paridade que já existem (`test/frontend-contract.test.ts` e `test/identity/permission-matrix.contract.ts`,
  este via `test/identity.contract.test.ts`) leem a política da API e falham sozinhos.

### Falhando antes da implementação

API, contratos escritos antes (`bun test test/authorization.contract.test.ts`):

```
(fail) authorization contract > defines the complete conservative permission matrix for every company role
    "trip.report",
-   "trip.report-on-behalf",
    "trip.financials",
(fail) authorization contract > grants the office delivery report on behalf of the driver only to the office roles
Expected: true
Received: false
 29 pass
 2 fail
Ran 31 tests across 1 file.
```

O contrato negativo passa antes e depois, como deve: ele é a guarda para ninguém estender a
permissão ao separador ou ao motorista depois.

Frontend, com a API já alterada e os espelhos ainda não
(`bun test test/frontend-contract.test.ts test/identity.contract.test.ts`):

```
(fail) paridade com o catálogo da API > toda permissão que a API concede está agrupada e nomeada aqui
-   "grouped": true,
+   "grouped": false,
    "permission": "trip.report-on-behalf",
(fail) frontend foundation contract > keeps the allowlist in sync with the API authorization policy
    "trip.report",
-   "trip.report-on-behalf",
    "trip.financials",
 243 pass
 2 fail
```

Sem a allowlist, o `/auth/me` de um `operator` seria recusado pelo `isAuthMeResponse`, e a tela
inteira cairia em "Indisponível".

### Verde depois

```
API       31 pass · 0 fail · Ran 31 tests across 1 file
Frontend 245 pass · 0 fail · Ran 245 tests across 2 files
```

### Gates

- `bun run typecheck` (raiz) → exit 0, `0` ocorrências de "error TS".
- `bun run lint` (raiz) → exit 0, `0` ocorrências de "error".
- `bun run --cwd apps/api-transportada test` → exit 0, `6378 pass`, `32 skip`, `0 fail`, 6410
  testes em 177 arquivos. Os 32 pulos são a integração sem `.env.test`, e nenhum deles exercita
  permissão: a matriz é função pura, e a T2 não cria rota nem query. Por isso a integração não foi
  rodada nesta task, e os pulos não contam como aprovação de nada.
- `bun run --cwd apps/frontend-transportada test` → exit 0, `4237 pass`, `0 fail`, 29 arquivos.
- `prettier --check` nos arquivos tocados → limpo.

### Validação do architect

Validação do architect: APROVADO COM RESSALVAS — emendas aplicadas em `608c3d0e` (ADR-0067,
spec, plan e tasks: baixa repetida com `DOCUMENT_ALREADY_SETTLED` e rota `field-proof`, vários
motoristas com `DRIVER_NOT_ON_TRIP`, "Revisa: ADR-0058 §4", despacho por
`trip_dispatch_snapshots.dispatched_at`, D8 como exceção à ADR-0057 §1, idempotência `office.` com
`IDEMPOTENCY_KEY_REUSED`, 404 entre empresas com FK composta, leitura do `finance` por `anyPermission`
em cinco rotas, T7 promovida a 🧠, T15 ampliada).

### Achados para as próximas tasks

- ⚠️ **O `finance` recebe a permissão, mas não abre a viagem.** `GET /trips/:id` é `fleet.read`
  (`TRIP_READ_POLICY` em `trip.routes.ts`), e o `finance` não tem `fleet.read`. Decidido na emenda:
  `anyPermission` em cinco leituras (spec D11, T7).
- ⚠️ **`recorded_at` não existe hoje.** A spec diz que a hora da gravação "continua gravada à parte",
  mas nas tabelas de campo só existe `occurred_at defaultNow()`. A ADR registra que a coluna é
  criada pela migration de autoria (T4).
- Não precisaram mudar: `realm/` (o Keycloak não carrega permissões, só papéis), o banco (a coluna de
  permissão de grupo não tem CHECK, e a matriz não é persistida), `list-role-permissions.use-case.ts`
  e `role-permissions.contract.ts` (derivam da constante), `driverWorkspace.service.ts`
  (`isFieldOnlyUser` segue olhando só `trip.report`), `separator-role.contract.test.ts` (nenhuma rota
  nova). `apps/api-transportada/CLAUDE.md` e `docs/ai-context/` ficam para a T15, que já tem essa
  atualização no escopo.

## T3

Desenho em `t3-design.md`. Validação do architect: **APROVADO COM RESSALVAS** (R1–R7), todas
incorporadas ao desenho (§0) e à implementação. Decisões do líder:

- Os erros seguem o padrão de `trip.error.ts`, sem criar `codes.ts`.
- A idempotência reusa 409 `TRIP_FIELD_REPORT_KEY_REUSED`, com o ator na comparação. Isso fica
  para a T6.
- O alvo `trip` não leva `companyId`.

### Vermelho → verde

1. **R1, antes do refactor**, contra o código antigo:
   `bun test ./test/field-trip-target.contract.test.ts` → `3 pass · 0 fail`.
   ⚠️ O Bun não checa tipos. O dublê desse contrato já nasceu com `readStatus` e `updateStatus → true`
   (a forma pós-R2), o que é inerte no código antigo. Por isso ele não precisou de edição depois, e o
   `tsc` o valida no estado final.
2. **Contratos novos de unidade**, antes da implementação: `error: Cannot find module
'../../src/trips/application/resolve-field-trip-target.use-case.js'` → `0 pass · 1 fail · 1
   error`.
3. **Integração nova**, antes da implementação: o mesmo `Cannot find module` → `0 pass · 1 fail · 1
error`.
4. **Depois**:
   - `bun test ./test/field-trip-target.contract.test.ts` → `24 pass · 0 fail`, 55 expects. Cobrem
     R1, a política (position 1, `DRIVER_NOT_ON_TRIP`, `TRIP_WITHOUT_DRIVER`), o resolvedor (404
     sem 403, o `companyId` do contexto, e R7 sem `driverId`), o alvo que chega às seis portas, o
     compare-and-set com a corrida perdida (R2) e os `@ts-expect-error` de R3 e R4.
   - Integração, de dentro de `apps/api-transportada`, com
     `bun --env-file=../../.env.test test --timeout 120000`, **arquivo por arquivo, nenhum pulou**:

```
field-trip-target.integration.ts               5 pass · 0 fail · 0 skip
me-trip.integration.ts                         6 pass · 0 fail · 0 skip
whatsapp-driver-flow-actions.integration.ts    1 pass · 0 fail · 0 skip
```

A integração nova prende:

- `findTripCrew`: outra empresa e `tripId` inexistente dão `null` (R6). Viagem sem tripulação dá
  `drivers: []` e 422 `TRIP_WITHOUT_DRIVER`. A tripulação sai ordenada por `position`, e o padrão é
  a position 1.
- Parada de outra viagem da mesma empresa → 404 `TRIP_STOP_NOT_REACHABLE`. Nota de outra viagem
  da mesma empresa → **409 `TRIP_DOCUMENT_NOT_REACHABLE`** (R5).
- Nenhuma das quatro consultas com alvo `trip` atravessa a empresa.
- O comprovante alcança a entrega da viagem alvo já `completed`.
- A corrida da R2: a viagem vira `completed` entre a leitura e a gravação, responde 409
  `STATE_TRANSITION_NOT_ALLOWED` e continua `completed`.

### Gate central: nenhum teste existente editado

`git diff --stat -- apps/api-transportada/test` → **vazio**. Em `test/` só há arquivos novos:

```
?? apps/api-transportada/test/field-trip-target.contract.test.ts
?? apps/api-transportada/test/field-trip-target/   (start-field-trip-driver, resolve, use-cases)
?? apps/api-transportada/test/integration/field-trip-target.integration.ts
```

`src/main.ts`, `me-trip.routes.ts` e `register-driver-flow-actions.ts` **não mudaram**: as
ligações repassam `{ ...input }` com `driverId`, que casa com a variante do motorista do
`FieldTripLocator`. Os dois entrypoints novos estão em `"test"` e em `"test:integration"` do
`package.json`.

### Gates

- `bun run typecheck` (raiz) → exit 0, sem `error TS`.
- `bun run lint` (raiz) → exit 0, `0` ocorrências de "error" no log.
- `bun run --cwd apps/api-transportada test` → exit 0, `6402 pass · 32 skip · 0 fail`, 6434
  testes em 178 arquivos. São +24 em relação à T2 (6378): exatamente os contratos novos. Os 32
  pulos são os mesmos da T2 (integração sem `.env.test`) e nenhum deles é arquivo novo. A
  integração que importa foi rodada à parte, acima, com `.env.test`.
- `prettier --check` nos arquivos tocados → limpo.

### `exists` no lugar do `inner join`

Não rodei `EXPLAIN`. O `exists` filtra `trip_drivers` por `(company_id, trip_id, driver_id)`, que é
exatamente o unique `trip_drivers_company_trip_driver_unique`: a busca é por índice, com no máximo
uma linha. O resultado é igual ao do join de antes, e `me-trip.integration.ts` (incluindo "a viagem
de uma empresa não alcança o motorista de outra") e a integração do WhatsApp passaram sem edição.

### Para as próximas tasks

- **T5:** o `:id` passa por `parseUuidPathIdentifier` antes de `resolveFieldTripTarget`. A rota
  chama o resolvedor e depois o caso de uso com `{ target }`. O `onBehalfOfDriverId` do alvo
  resolvido é o que vai para `audit_logs`.
- **T4:** a autoria deriva do localizador. `{ target }` vira `office` + `onBehalfOfDriverId`, e
  `{ driverId }` vira `driver_app` ou `whatsapp`.
- **T6:** o `DOCUMENT_ALREADY_SETTLED` entra em `runOutcome`, logo depois de
  `checkTripDocumentTransition`, só com `input.target !== undefined` (`t3-design.md` §8). O ator
  entra na comparação de `withFieldReport`.

## T4

Migration de autoria (ADR-0067 §2), aditiva, nas seis tabelas de campo, e o plumbing mínimo de
escrita que o T3 design (§7) já previa.

### Arquivos

**Migration:**

- `apps/api-transportada/drizzle/20260918054353_trip_field_authorship/migration.sql` — gerada por
  `bun run db:generate --name trip_field_authorship` (com `snapshot.json`, exigido pela regra de
  "migration à mão sem snapshot não" do `CLAUDE.md` da app).
- `apps/api-transportada/drizzle/20260918054353_trip_field_authorship/rollback.sql` — manual, no
  molde da 155 T2.1: falha (`RAISE EXCEPTION`) se qualquer uma das seis tabelas já tiver
  `channel <> 'driver_app'`, para não apagar autoria já gravada.

**Schema:** `apps/api-transportada/src/database/trip.schema.ts` — `TRIP_FIELD_CHANNELS`/
`TripFieldChannel` (`driver_app | office | whatsapp`, `as const`, sem ENUM nativo) definidos aqui
porque os seis `check`s os consultam; `channel varchar(16) not null default 'driver_app'`,
`on_behalf_of_driver_id uuid null` (FK composta `(company_id, on_behalf_of_driver_id) ->
fleet_drivers(company_id, id)`, seguindo `fleet_drivers_company_id_id_unique`) e os dois `check`s
(`..._channel_check`, `..._office_driver_check`: `channel <> 'office' or on_behalf_of_driver_id is
not null`) em `trip_document_events`, `trip_stop_events`, `trip_stop_occurrences`,
`trip_field_reports`, `trip_delivery_proofs`, `trip_document_occurrences`. `recorded_at timestamptz
not null default now()` só em `trip_document_events` e `trip_stop_events` — ver decisão abaixo.

**Constante do módulo:** `apps/api-transportada/src/trips/domain/trip-field-channel.constant.ts` —
reexporta `TRIP_FIELD_CHANNELS`/`TripFieldChannel` de `database/trip.schema.ts` (mesmo padrão de
`TripStatus`) e acrescenta `DEFAULT_TRIP_FIELD_CHANNEL`. Ver "decisão de camada" abaixo.

**Tipos e derivação da autoria:**
`apps/api-transportada/src/trips/application/field-trip-target.types.ts` — `FieldTripLocator` ganha
`channel?: TripFieldChannel` na variante `{ driverId }`; `FieldAuthorship` e
`deriveFieldAuthorship(locator)` (`{ target }` → `office` + `onBehalfOfDriverId` resolvido;
`{ driverId }` → `channel ?? 'driver_app'`, `onBehalfOfDriverId: null`), exatamente como o T3 design
§7 previu.

**Portas e casos de uso** (todos passam `authorship`/`deriveFieldAuthorship(input)` para a escrita,
sem mudar como a viagem é achada):

- `driver-field-report.port.ts` — `claim`, `recordEvent`, `recordOccurrence` ganham `authorship`.
- `trip-field-report.port.ts` (`withFieldReport`) — `FieldReportGuardInput` ganha `authorship` e
  repassa para `transaction.claim`.
- `report-stop-arrival.use-case.ts`, `report-document-delivery.use-case.ts` (`reportDocumentDelivery`
  e `reportDocumentReturn`), `report-stop-occurrence.use-case.ts` — computam
  `deriveFieldAuthorship(input)` uma vez e passam para `withFieldReport` e para `recordEvent`/
  `recordOccurrence`.
- `attach-delivery-proof.use-case.ts` (`DeliveryProofPort.saveProof`) e
  `register-driver-occurrence.use-case.ts` (`DriverOccurrencePort.saveOccurrence`) — idem.

**Infraestrutura (grava as colunas novas):**

- `drizzle-driver-field-report.repository.ts` — `claim`, `recordEvent`, `recordOccurrence` gravam
  `channel`/`onBehalfOfDriverId`.
- `drizzle-delivery-proof.repository.ts` — `saveProof` grava as duas colunas no insert e no
  `buildProofUpsertSet` (recaptura também atualiza a autoria).
- `delivery-proof-read.support.ts` (`saveTripOccurrence`) — `authorship` **opcional**: o fluxo do
  motorista/escritório manda; o fluxo do galpão (`registerTripOccurrence`, separação, chamado por
  `operatorWhatsAppFlowActions` em `main.ts`) continua sem mandar, e a coluna cai no default
  `driver_app` — fora do escopo desta task (ver "decisão de escopo" abaixo).

**WhatsApp (`main.ts`, dependências de `driverWhatsAppFlowActions`):** `registerOccurrence`,
`reportDelivery` e `reportReturn` passam `channel: TRIP_FIELD_CHANNELS.whatsapp`.
`register-driver-flow-actions.ts` **não mudou** — a autoria entra na ligação, não no dispatcher, do
mesmo jeito que o T3 blindou os call sites do motorista.

**Testes:**

- `test/database-migration/trip-constraints.assertion.ts` — `assertFieldChannelConstraints` (canal
  inválido, `office` sem `on_behalf_of_driver_id`, FK composta rejeitando motorista de outra
  empresa, e o caminho feliz `office` com motorista da própria empresa).
- `test/database-migration/static-migration.contract.ts` — nome da migration na lista estática.
- `test/integration/trip-field-authorship.integration.ts` (**novo**, listado em `test:integration`)
  — `reportDocumentDelivery`/`registerDriverOccurrence` contra Postgres real: `driver_app` por
  omissão, `whatsapp` quando pedido, `office` com o motorista resolvido por
  `resolveFieldTripTarget`.
- `test/trip-delivery-proof/receiver-document.contract.ts` — `BASE` de `buildProofUpsertSet` ganhou
  `authorship`, porque o tipo passou a exigi-lo (teste unitário do próprio builder, não dublê de
  porta).

### Decisões

**`recorded_at` por tabela** (ADR-0067 §3): a coluna só entra onde a tabela tem uma noção de "hora
do fato" que pode ser retroativa e ainda não tinha uma coluna separada de "hora da gravação":

- `trip_document_events.occurred_at` já existe e fazia os dois papéis → ganhou `recorded_at`.
- `trip_stop_events.created_at` é hoje a hora do evento (`arrived`/`delivered`/`returned`,
  potencialmente retroativa quando o escritório backdatar em T6) e a hora de gravação ao mesmo
  tempo → ganhou `recorded_at`; `created_at` passa a poder levar a hora da entrega, e
  `recorded_at` guarda quando o servidor de fato gravou.
- `trip_stop_occurrences`, `trip_field_reports`, `trip_delivery_proofs`, `trip_document_occurrences`
  **não** ganharam `recorded_at`: nenhuma delas tem uma "hora do fato" distinta da hora de registro
  no vocabulário desta spec — a ocorrência, o comprovante, a chave de idempotência e a nota de
  ocorrência do documento acontecem no instante em que alguém os registra, sem um campo do tipo
  "aconteceu às X, mas só contei agora". `created_at` de cada uma já é exatamente isso, para os três
  canais. Duplicar teria criado uma coluna sem consumidor, contrariando a instrução de não duplicar
  quando `created_at` já significa "quando foi gravado".
- `trip_documents.delivered_at` (T4 não mexe) continua sendo a hora da entrega em si — não é uma
  das seis tabelas de campo, e a spec já a exclui explicitamente.

**Decisão de camada — onde mora `TRIP_FIELD_CHANNELS`:** a primeira versão definia a constante só
em `trips/domain/trip-field-channel.constant.ts` e o `database/trip.schema.ts` a importava de lá.
`test/database-migration/pre-deploy.contract.ts` reprovou: o fechamento de imports do
`pre-deploy.service.ts` passou a incluir `src/trips/domain/trip-field-channel.constant.ts`, que o
`Dockerfile` de produção não copia (ele só copia as pastas de `src` que a migration/pre-deploy
precisam, e `trips/` propositalmente não é uma delas). Corrigido: a constante vive em
`database/trip.schema.ts` (mesmo padrão de `TRIP_STOP_EVENT_KINDS`), e
`trips/domain/trip-field-channel.constant.ts` só reexporta, como a aplicação já faz com `TripStatus`.
`bun run test:integration`… não roda em CI de imagem, mas o `pre-deploy.contract.ts` unitário pegou
isso sem precisar de Docker.

**Decisão de escopo — quem ganha `channel: 'whatsapp'` nesta task:** só
`register-driver-flow-actions.ts` (o fluxo do **motorista** pelo WhatsApp), como o pedido da task
especifica por nome de arquivo. `operatorWhatsAppFlowActions` (o galpão/separador operando por
WhatsApp, `registerTripOccurrence` → `saveTripOccurrence`) **não** ganhou `channel` explícito nesta
T4 — ele grava no default `driver_app`, o que é impreciso (não é o app do motorista), mas está fora
do recorte desta task (o pedido cita nominalmente `register-driver-flow-actions.ts`, que é o fluxo
de campo/entrega, não o de separação de galpão). Sinalizado aqui para não ser confundido com
trabalho esquecido.

**CHECK `office_driver_check` como implicação, não bicondicional:** `channel <> 'office' or
on_behalf_of_driver_id is not null`, exatamente como o pedido descreveu (`channel = 'office' ⇒
on_behalf_of_driver_id is not null`). Não usei `channel = 'office' = (on_behalf_of_driver_id is not
null)` (que também proibiria `on_behalf_of_driver_id` fora do canal `office`) porque a task pediu a
implicação, e a aplicação nunca envia `onBehalfOfDriverId` fora do alvo `office` de qualquer forma
(`deriveFieldAuthorship` só o preenche para `{ target }`).

**`updateStatus` (start-field-trip) não ganhou `authorship`:** ele grava só em `trips.status`, que
não é uma das seis tabelas de campo e não ganhou coluna de canal nesta migration. O T3 design (§7)
cita `updateStatus` na lista de "entradas de escrita" que ganhariam autoria, mas sem uma coluna para
gravar isso seria um parâmetro morto — deixei para quando (se) `trips`/`audit_logs` precisar dele na
T5, que é quem grava em `audit_logs`.

### Gates

- `bun run typecheck` (raiz, 6 apps) → exit 0, sem `error TS`.
- `bun run lint` (raiz, 6 apps) → exit 0, sem saída de erro.
- `bun run --cwd apps/api-transportada test` → `6407 pass · 32 skip · 0 fail`, 22315 `expect()`,
  178 arquivos. Falhou→verde: a primeira rodada, antes de ajustar
  `static-migration.contract.ts` e a camada de `TRIP_FIELD_CHANNELS`, deu `6405 pass · 2 fail`
  (nome da migration ausente da lista estática do `pre-deploy.contract.ts` e da migration; ver
  "decisão de camada" acima).
- `DRIZZLE_TEST_DATABASE_URL=postgresql://transportada:transportada@localhost:65432/transportada
bun run db:test` (equivalente ao `make migration-test`, contra o Postgres de teste já saudável
  desta sessão, porta 65432) → `97 pass · 0 fail`, incluindo a migration nova aplicada, os `check`s
  e a FK composta, e o rollback em bloco das migrations pós-identity (a suíte reverte todas as
  migrations depois da identidade numa passada só; a migration nova está entre elas e reverteu sem
  erro).
- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-field-authorship.integration.ts`
  → `4 pass · 0 fail`.
- Mesma chamada com `./test/integration/me-trip.integration.ts
./test/integration/whatsapp-driver-flow-actions.integration.ts
./test/integration/field-trip-target.integration.ts
./test/integration/whatsapp-command-driver.integration.ts
./test/integration/whatsapp-operator-flow-actions.integration.ts` → `18 pass · 0 fail` (nenhuma
  integração existente do motorista, do escritório T3 ou do operador quebrou).
- `bun run db:check` → "Everything's fine".

### Para a T5

- `resolveFieldTripTarget` já devolve `onBehalfOfDriverId`; a rota do escritório grava em
  `audit_logs` com esse valor (ADR-0067 §2, "cada registro do escritório grava em `audit_logs`").
- As rotas novas (`confirm-load`, `start-route`, `arrive`, ocorrência de parada) vão gravar em
  `trip_document_events`/`trip_stop_events`/`trip_stop_occurrences` pelas mesmas portas desta T4 —
  a autoria já está pronta, só falta a rota chamar `resolveFieldTripTarget` e montar o
  `FieldTripLocator` com `{ target }`.

## T5

Quatro rotas novas em `/trips/:id`, permissão própria `trip.report-on-behalf`, que resolvem o alvo
pela empresa do contexto (`resolveFieldTripTarget`, T3) e chamam os **mesmos** casos de uso do
motorista com `{ target }` — a autoria (`channel: 'office'`, `onBehalfOfDriverId`) e as portas já
estavam prontas desde a T4; esta task é fiação de presentation + `main.ts` + `audit_logs`.

### Arquivos

**Presentation (novos):**

- `apps/api-transportada/src/trips/presentation/trip-field-office.routes.ts` —
  `createTripFieldOfficeRoutes`: `POST /trips/:id/confirm-load`, `POST /trips/:id/start-route`,
  `POST /trips/:id/stops/:stopId/arrive`, `POST /trips/:id/stops/:stopId/occurrences`. Todas com
  `OFFICE_REPORT_POLICY = { permission: 'trip.report-on-behalf', scope: 'company' }`. Cada handler:
  resolve `TripFieldTripTarget` (com ou sem `driverId` pedido) → `resolveFieldTripTarget` →
  chama a dependência (`startFieldTrip`/`reportArrival`/`reportOccurrence`) com `{ target }` →
  grava `audit_logs` via `dependencies.audit.record`. Envelope de resposta idêntico ao das rotas
  `/me` (`{ data: { changed, status } }` 200 para os dois toques; `{ data: { id } }` 201 para
  chegada e ocorrência). `resolveClientIp` (já existente, `http/client-ip.service.ts`) captura o IP
  no `parse`, porque `handle` não recebe a `Request`.
- `apps/api-transportada/src/trips/presentation/trip-field-office.schema.ts` —
  `parseOfficeDriverSelection` (corpo vazio/opcional, só `driverId?: uuid`, para os dois toques e a
  chegada) e `parseOfficeStopOccurrenceRequest` (mesmo schema de `occurrenceSchema` de
  `me-trip.schema.ts`, com `driverId` a mais). `parseIdempotencyKey` é **reaproveitado** de
  `me-trip.schema.ts` (exportado), sem duplicar.

**Auditoria (nova, `security.md` §10 — ator, alvo, IP, timestamp):**

- `apps/api-transportada/src/trips/application/trip-field-office-audit.port.ts` —
  `TripFieldOfficeAuditPort.record`. O IP viaja em `metadata` porque `audit_logs` não tem coluna
  própria (nenhum gateway de auditoria existente no repositório grava IP em coluna — `security.md`
  não exige coluna, só que o dado esteja na trilha).
- `apps/api-transportada/src/trips/infrastructure/drizzle-trip-field-office-audit.gateway.ts` —
  `createDrizzleTripFieldOfficeAudit`: uma linha por ação, `entityType: 'trip'` /
  `entityId: tripId`, `targetType: 'trip_driver'` / `targetId: onBehalfOfDriverId`,
  `permission: 'trip.report-on-behalf'`, `metadata: { ipAddress }`. Mesmo padrão de
  `drizzle-group-audit.gateway.ts` e `drizzle-trip-document-review.repository.ts` (`insertAudit`).

**Composição:** `apps/api-transportada/src/main.ts` — `DrizzleFieldTripTargetRepository` (T3, ainda
não instanciada em produção) e `createDrizzleTripFieldOfficeAudit` ganham instância própria
(`fieldTripTargetRepository`, `tripFieldOfficeAudit`); `createTripFieldOfficeRoutes` entra no array
de rotas logo após `createMeTripRoutes`, reaproveitando `driverFieldReports`
(`DrizzleDriverFieldReportUnitOfWork`) e `currentDriverTripRepository` — os mesmos que o motorista
usa, sem instância paralela.

**Testes (novos, listados em `package.json`):**

- `test/trip-field-office.contract.test.ts` → `test/trip-field-office/policy.contract.ts` (aceite 1:
  política das quatro rotas — `trip.report-on-behalf` só, `separator`/`driver` fora,
  `company-admin`/`operator`/`finance` dentro) e `test/trip-field-office/routes.contract.ts`
  (unitário com dublês: resolução do alvo, parâmetros repassados a cada caso de uso, envelope de
  resposta, `audit_logs` gravado com os campos certos, 404/422/400 propagados pela rota sem
  tradução).
- `test/integration/trip-field-office.integration.ts` (**novo**, listado em `test:integration`) —
  contra Postgres real, roteia por `route.execute(...)` com as dependências reais
  (`DrizzleFieldTripTargetRepository`, `DrizzleCurrentDriverTripRepository`,
  `DrizzleDriverFieldReportUnitOfWork`, `createDrizzleTripFieldOfficeAudit`): aceite 2 (start-route
  em `in_transit` → `on_delivery_route`, `audit_logs` com o motorista de `position = 1`), aceite 13
  (driverId de `position = 2` respeitado na chegada; fora da tripulação → 422
  `DRIVER_NOT_ON_TRIP`, sem gravar `audit_logs`), aceite 3 (viagem de outra empresa → 404
  `TRIP_NOT_FOUND`).

### Decisões

**Auditoria como escrita separada, fora da transação do relato de campo:** `dependencies.audit`
grava depois que o caso de uso (que já correu dentro de `unitOfWork.execute`) devolveu — mesmo
padrão de `GroupAuditPort`/`drizzle-group-audit.gateway.ts`, que também audita fora da transação do
recurso. `security.md` §10 pede a trilha, não atomicidade com o efeito; e os casos de uso de campo
(T3/T4) são opacos à rota — ela não tem acesso à transação interna deles para inserir junto.

**`startFieldTrip`/`reportArrival`/`reportOccurrence` não ganharam `correlationId`/`ipAddress`:**
esses dois campos só servem à auditoria, que é escrita separada (decisão acima); passá-los para
dentro dos casos de uso do motorista mudaria a assinatura que a T3/T4 já fixou e que os testes
existentes (`field-trip-target/use-cases.contract.ts`) prendem. A rota monta o registro de
`audit_logs` com o que capturou no próprio `parse` (`correlationId`, `resolveClientIp`).

**Chegada do escritório sem `location`:** o corpo do escritório (`parseOfficeDriverSelection`) não
tem campo de coordenada — quem está no escritório não tem GPS de estrada para mandar. A porta
(`ReportStopArrivalInput.location`) continua exigindo o campo por causa da assinatura do motorista;
a rota do escritório sempre passa `null` na composição (`main.ts`), o mesmo "não aferida" que o
motorista manda quando o aparelho não pegou sinal.

**`registerDriverOccurrence`/`reportDocumentDelivery`/`reportDocumentReturn`/`attachDeliveryProof`
ficam para a T6:** a spec 156 T5 lista nominalmente `confirm-load`, `start-route`, `arrive` e
ocorrência de parada — as quatro rotas que espelham exatamente `me-trip.routes.ts` sem `documentId`
no corpo. As ações sobre documento (`deliver`, `return`, `field-proof`, `deliveredAt`) têm regras
próprias (idempotência prefixada `office.`, baixa repetida vira 409, canhoto obrigatório) que a T6
descreve — implementá-las aqui seria antecipar uma task que ainda não foi escrita.

### Gates

- `bun run typecheck` (raiz, 6 apps) → exit 0, sem `error TS`.
- `bun run lint` (raiz, 6 apps) → exit 0, sem saída de erro.
- `bun run --cwd apps/api-transportada test` → `6420 pass · 32 skip · 0 fail`, 22379 `expect()`,
  179 arquivos. Falhou→verde: `test/trip-field-office.contract.test.ts` sozinho, antes da
  implementação de `trip-field-office.routes.ts`, falhava com `Cannot find module
'../../src/trips/presentation/trip-field-office.routes.js'`; depois de escrever a rota, os 13
  testes do arquivo passaram.
- `bun run --cwd apps/api-transportada build` → `Bundled 1050 modules`, sem erro.
- De dentro de `apps/api-transportada`:
  `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-field-office.integration.ts ./test/integration/me-trip.integration.ts ./test/integration/field-trip-target.integration.ts ./test/integration/trip-field-authorship.integration.ts`
  → `19 pass · 0 fail`, 80 `expect()`, 4 arquivos (a nova integração, mais as três que a T3/T4 já
  tinham — nenhuma quebrou).

## T6

`field-delivery`, `field-return` e `field-proof` em `trip-field-office.routes.ts` — entrega e
comprovante do escritório na mesma transação, `deliveredAt`/`returnedAt` validados contra o relógio
e contra o despacho congelado, baixa repetida do canal `office` sem evento novo, foto obrigatória
por configuração e idempotência estendida ao ator.

### Duas decisões fora da spec, levadas ao líder antes de implementar

Ao mapear a T6 encontrei dois pontos que a spec não decidia e que travariam a implementação:

1. **`kind: 'photo'` + `receiverName` (D8) violava um `CHECK` que a própria T4 gravou.**
   `trip_delivery_proofs_receiver_check` era `kind = 'signature' or length(receiver_name) = 0` — o
   INSERT do canhoto do escritório (`kind: 'photo'`, `receiverName` preenchido) falharia no banco.
   **Decisão do líder:** relaxar o `CHECK` por migration nova (`kind = 'signature' or channel =
'office' or length(receiver_name) = 0`), sem apagar dado; `rollback.sql` recria o `CHECK` antigo
   e falha (sem apagar nada) se já existir linha `office`+`photo` com nome preenchido.
2. **Não existe hoje nenhum código de erro "foto obrigatória"** — nem no motorista, nem em lugar
   nenhum do repositório (busquei `PHOTO_REQUIRED`, `photo.*required`, `DeliveryProofPhoto` no
   projeto inteiro). O texto original da task ("422 com o MESMO código que o motorista recebe
   hoje") pressupunha um código que não existe. **Decisão do líder:** criar
   `TRIP_DELIVERY_PROOF_PHOTO_REQUIRED` (422) no padrão de `TripDeliveryProofDocumentRequiredError`,
   aplicado **só ao canal `office`** nesta T6.

**Pendência registrada (fora da spec 156):** o motorista continua sem verificação de foto
obrigatória no backend — hoje só o front dele barra o envio sem foto. Estender
`TRIP_DELIVERY_PROOF_PHOTO_REQUIRED` (ou equivalente) ao fluxo `POST /me/.../deliver` +
`.../proof` do motorista é trabalho novo, não desta spec. Sinalizado ao usuário para virar task
separada.

### Arquivos

**Domínio (novos/alterados):**

- `src/trips/domain/field-delivery-timing.policy.ts` (**novo**) — `assertDeliveredAtWithinWindow`:
  função pura, `DELIVERED_AT_IN_FUTURE` (tolerância de 2 min contra o relógio) e
  `DELIVERED_AT_BEFORE_DISPATCH` (contra `trip_dispatch_snapshots.dispatched_at`, `null` quando a
  viagem nunca despachou — não é esta regra que decide se isso pode acontecer).
- `src/trips/domain/trip.error.ts` — `TripDocumentAlreadySettledError` (409
  `DOCUMENT_ALREADY_SETTLED`), `DeliveredAtInFutureError`/`DeliveredAtBeforeDispatchError` (400),
  `TripDeliveryProofPhotoRequiredError` (422 `TRIP_DELIVERY_PROOF_PHOTO_REQUIRED`).
- `src/database/trip.schema.ts` — comentário e `CHECK` de `trip_delivery_proofs_receiver_check`
  ajustados (decisão 1 acima).

**Aplicação (alterados/novos):**

- `src/trips/application/report-document-delivery.use-case.ts` — `runOutcome` ganha: (a) o gate
  `isOffice` (`'target' in input`), que valida `deliveredAt`/`returnedAt` via
  `assertDeliveredAtWithinWindow` **antes** de checar a transição; (b) `DOCUMENT_ALREADY_SETTLED`
  quando `alreadySettled && isOffice`, **antes** de `settle`/`recordEvent` (canal do motorista
  inalterado — só entra no `if` quando há `target`); (c) `occurredAt`/`recordedAt` explícitos no
  `recordEvent` só para o escritório (o motorista continua com as duas colunas em `defaultNow()`);
  (d) `persistOfficeDeliveryProof`, que roda **dentro da mesma transação** da entrega — checa
  `settings.photo === 'required'`, valida tamanho/tipo do arquivo e grava o comprovante via
  `transaction.saveDeliveryProofWithinTransaction` (novo método do port, abaixo). `reportDocumentDelivery` ganha o parâmetro opcional `proof:
OfficeDeliveryProofAttachment` — ausente para o motorista e para `reportDocumentReturn` (que
  nunca leva comprovante).
- `src/trips/application/report-field-proof.use-case.ts` (**novo**) — `reportFieldProof`: o único
  caso de uso da T6 com `Idempotency-Key` própria que **não** passa pelo `runOutcome` de entrega —
  ele embrulha `attachDeliveryProof` (a mesma porta do motorista) em `withFieldReport`, com
  `operation: 'office.document.proof'`. Não cria evento nem muda `delivered_at`: só encontra o
  evento `delivered` já existente (`findDeliveryEventId`) e substitui o comprovante pelo unique
  `(company, stop_event, kind)`.
- `src/trips/application/attach-delivery-proof.use-case.ts` — `receiverName` passa a ser gravado
  quando `isSignature` **ou** `authorship.channel === 'office'` (decisão 1). É o que faz
  `field-proof` (que reusa esta função) também aceitar o nome do recebedor no canhoto `photo` do
  escritório.
- `src/trips/application/driver-field-report.port.ts` — `DriverFieldReportTransactionPort` ganha
  `findDispatchedAt`, `saveDeliveryProofWithinTransaction`,
  `findProofIdByAttachmentKeyWithinTransaction`; `recordEvent` ganha `occurredAt`/`recordedAt`
  opcionais. `FieldReportClaim` ganha `actorUserId` (idempotência estendida ao ator, abaixo).
- `src/trips/application/trip-field-report.port.ts` — `withFieldReport` agora lança
  `TripFieldReportKeyReusedError` (409, já existia) quando `claim.operation !== input.operation`
  **ou** `claim.actorUserId !== input.actorUserId` — ADR-0067 §5, decisão do líder na T3 (§8 do
  `t3-design.md`), implementada aqui.

**Infraestrutura (alterados):**

- `src/trips/infrastructure/drizzle-driver-field-report.repository.ts` — `claim`/`select` passam a
  ler/devolver `actorUserId`; `recordEvent` grava `createdAt`/`recordedAt` só quando informados
  (spread condicional, sem mudar o `defaultNow()` do motorista); `findDispatchedAt` (lê
  `trip_dispatch_snapshots`, único por viagem); `saveDeliveryProofWithinTransaction` e
  `findProofIdByAttachmentKeyWithinTransaction` (reaproveitam `buildProofUpsertSet`, importado de
  `drizzle-delivery-proof.repository.ts`, para não duplicar a lógica do upsert).

**Migration:**

- `drizzle/20260918070043_delivery_proof_office_receiver_name/` — `migration.sql` (drop+add do
  `CHECK`, uma transação), `rollback.sql` (recria o `CHECK` antigo, falha com mensagem clara se
  houver linha `office`+`photo` com nome).

**Presentation (alterados):**

- `src/trips/presentation/trip-field-office.schema.ts` — `parseOfficeFieldDeliveryRequest`
  (multipart: `deliveredAt` obrigatório, `file` opcional, `receiverName`/`receiverDocument`
  opcionais, `driverId` opcional; `kind` nunca vem do corpo — é sempre `'photo'`, ADR-0067 §5),
  `parseOfficeFieldReturnRequest` (JSON: `reason`, `returnedAt` opcional cai em "agora"),
  `parseOfficeFieldProofRequest` (multipart, `file` obrigatório).
- `src/trips/presentation/trip-field-office.routes.ts` — três rotas novas:
  `POST /trips/:id/documents/:documentId/field-delivery` (201, `{ alreadySettled, id, proofId,
stopCompleted, tripCompleted }`), `.../field-return` (201, mesmo envelope sem `proofId`),
  `.../field-proof` (201, `{ id }`). Todas com `OFFICE_REPORT_POLICY`
  (`trip.report-on-behalf`), `Idempotency-Key` obrigatória (inclusive `field-proof`, que reusa
  `trip_field_reports` com `operation: 'office.document.proof'` — decisão explícita da T6, não do
  padrão do motorista, para a mesma chave repetida não duplicar o anexo) e `audit.record`.

**Composição:** `src/main.ts` — `reportDelivery`/`reportReturn`/`attachProof` entram em
`createTripFieldOfficeRoutes`, reaproveitando `driverFieldReports`, `deliveryProofRepository`,
`deliveryProofDocumentSecrets` e `createDeliveryProofStorage` — os mesmos que o motorista usa, sem
instância paralela.

**Testes (novos, no mesmo entrypoint já listado em `package.json`):**

- `test/driver-trip/office-field-delivery.contract.ts` (importado por
  `test/driver-trip.contract.test.ts`, já listado) — unitário com dublês
  (`field-report.double.ts`, estendido com `dispatchedAtByTripId`/`proofsByAttachmentKey` e os três
  métodos novos do port): entrega + comprovante na mesma transação; aceite 9 (foto obrigatória);
  foto opcional ausente conclui sem comprovante; aceite 8 (futuro / antes do despacho); aceite 12
  (`DOCUMENT_ALREADY_SETTLED` sem evento novo); aceite 7 (repetir a mesma chave não duplica evento
  nem comprovante); idempotência estendida ao ator (409 `TRIP_FIELD_REPORT_KEY_REUSED`); o
  motorista continua sem validação de `deliveredAt`/foto; `field-proof` não cria evento nem muda
  `delivered_at`; `field-proof` sobre nota sem entrega alcançável → 409
  `TRIP_DOCUMENT_NOT_REACHABLE`; `attachDeliveryProof` só carrega `receiverName` em `kind: 'photo'`
  no canal `office` (canal `driver_app` continua sem).
- `test/integration/trip-field-office.integration.ts` (estendido) — novo `describe` contra
  Postgres real: grava entrega + comprovante na mesma transação (`delivered_at` = `deliveredAt`
  informado, prova lendo `trip_documents`/`trip_delivery_proofs`); aceite 9 real (config
  `company_delivery_proof_settings.photo = 'required'` → 422, nota continua `loaded`); aceite 8
  real (antes do despacho, com `trip_dispatch_snapshots` semeado); aceite 12 real (segunda entrega
  → 409, sem segunda linha em `trip_stop_events`); `field-proof` real (não muda `delivered_at`,
  substitui a linha pelo unique); 404 de outra empresa em `field-delivery`.
- `test/integration/trip-field-authorship.integration.ts` e
  `test/field-trip-target/use-cases.contract.ts` (T3/T4, **ajustados, não reescritos**): os dois
  testes que já chamavam `reportDocumentDelivery` com `target` (canal `office`) passaram a mandar
  `recordedAt` fixo — sem isso, ficavam reféns do relógio de parede contra o `now`/`NOW` fixo do
  arquivo, porque a T6 passou a validar `deliveredAt` sempre que há `target`. Comportamento
  esperado da mudança, não regressão escondida.
- `test/database-migration/static-migration.contract.ts` — lista de diretórios de migration
  ganhou a nova entrada.

### Decisões

**Idempotência de `field-proof` é própria, não a do motorista.** O motorista anexa comprovante sem
`Idempotency-Key` (dedupe só por `attachmentKey`, opcional). O escritório usa `Idempotency-Key`
obrigatória e `trip_field_reports` com `operation: 'office.document.proof'` — pedido explícito da
task (idempotência do escritório é uniforme nas três rotas), mesmo essa ação não criando evento
nenhum. `reportFieldProof` embrulha `attachDeliveryProof` (que abre a própria transação em
`saveProof`) dentro de outra transação só para a reserva da chave — não é uma transação única de
ponta a ponta, mas é suficiente para a garantia que importa: a segunda chamada com a mesma chave
nunca executa `attachDeliveryProof` de novo.

**`field-proof` não recebe `deliveredAt`.** Ele nunca muda `delivered_at` (ADR-0067 §2) — não fazia
sentido pedir um campo que a ação ignora.

**`receiverDocument` no `field-delivery`/`field-proof` do escritório segue o mesmo portão do
motorista (kind), não um portão novo.** A task pedia o campo no corpo "com o mesmo
envelope/máscara da ADR-0057 §3", mas como `kind` do escritório é sempre `'photo'`,
`attachDeliveryProof` já zera `receiverDocument` para qualquer `kind !== 'signature'` — o
escritório nunca coleta assinatura, então o campo é aceito e validado na forma canônica pelo
schema, mas nunca persiste. Manter esse portão (em vez de abrir uma segunda exceção como a do
`receiverName`) evita alargar `trip_delivery_proofs_receiver_document_check`, que ninguém pediu
para relaxar.

**`recordedAt` como parâmetro opcional, não um segundo `now`.** `ReportDocumentOutcomeInput.now`
continua sendo "a hora que vale para `trip_documents`/o evento" (para o motorista, é literalmente
agora; para o escritório, é `deliveredAt`/`returnedAt`). `recordedAt` é só usado (a) como referência
de "agora" na validação de janela e (b) gravado em `trip_stop_events.recorded_at` — ausente, os
dois caem em `new Date()`/`input.now`, preservando o comportamento de hoje para o motorista e o
WhatsApp sem tocar nas chamadas deles em `main.ts`.

### Gates

- `bun run typecheck` (raiz, 6 apps) → exit 0, sem `error TS`.
- `bun run lint` (raiz, 6 apps) → exit 0, sem saída de erro (1 `no-unused-vars` corrigido no
  caminho).
- `bun run --cwd apps/api-transportada build` → `Bundled 1052 modules`, sem erro.
- `bun run --cwd apps/api-transportada test` → `6437 pass · 32 skip · 0 fail`, 22440 `expect()`,
  179 arquivos (17 a mais que a T5, todos novos desta task; nenhum dos 6420 anteriores quebrou
  depois do ajuste de `recordedAt` nos dois testes T3/T4 citados acima).
- `make migration-test` (via `DRIZZLE_TEST_DATABASE_URL` + `db:test`) → migration + rollback da T6
  incluídos, `97 pass · 0 fail` (8 arquivos, inclui `database-migration.contract.test.ts`).
- De dentro de `apps/api-transportada`, contra o Postgres de `.env.test` (65432):
  `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-field-office.integration.ts ./test/integration/me-trip.integration.ts ./test/integration/field-trip-target.integration.ts ./test/integration/trip-field-authorship.integration.ts`
  → `25 pass · 0 fail`, 94 `expect()` (6 a mais que a T5: as novas de field-delivery/field-return/
  field-proof).
- `.../test/integration/whatsapp-driver-flow-actions.integration.ts` → `1 pass · 0 fail` (o canal
  `whatsapp` de `reportDocumentDelivery` não usa `target`, então não entra no gate `isOffice` —
  continua sem validar `deliveredAt`).
- Suíte completa de `.integration.ts` (todas, `--timeout 120000`, `.env.test`): `322 pass · 8 fail`.
  As 8 falhas são `toll-booth-reload.integration.ts` (4) e `cte-archive-gateway.integration.ts` (2,
  contadas em duplicidade pelo runner) — todas por `ObjectStorageError: Object storage is
unavailable` (MinIO fora do ar neste ambiente), pré-existentes e sem relação com `trips`/
  `delivery-proof`/`field-trip-target`. Nenhuma falha em qualquer arquivo tocado por esta task.

TDD: os oito testes novos de `office-field-delivery.contract.ts` e o novo `describe` de
`trip-field-office.integration.ts` foram escritos contra o código de campo desta T6 e falhavam
antes das mudanças em `report-document-delivery.use-case.ts`/`report-field-proof.use-case.ts`/
`trip-field-office.routes.ts` (módulo/rota inexistente ou comportamento antigo sem
`DOCUMENT_ALREADY_SETTLED`/validação de `deliveredAt`/foto obrigatória).

## T7

Desenho em `t7-design.md`. O `architect` **aprovou com ressalvas**, e todas as ressalvas estão no
§0 do desenho: M1 (`allowed-actions` em rota própria), A1, A2, A3, M2, M3, M4 e B1–B6.

Decisões do líder:

- **L1.** `me-routes.contract.ts` passa a usar o `authorize` real.
- **L2.** A rota `GET /trips/occurrence-types/field` foi aprovada.
- **L3.** O anexo do lote vira a **T7b** (`tasks.md`).
- **L4.** Tipo de separação no lote responde 422 `OCCURRENCE_TYPE_NOT_FIELD`.
- **L5.** O `finance` continua sem o feed.

### Achados anteriores à spec, que viraram tarefas separadas (L6)

- `GET /trips` publica `amounts` (receita e soma das notas) sem o recorte de `trip.financials`. Quem
  tem `fleet.read` vê esses valores, inclusive `separator` e `viewer`. Toca a ADR-0049 §6.
- O PWA do motorista lista os tipos de ocorrência por `GET /company-settings/occurrence-types`, que
  exige `settings.manage`. Ele recebe 403, e a lista aparece vazia sem aviso
  (`driverTripClient.service.ts:164`).
- `POST /trips/:id/documents/:documentId/occurrences` (`trip.manage`) aceita tipo de etapa de rua.
  `registerTripOccurrence` não confere a etapa, e a guarda descrita em `occurrence.policy.ts` não
  está ligada à rota.

### T7.1 — `anyPermission` e o recorte do motorista

**Arquivos:**

- `src/identity/domain/authorization.policy.ts`: a variante `CompanyAnyPermissionPolicy`, que exige
  pelo menos duas permissões, e a função pura `grantsAnyPermission`.
- `src/identity/application/authorization.service.ts`: o ramo `anyPermission`.
- `src/http/router.service.ts`: `assertAnyPermissionRoutesAreReads`, que derruba o boot se
  `anyPermission` aparecer fora de `GET`.
- `src/trips/presentation/trip.routes.ts`:
  - `TRIP_FIELD_READ_POLICY`, com `['fleet.read', 'trip.report-on-behalf']`, em `GET /trips`,
    `GET /trips/:id`, `GET /trips/:id/stops`, `GET …/proof` e `GET …/occurrences` (o `POST` do
    mesmo caminho continua `trip.manage`).
  - Em `serializeTripDetail`, `canReadDriverContact` passou a ser obrigatório, e as três chamadas
    (detalhe, `POST /trips` e `POST /trips/:id/close`) o calculam com
    `TRIP_READ_POLICY.permission` (M3).
- `src/trips/domain/trip-permission.constant.ts` (**novo**): `TRIP_REPORT_ON_BEHALF_PERMISSION`. A
  permissão aparecia como literal em três lugares, e o gateway de auditoria e as rotas do escritório
  passaram a importar a constante.
- Frontend: `trip.types.ts` e `tripResponse.validation.ts` aceitam `driverTaxId: null`. E-mail e
  telefone já aceitavam `null` na validação e agora aceitam também no tipo.
- `docs/adr/0067-*.md`: a emenda da T7 (o recorte no serializador e `allowed-actions` em rota
  própria).
- `tasks.md`: a T7b.

**Testes novos:**

- `test/trip-field-office/finance-read.contract.ts`:
  - `anyPermission` passa com qualquer uma das permissões e recusa sem nenhuma, a automação e o
    escopo de plataforma. Um `@ts-expect-error` prova que uma permissão só não compila.
  - A guarda de boot.
  - A lista **exaustiva** do que o `finance` alcança em viagem, frota, revisão e escritório.
  - 403 em `/fleet/drivers`, no feed, nos anexos do feed, na geometria (as duas rotas), em
    produtos, agendamento, prontidão fiscal e histórico de endereço.
  - `operator`, `separator` e `viewer` seguem alcançando as cinco leituras, e o `driver` não alcança
    nenhuma.
  - As cinco respondem 200 ao `finance`, pelo `route.execute` depois do `authorize`.
- `test/trip-http/driver-redaction.contract.ts`:
  - O `finance` recebe 200 com o nome e sem CPF, e-mail e telefone.
  - **Aceite 14:** o corpo não contém o CPF, o e-mail nem o telefone da fixture em lugar nenhum.
  - Com `fleet.read`, a ficha sai como antes.
  - Só com `trip.financials`, a resposta continua 403.
- Frontend `test/trip/driver-contact-redacted.contract.ts`: aceita os três campos nulos, recusa CPF
  com tipo errado e recusa o motorista sem nome.

**Testes existentes alterados, e por quê:**

- `test/driver-trip/me-routes.contract.ts` (L1/B6): "o papel `driver` não alcança nenhuma rota de
  viagem do escritório" lia `route.policy?.permission`, que é `undefined` nas cinco rotas com
  `anyPermission`. O teste agora pergunta ao `AuthorizationService` real, com o contexto do papel
  `driver`, e mantém `expect(route.policy).toBeDefined()`. A intenção é a mesma, e o teste ficou
  mais forte.
- `test/trip-domain/driver-contact.contract.ts`: é um teste que lê o texto do código-fonte. Ele
  procurava `driverEmail: driver.driverEmail`, e agora procura a forma com o recorte.
- `separator-role.contract.test.ts` **não foi editado** e continua verde: a lista exaustiva do
  separador ficou idêntica.

**Vermelho → verde** (os novos arquivos contra o `src` sem a T7.1):

- `bun test ./test/trip-field-office.contract.test.ts ./test/trip-http.contract.test.ts
./test/driver-trip.contract.test.ts` → `129 pass · 2 fail · 1 error`. O erro é
  `grantsAnyPermission` inexistente, e as falhas são o recorte e o 403 do `finance`.
- Com a T7.1: `155 pass · 0 fail`.
- Frontend `bun test ./test/trip.contract.test.ts`: antes `973 pass · 1 fail` ("aceita CPF, e-mail e
  telefone nulos"), depois `974 pass · 0 fail`.

**Gates:**

- `bun run typecheck` (raiz, 6 apps) → exit 0, com 0 `error TS`.
- `bun run lint` (raiz) → exit 0, com 0 erros.
- `bunx prettier --check .` → limpo.
- `bun run --cwd apps/api-transportada test` → `6453 pass · 32 skip · 0 fail`, 22512 `expect()`,
  179 arquivos. São +16 em relação à T6. Os 32 pulos são os mesmos de antes (integração sem
  `.env.test`).
- `bun run --cwd apps/frontend-transportada test` → `4321 pass · 0 fail`, 29 arquivos.
- De dentro de `apps/api-transportada`, com
  `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-field-office.integration.ts
./test/integration/trip-detail-query-count.integration.ts ./test/integration/me-trip.integration.ts
./test/integration/trip-repository.integration.ts` → `19 pass · 0 fail · 0 skip`, 153 `expect()`.

### T7.2 — `GET /trips/:id/allowed-actions`

**Arquivos:**

- `src/trips/domain/trip-allowed-actions.policy.ts` (**novo**, puro). `resolveTripAllowedActions`
  compõe `checkTripTransition` e `checkTripDocumentTransition`, sem tabela paralela:
  - Uma ação entra só se a máquina a aplicaria agora (`applied`).
  - O barracão (`trip.manage`) recebe `separate`, `load`, `planRoute`, `dispatch` e `cancel`, além
    de `occurrence`, que sai de `resolveOperatorTripActions` (M2).
  - A baixa (`trip.report-on-behalf`, e só com motorista na viagem) recebe `confirmLoad`,
    `startRoute`, `arrive`, a ocorrência de parada, `fieldDelivery`, `fieldReturn`, `fieldProof` e
    `fieldOccurrence`.
  - **Sem `deliver`/`return` do barracão (A1).**
  - `resolveTripHasRoute` espelha o SQL de `readRouteState`, ignorando a nota liberada e a nota
    devolvida sem parada (A2).
- `src/trips/application/read-trip-action-snapshot.use-case.ts` e
  `src/trips/infrastructure/trip-action-snapshot.query.ts` (**novos**): o recorte leve (estado,
  paradas, notas e contagem da tripulação), filtrado por `companyId`. Viagem de outra empresa
  responde 404 `TRIP_NOT_FOUND`.
- `src/trips/presentation/trip.routes.ts`: a rota nova, com `TRIP_FIELD_READ_POLICY`. As capacidades
  vêm das permissões do contexto (M1: rota própria, fora do detalhe).
- `src/main.ts`: a ligação.
- Frontend `src/modules/trip/shared/tripAllowedActions.validation.ts` (**novo**,
  `parseTripAllowedActions`, B4): forma estrita, ids de nota e de parada ⊆ os da viagem, e nome de
  ação desconhecido filtrado. A T8 é quem liga isso à tela.

**Testes:**

- `test/trip-allowed-actions.contract.test.ts` (**entrypoint novo**, listado no `package.json`) →
  `trip-allowed-actions/policy.contract.ts`:
  - Aceite 4.
  - A1, nos dois sentidos: o separador sem ação de rua, e o `finance` sem ação do barracão.
  - M2.
  - `unchanged` fora da lista.
  - Nota liberada e viagem sem motorista não recebem ação.
  - Viagem cancelada e viagem concluída.
  - A parada com e sem chegada.
  - Os dois toques da ADR-0058.
  - As quatro bordas de `resolveTripHasRoute`.
- `test/trip-http/allowed-actions.contract.ts`:
  - **Aceite 4 por HTTP:** o `operator`, em `on_delivery_route`, recebe `fieldDelivery` e
    `fieldReturn` na nota `loaded`, e não recebe `deliver`.
  - O separador recebe 200 sem ação de campo.
  - O `finance` recebe 200 só com a baixa.
  - Sem nenhuma das duas permissões, 403.
- `test/integration/trip-field-office.integration.ts` (estendido):
  - A2 contra o Postgres: `readRouteState` e `resolveTripHasRoute` concordam em cinco passos
    (viagem normal; + nota devolvida sem parada; + nota liberada sem parada; + nota viva sem parada;
    sem paradas).
  - O recorte da própria empresa, e `null` para outra empresa.
- Frontend `test/trip/allowed-actions-validation.contract.ts`.
- `test/trip-field-office/finance-read.contract.ts` e `separator-role.contract.test.ts`: as listas
  exaustivas ganham `GET /trips/:id/allowed-actions`, porque a rota é nova e a política é a mesma.
  No separador, a decisão ficou escrita ao lado da linha.

**Vermelho → verde:**

- `bun test ./test/trip-allowed-actions.contract.test.ts ./test/trip-http/allowed-actions.contract.ts`
  sem a política e a rota falhava com `Cannot find module '…/trip-allowed-actions.policy.js'` e 4
  falhas de HTTP (404, porque a rota não existia). Com a T7.2, passa verde.
- Frontend: antes `0 pass · 1 fail` (`Cannot find module …/tripAllowedActions.validation`), depois
  `978 pass · 0 fail` em `trip.contract.test.ts`.
- A primeira rodada verde mostrou um erro **meu** no contrato: a máquina **aplica** `separate` numa
  nota `loaded` antes do despacho (`checkDocumentOrigin`), então ela entra na lista. O contrato foi
  corrigido para afirmar isso e para confirmar que `load` (`unchanged`) não entra.

**Gates:**

- `bun run typecheck` (raiz) → exit 0, com 0 `error TS`.
- `bun run lint` (raiz) → exit 0, com 0 erros.
- `bunx prettier --check .` → limpo.
- `bun run --cwd apps/api-transportada test` → `6476 pass · 32 skip · 0 fail`, 22563 `expect()`,
  180 arquivos (+23 em relação à T7.1).
- `bun run --cwd apps/frontend-transportada test` → `4325 pass · 0 fail`.
- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-field-office.integration.ts
./test/integration/trip-lifecycle.integration.ts` → `13 pass · 0 fail · 0 skip`, 61 `expect()`.

### T7.3 — Os tipos de rua (L2) e a ocorrência em massa (D7, aceite 10)

**Arquivos:**

- `src/trips/presentation/trip-field-office-occurrence.routes.ts` (**novo**). Tem arquivo próprio
  porque `trip-field-office.routes.ts` já passava de 500 linhas, e a política, o caminho e a
  resolução do alvo são importados de lá. As rotas são:
  - `GET /trips/occurrence-types/field`: só `id` e `name` dos tipos ativos de rua.
  - `POST /trips/:id/documents/field-occurrences`: `{ documentIds (1..50, sem repetição),
occurrenceTypeId, note, driverId? }` e `Idempotency-Key` obrigatória. Responde `201` com
    `{ items: [{ documentId, id }] }` na ordem do pedido e grava uma linha em `audit_logs` com as
    notas em `metadata.documentIds`.
  - As duas usam `trip.report-on-behalf` (`OFFICE_REPORT_POLICY`).
- `src/trips/presentation/trip-field-office.schema.ts`: `parseOfficeFieldOccurrencesRequest`, com
  `MAX_BATCH_DOCUMENTS` exportado de `trip-request.schema.ts` (o mesmo 50 do `batch-status`). O
  schema é `.strict()`, sem `productCode`.
- `src/trips/application/register-office-document-occurrences.use-case.ts` (**novo**):
  - **Transação única, tudo ou nada.**
  - A3: tipo e alcance são validados dentro do `perform` do lote. O `recall` reconstrói os itens
    pelas reservas por nota, na ordem do pedido, e nunca devolve `null`. A marca `createdNow` é
    fechada no `perform` de cada nota.
  - Os avisos saem depois do commit, em `Promise.all`, só para o que foi criado nesta chamada.
- `src/trips/application/list-field-occurrence-types.use-case.ts` (**novo**).
- `src/trips/domain/occurrence-batch.policy.ts` (**novo**): a operação do lote carrega a impressão
  sha256 do conteúdo, e a chave de cada nota fica em espaço próprio,
  `batch:<sha256(chave)>:<documentId>`, com a `operation` exclusiva
  `office.document.occurrence-batch-item` (B1).
- `src/trips/infrastructure/drizzle-office-occurrence-batch.repository.ts` (**novo**): a unidade de
  trabalho do lote. Reusa `DrizzleDriverFieldReportTransaction`, que passou a ser exportada, para a
  reserva e a liquidação, e `findOccurrenceType`/`saveTripOccurrence` na mesma transação.
  `findReachableDocumentIds` aplica o recorte de `findDriverReachableDocument` numa consulta só, e
  só nas notas vivas.
- `src/trips/application/register-trip-occurrence.use-case.ts`: `notifyOccurrence` foi exportada
  com parâmetros em objeto, para não haver cópia da regra do aviso.
- M4 em três arquivos:
  - `src/trips/domain/occurrence-notification.policy.ts`: `documentId` entrou nos parâmetros do
    aviso.
  - `src/trips/infrastructure/occurrence-notifier.gateway.ts`: o `dedupeKey` usa o `documentId`
    no lugar do rótulo. Duas notas sem número de NF-e colapsavam num aviso só.
  - `src/main.ts`: a rota do galpão passa o `documentId`.
- `src/trips/domain/trip.error.ts`:
  - `OccurrenceTypeNotFieldError`: 422 `OCCURRENCE_TYPE_NOT_FIELD` (L4).
  - `TripDocumentNotReachableError` aceita `unreachableDocumentIds` e as devolve em `details`.
- `src/trips/application/trip-field-report.port.ts`: `withFieldReport` passou a exigir só
  `claim`/`settle` da transação. A mudança alarga o que ela aceita.
- `trip-field-office-audit.port.ts` e o gateway: `documentIds?` opcional em `metadata`.
- `src/main.ts`:
  - `occurrenceNotifier` virou uma instância só, usada pela rota do galpão e pelo lote. Antes a
    configuração era repetida.
  - `DrizzleOfficeOccurrenceBatchUnitOfWork` e as rotas novas foram ligadas.

**Testes:**

- `test/driver-trip/office-field-occurrences.contract.ts` (novo, em `driver-trip.contract.test.ts`):
  - Três notas geram três ocorrências `office`, em nome do motorista e na ordem do pedido.
  - Um aviso por nota. Tipo sem aviso não avisa, e o aviso que falha não derruba o lote.
  - Reenvio: mesmos ids e nenhum aviso novo.
  - **A3:** o reenvio depois de o tipo ser aposentado devolve o mesmo resultado.
  - Outro conteúdo ou outro ator com a mesma chave: 409.
  - **B1:** o espaço e a operação das chaves por nota.
  - Uma nota fora da viagem: 409 com `details`, zero gravado, zero reservas.
  - **L4:** tipo de separação, aposentado ou inexistente: 422.
  - A lista de tipos do escritório.
- `test/trip-field-office/occurrences-route.contract.ts` (novo, em `trip-field-office.contract.test.ts`):
  - A política das duas rotas.
  - Aceite 1 pelo `authorize` real: separador, motorista e `viewer` fora; `operator`, `finance` e
    `company-admin` dentro.
  - A fiação e o `audit_logs`.
  - 400 para lote vazio, 51 notas, nota repetida, campo a mais e falta de chave.
- `test/integration/trip-field-office.integration.ts` (estendido, Postgres):
  - **Aceite 10:** três notas geram três linhas `office` com o motorista de `position 1`. Elas
    aparecem em `listTripOccurrenceFeed`, que é o feed de `/ocorrencias`. São três avisos com três
    `dedupeKey` distintos, para quem despachou, e o `audit_logs` traz as notas. O reenvio devolve o
    mesmo corpo, sem linha nem aviso novo.
  - Uma nota de outra viagem desfaz o lote: 409 com `details`, zero ocorrências e zero reservas em
    `trip_field_reports`.
  - Viagem de outra empresa: 404, sem gravar.
- `test/trip-field-office/finance-read.contract.ts`: a lista exaustiva do `finance` ganha as duas
  rotas novas.
- `test/trip-occurrence/notification.contract.ts` e `template-key.contract.ts`: os parâmetros do
  aviso ganharam `documentId`, que agora é obrigatório (M4). A mudança é só na fixture.

**Vermelho → verde:**

- Os dois arquivos novos contra o `src` sem a T7.3:
  `bun test ./test/driver-trip.contract.test.ts ./test/trip-field-office.contract.test.ts` →
  `0 pass · 2 fail`. Dá `Cannot find module …/register-office-document-occurrences.use-case.js` e
  `…/trip-field-office-occurrence.routes.js`.
- Depois: `170 pass · 0 fail` (com `trip-occurrence.contract.test.ts`).
- No meio do caminho, um erro **meu** no contrato de borda: o parâmetro padrão do JavaScript
  engolia o `undefined` de "sem chave", e o caso respondia 201. Corrigi o teste para usar `null`
  como sentinela.

**Gates:**

- `bun run typecheck` (raiz) → exit 0, com 0 `error TS`.
- `bun run lint` (raiz) → exit 0, com 0 erros.
- `bunx prettier --check .` → limpo.
- `bun run --cwd apps/api-transportada test` → `6494 pass · 32 skip · 0 fail`, 22629 `expect()`,
  180 arquivos (+18 em relação à T7.2).
- `bun run --cwd apps/frontend-transportada test` → `4325 pass · 0 fail`. O frontend não foi tocado
  nesta etapa.
- De dentro de `apps/api-transportada`, com
  `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-field-office.integration.ts
./test/integration/me-trip.integration.ts ./test/integration/trip-field-authorship.integration.ts
./test/integration/field-trip-target.integration.ts ./test/integration/whatsapp-driver-flow-actions.integration.ts
./test/integration/whatsapp-operator-flow-actions.integration.ts` → `32 pass · 0 fail · 0 skip`,
  166 `expect()`, 6 arquivos. O motorista, o WhatsApp e as T3–T6 continuam verdes.

### Para as próximas tasks

- **T8:** o hook consome `GET /trips/:id/allowed-actions` com `parseTripAllowedActions`, passando
  os ids de nota e de parada do detalhe. Ele não lê `allowedActions` do detalhe. Na tela do
  `finance`, os painéis de geometria, agendamento, prontidão fiscal e produtos respondem 403 e
  precisam ficar ocultos, sem derrubar a tela.
- **T9:** o diálogo lista os tipos por `GET /trips/occurrence-types/field` e envia o lote com uma
  `Idempotency-Key` por abertura do diálogo. O 422 `OCCURRENCE_TYPE_NOT_FIELD` e o 409 com
  `details` (as notas inalcançáveis) precisam de texto na tela.
- **T7b:** o anexo do lote (`tasks.md`).
