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
- Os dois últimos foram resolvidos na spec 157 (`specs/157-tipos-de-ocorrencia-por-etapa/`).

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

## T7b

Anexo opcional da ocorrência em massa (D7 §3.5, decisão L3 da T7). A rota do lote
(`POST /trips/:id/documents/field-occurrences`) virou multipart: `documentIds` (campos repetidos),
`occurrenceTypeId`, `note`, `driverId?` e `file?`, validado pelo mesmo teto e tipos do canhoto do
escritório (`delivery-proof.policy.ts`: `DELIVERY_PROOF_MAX_BYTES`, `isDeliveryProofMimeType`).

**Migration aditiva:** `drizzle/20260918084711_trip_document_occurrence_attachment/` —
`trip_document_occurrences.attachment_object_id uuid null`, com FK composta
`(company_id, attachment_object_id)` para `stored_objects(company_id, id)`, no molde de
`trip_stop_occurrences.attachment_object_id`. `snapshot.json` gerado por `db:generate`; `rollback.sql`
escrito à mão (recusa se já houver linha com anexo). `purpose` reaproveitado: `delivery_proof` — é o
mesmo tipo de fato (foto de comprovante de campo), evitando alterar o CHECK de `stored_objects` só
para um rótulo novo.

**Um objeto, N referências.** `register-office-document-occurrences.use-case.ts` ganhou
`attachment?: OfficeOccurrenceAttachment` (`newObjectId`, `storage.store`, `upload`). O upload só
acontece dentro de `performBatch`, **depois** de validar tipo e alcance — um lote fadado a 409/422
nunca gasta uma chamada de armazenamento — e **antes** do laço por nota: `persistBatchAttachment`
sobe o arquivo (`attachment.storage.store`, o mesmo `createDeliveryProofStorage` do canhoto) e grava
`stored_objects` (`saveAttachmentObject`, status `final`) **uma vez**; o `objectId` resultante é
passado a cada `saveDocumentOccurrence`. Segue o padrão já em produção do canhoto do escritório
(`report-document-delivery.use-case.ts`, ADR-0067 §5 emenda: upload dentro da mesma transação do
registro, não um lease/`pending` à parte) — o T7-design.md §3.5 listava o lease como hipótese "seria
necessário"; a implementação reaproveitou o desenho já validado em produção em vez de introduzir um
segundo mecanismo de upload sem uso hoje.

**Idempotência do conteúdo.** `buildOccurrenceBatchOperation` (`occurrence-batch.policy.ts`) passou a
incluir `sha256Hex(upload.bytes)` na impressão do lote — a mesma chave com outra foto (ou com foto
onde antes não havia) é outro conteúdo, e cai no 409 `TRIP_FIELD_REPORT_KEY_REUSED` já existente,
sem lógica nova de conflito. Reenvio com a mesma chave e a mesma foto não chama `storage.store` de
novo (a `perform` nunca roda de novo — `recall` reconstrói pelas reservas).

**Nome do objeto sem PII:** `buildOccurrenceBatchAttachmentObjectKey` —
`tenants/<companyId>/trip-occurrence-attachments/<tripId>/<objectId>`, só ids opacos.

**Leitura pela mesma `anyPermission` (D11).** `GET /trips/:id/documents/:documentId/occurrences`
(`TRIP_FIELD_READ_POLICY`, a mesma das cinco rotas do `finance`) passou a embutir a URL assinada do
anexo na própria resposta (`attachment: { downloadUrl, expiresAt, mimeType } | null`), reaproveitando
`createDeliveryProofDownloadGateway` — **não** a rota genérica de anexos
(`TRIP_OCCURRENCE_FEED_ATTACHMENTS_PATH`), que segue em `TRIP_READ_POLICY` (`fleet.read`) e deixaria
o `finance` sem ver a própria foto. `delivery-proof-read.support.ts::listTripOccurrences` ganhou um
`leftJoin` em `stored_objects` para isso. `listTripOccurrenceAttachmentLocations`
(`trip-occurrence-feed.query.ts`) também passou a unir `trip_document_occurrences` — o design pedia
isso no §3.5 ponto 3, para a rota genérica de anexos continuar servindo ocorrência de nota também
(operador/admin, que têm `fleet.read`).

**Vermelho → verde:**

- `bun test ./test/driver-trip.contract.test.ts` sem o `saveAttachmentObject`/`attachment` no caso de
  uso: falha de tipo (`Property 'saveAttachmentObject' is missing`) — TDD pelo compilador, já que a
  mudança é de contrato de porta antes de comportamento.
- Testes novos em `test/driver-trip/office-field-occurrences.contract.ts` (describe `T7b`): um objeto
  só para N notas, lote sem foto grava `attachmentObjectId` nulo sem chamar o armazenamento, reenvio
  não reenvia nem duplica, outra foto com a mesma chave → 409, foto grande demais e tipo não
  suportado → 422 sem gastar a chave, lote inalcançável não sobe a foto.
- `test/trip-field-office/occurrences-route.contract.ts`: a rota virou multipart (campo `documentIds`
  repetido), incluindo o teste de que `file` vira `attachment` no caso de uso.
- `test/integration/trip-field-office.integration.ts`: teste novo "T7b (D7 §3.5)" contra Postgres —
  três notas com uma foto grava um `stored_objects` (`purpose: delivery_proof`, `status: final`)
  referenciado pelas três linhas de `trip_document_occurrences`; reenvio não chama o dublê de upload
  de novo nem duplica a linha; outra foto com a mesma chave responde
  `TRIP_FIELD_REPORT_KEY_REUSED`. MinIO local não foi exercitado — dublê de armazenamento no molde do
  `storage` de `wireRoutes` (mesmo usado por `field-delivery`/`field-proof` nesta suíte), registrado
  aqui por instrução da task.

**Gates:**

- `bun run typecheck` (raiz) → exit 0, 0 `error TS`.
- `bun run lint` (raiz) → exit 0, 0 erros.
- `bunx prettier --check .` → limpo (fora do escopo: arquivos `.omc/state/*.json` pré-existentes).
- De dentro de `apps/api-transportada`: `bun run test` → `6502 pass · 32 skip · 0 fail`, 22646
  `expect()`, 180 arquivos (+8 em relação à T7.3).
- `bun run db:check` → "Everything's fine". `db:generate` produziu
  `20260918084711_trip_document_occurrence_attachment/` com `snapshot.json`; `rollback.sql` escrito à
  mão. Migration + rollback testados: `DATABASE_URL=<...> bun --env-file=../../.env.test test
--timeout 120000 ./test/database-migration.contract.test.ts` → `61 pass · 0 fail`, e
  `test/database-migration/static-migration.contract.ts` atualizado com o novo diretório na lista
  estática.
- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-field-office.integration.ts` →
  `16 pass · 0 fail`, 74 `expect()` (o lote da T7.3 continua verde, mais o teste novo do anexo).
- `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/local-identity-seed.integration.ts ./test/database-migration.contract.test.ts` →
  `73 pass · 4 skip · 0 fail`.

## T8

`TripFieldActions`: conferir carga, iniciar rota, registrar chegada e ocorrência de parada, tudo
controlado por `GET /trips/:id/allowed-actions` (T7.2) — nunca por uma cópia da máquina de estados
no frontend. `canReadTrip` substitui `TRIP_READ_PERMISSION` cru em `useTripWorkspace.hook.ts`, e o
detalhe passa a funcionar para o `finance` sem `useFleet` derrubar nada (ele já se degradava
sozinho — o achado real era outro, ver "Decisões").

### Arquivos

**Novos:**

- `apps/frontend-transportada/src/modules/trip/shared/tripFieldActions.service.ts` —
  `resolveFieldActionCapabilities` (pura, falha fechada sem a lista), `resolveDefaultOnBehalfDriverId`
  (motorista de `position = 1`) e `hasMultipleDrivers`.
- `apps/frontend-transportada/src/modules/trip/hooks/useTripAllowedActions.hook.ts` — o hook pedido
  pela task: `useQuery` para `GET /trips/:id/allowed-actions`, devolvendo `canTrip`/`canStop`/
  `canDocument` via `resolveFieldActionCapabilities`. `useTripWorkspace.hook.ts` o consome (em vez de
  duplicar a consulta), expondo `fieldActionCapabilities` no controlador da página.
- `apps/frontend-transportada/src/modules/trip/components/TripFieldActions.component.tsx` — o painel
  novo, mesmo molde de `TripStateActions` (`actionForm`/`actionActions`), com o seletor de motorista
  (`@/components/ui/select`, só quando `hasMultipleDrivers`) e um `stopCard`/`stopCardHead` por parada
  alcançável — **não** `driverChecklist`/`driverLine` (ficha do motorista, layout em coluna): a
  primeira versão reusava esse primitivo e desalinhava rótulo com botão quando a parada tinha duas
  ações (achado da própria revisão de design, corrigido nesta task — ver "Revisão de design").
- `apps/frontend-transportada/src/modules/trip/components/TripConfirmDialog.component.tsx` —
  confirmação genérica sem campo de motivo (mesmo molde visual de `TripReasonDialog`), usada antes de
  "Iniciar rota" (ação irreversível, `web.md` §15).
- `apps/frontend-transportada/src/modules/trip/components/TripStopOccurrenceDialog.component.tsx` —
  ocorrência de **parada** (`TRIP_STOP_OCCURRENCE_KINDS`: atraso, cais fechado, cobrança inesperada,
  agendamento exigido, outra), não confundir com `FieldOccurrenceDialog` da T9 (ocorrência de **nota**,
  catálogo da empresa). Kind fixo, descrição, distância opcional, nota da parada opcional — sem foto:
  a rota real (`POST .../stops/:stopId/occurrences`) é JSON, sem multipart.

**Alterados:**

- `shared/trip.constant.ts` — `TRIP_REPORT_ON_BEHALF_PERMISSION` e `canReadTrip(permissions)`
  (`fleet.read` OU `trip.report-on-behalf`); `TRIP_FEEDBACK_KEY_BY_ERROR` ganhou
  `TRIP_WITHOUT_DRIVER`/`DRIVER_NOT_ON_TRIP`/`TRIP_FIELD_REPORT_KEY_REUSED`.
- `shared/trip.types.ts` — `TripFieldActionTarget`, `ConfirmLoadTripInput`, `StartFieldTripInput`,
  `FieldTripStepResult`, `ReportStopArrivalInput`, `STOP_OCCURRENCE_KINDS`/`StopOccurrenceKind`,
  `ReportStopOccurrenceInput`, `FieldReportIdResult`, `ReadTripAllowedActionsInput`.
- `shared/tripClient.service.ts` — `confirmLoadTrip`, `startFieldTrip`, `reportStopArrival`,
  `reportStopOccurrence`, `readTripAllowedActions` (usa `parseTripAllowedActions` direto, sem passar
  pelos adapters de `tripResponse.validation.ts`, porque ele precisa dos ids da própria viagem).
  `officeDriverSelectionBody` evita `body: undefined` explícito (`exactOptionalPropertyTypes`).
- `shared/tripResponse.validation.ts` — `fieldTripStepResultFromApi`/`fieldReportIdResultFromApi`
  (`isFieldTripStepResult`/`isFieldReportIdResult`).
- `hooks/useTripWorkspace.hook.ts` — `canReadTrip` no lugar de `TRIP_READ_PERMISSION` cru;
  `canReportOnBehalf` e `canReadTripFleetDetails` (recorte estrito de `fleet.read`, só para os
  painéis que continuam nele — ver "Decisões"); mutations `confirmLoadTripMutation`,
  `startFieldTripMutation`, `reportStopArrivalMutation`, `reportStopOccurrenceMutation` com
  `Idempotency-Key` gerada por ação e reusada no retry (`fieldReportKeysRef`, chave só se apaga no
  sucesso); `fieldActionCapabilities` via `useTripAllowedActions`.
- `components/TripDetail.component.tsx` — `TripFieldActions` entra logo depois de
  `TripStateActions`; a placa (`summaryLine`), `TripRouteMap` e `TripFiscalReadinessPanel` só
  renderizam com `canReadTripFleetDetails` (D11); os quatro erros novos entram em
  `resolveFirstTripFeedbackKey`.
- `locales/trip.locale.json` e `trip.en.locale.json` — namespace `fieldActions` (títulos, seletor de
  motorista, ocorrência de parada) e três chaves novas em `feedback`.

### Decisões

**`useFleet` já se degradava sozinho — o achado real era outro.** A task supunha que `useFleet`
quebraria para o `finance` sem `fleet.read`; na prática `createFleetController` já desliga cada
consulta por `canReadFleet` (`enabled: controller.canReadFleet`), então `vehicles` chega `[]` sem
erro. O defeito de verdade era **rio abaixo**: `describeVehicle` cai no `vehicleId` bruto (UUID) para
qualquer id fora da lista — que é sempre o caso para quem não tem `fleet.read`, já que a viagem não
traz placa nenhuma sem ela (D11, `driverTaxId`/e-mail/telefone já saem `null`, mas `vehicleId` não tem
substituto). Corrigido **omitindo a linha da placa** (`canReadFleetDetails`), não tentando exibi-la —
opção B do enunciado da spec ("placa pelo dado da viagem, ou omitida"), porque a viagem não carrega
placa nenhuma, só o UUID interno.

**`canReadTripFleetDetails`, recorte novo, separado de `canReadTrip`.** Geometria, agendamento,
prontidão fiscal e produtos continuam em `TRIP_READ_POLICY` (`fleet.read` puro) no backend — nunca
migraram para `TRIP_FIELD_READ_POLICY` (`anyPermission`, D11). Gatear esses painéis pelo `canReadTrip`
solto (a variante larga) mandaria o `finance` bater 403 sozinho contra cada um; gatear pelo
`canManageTrips` quebraria quem tem `fleet.read` sem `trip.manage` (separador, `viewer`), que já os
via. O recorte estrito (`permissions.includes('fleet.read')`, sem a variante `anyPermission`) é o
único que preserva os dois grupos.

**`useTripAllowedActions` como hook próprio, não inline em `useTripWorkspace`.** A task nomeia o
hook; a primeira versão inlinava a consulta dentro de `useTripWorkspace.hook.ts`. Extraído para
`hooks/useTripAllowedActions.hook.ts` (recebe `client` já pronto, sem instanciar outro) — mais fácil
de testar isolado e é exatamente o nome que a T9/T11 vão importar.

**Ocorrência de parada não tem foto, ao contrário do que o enunciado da task sugeria.** A rota real
(`POST /trips/:id/stops/:stopId/occurrences`, `parseOfficeStopOccurrenceRequest`) é JSON — `kind`
(enum fixo `TRIP_STOP_OCCURRENCE_KINDS`), `description`, `distanceMeters`, `documentId`, `driverId`.
O multipart com foto e a lista de `GET /trips/occurrence-types/field` são da **outra** ocorrência —
o lote **de nota** (`POST /trips/:id/documents/field-occurrences`, T7.3/T7b/D7), com o catálogo da
empresa. As duas rotas, os dois vocabulários e os dois modelos de dado são propositalmente
diferentes (uma é ocorrência de parada com tipo fixo da máquina; a outra é ocorrência de nota com
tipo cadastrado). Implementar T8 com o vocabulário da outra rota teria produzido um formulário que a
API real recusaria em produção. `GET /trips/occurrence-types/field` fica para a T9
(`FieldOccurrenceDialog`), como o próprio `evidence.md` da T7.3 já registrava ("Para as próximas
tasks").

**`confirm-load`/`start-route` não levam `Idempotency-Key`.** Conferido em
`trip-field-office.routes.ts`: só `arrive` e `occurrences` chamam `parseIdempotencyKey`. Os dois
toques da viagem são idempotentes pela própria máquina de estados (`changed: false` ao repetir), e a
task pede a chave "por ação" — aqui não há ação sujeita a duplicar evento.

**Idempotency-Key por escopo, não por clique.** `fieldReportKeysRef` (um `useRef<Record<string,
string>>` dentro de `useTripWorkspace`) gera a chave na primeira tentativa de `arrive`/`occurrence`
por parada e a mantém até o sucesso — clique de novo na mesma parada antes de resolver reusa a
mesma chave (retry); depois do sucesso, a chave cai e uma ação nova (outra parada, ou a mesma depois
de resolvida) gera outra.

### TDD

Contratos escritos e rodados **vermelho** antes da implementação (módulo inexistente):

- `test/trip/field-read-permission.contract.ts` → `canReadTrip`. Vermelho:
  `Cannot find module '.../trip.constant'` export `canReadTrip` — não existia. Verde após a T8.
- `test/trip/field-action-capabilities.contract.ts` → `resolveFieldActionCapabilities` (resposta
  ausente = falha fechada; aceite 4 na forma de capacidade — `fieldDelivery`/`fieldReturn` presentes
  quando `allowedActions` os lista), `resolveDefaultOnBehalfDriverId`, `hasMultipleDrivers`. Vermelho:
  `Cannot find module '.../tripFieldActions.service'`.
- `test/trip/field-error-mapping.contract.ts` → `TRIP_WITHOUT_DRIVER`/`DRIVER_NOT_ON_TRIP`/
  `TRIP_FIELD_REPORT_KEY_REUSED` mapeiam para chave de `feedback` presente nos dois locales. Vermelho:
  as três chaves caíam no `requestFailed` genérico antes desta task.

Registrados em `test/trip.contract.test.ts` (entrypoint já listado no `package.json` — nenhuma
entrada nova precisou entrar lá).

### Revisão de design (web.md §15)

Sem dev server com dados (sem Keycloak/API neste ambiente): a comparação foi feita renderizando um
recorte estático com o **CSS de produção real** (`bun run --cwd apps/frontend-transportada build`,
depois `apps/frontend-transportada/dist/assets/{index-CDGmFc6C,tripGuards-SpqO-gu_,select-B9ftldSd}.css`
servidos por um `http.server` local) e o `chromium` do `node_modules/.bun/playwright-core@1.58.2`,
tema escuro (único do produto), 1280×720 e 375×900.

**Achado corrigido na própria task:** a primeira versão do painel de paradas reusava
`driverChecklist`/`driverLine` (ficha do motorista — rótulo em cima, ações empilhadas **em coluna**
abaixo). Com duas ações na mesma parada, o botão de baixo ficava visualmente alinhado com o botão da
**próxima** parada, não com o rótulo dela — mesma altura, colunas diferentes, mas parecendo uma linha
só. Print antes: nenhum guardado (o defeito foi achado e corrigido na mesma sessão, sem publicar a
versão ruim). Trocado por `stopCard`/`stopCardHead`/`stopLabel` — o primitivo que `TripStopList` já
usa para "rótulo + ações na mesma linha, com quebra" — e o alinhamento passou a bater linha por
linha, cada parada no próprio cartão.

Prints finais, comparando `TripFieldActions` com o vizinho `TripStateActions` (mesmo `panel`/
`actionForm`, mesmos `ui-button` `default`/`secondary`/`ghost`, mesmo `Select` de campo, mesmo
`stopCard`):

- `specs/156-o-escritorio-da-baixa-pelo-motorista/prints/t8-field-actions-desktop.png` (1280×720)
- `specs/156-o-escritorio-da-baixa-pelo-motorista/prints/t8-field-actions-mobile.png` (375×900)

Conferido: borda, raio, fundo e contraste do painel batem com o vizinho no tema escuro; botões
usam os mesmos três primitivos (`default` copper, `secondary` outline, `ghost`) já usados ao lado;
ícones (`check`/`send`/`alert`) herdam `currentColor`; alvo de toque idêntico ao dos botões vizinhos
(mesmo `sm`, já auditado em telas existentes); sem scroll horizontal em 375px. Pendência explícita:
o print usa dados de fixture (não a tela real autenticada), porque este ambiente não tem Keycloak/API
disponíveis — a prova com dado real fica para a T16 (revisão final de design e usabilidade da spec).

### Gates

- `bun run typecheck` (raiz, 6 apps) → exit 0, sem `error TS`.
- `bun run lint` (raiz, 6 apps) → exit 0, sem saída de erro.
- `bun run --cwd apps/frontend-transportada test` → `4338 pass · 0 fail`, 37103 `expect()`,
  29 arquivos (13 a mais que a T7.2, todos os três contratos novos desta task, mais o crescimento de
  `trip.contract.test.ts`: `991 pass · 0 fail` isolado).
- `bun run --cwd apps/frontend-transportada build` → build limpo, PWA gerado (132 entradas
  precache), sem erro.
- Esta T8 é só frontend — sem rota nova na API, os gates de `apps/api-transportada` não se aplicam;
  a última rodada registrada (T7b) segue válida.

## L6a — `amounts` da listagem de viagens com recorte de `trip.financials`

Primeiro achado da L6. `GET /trips` (`TRIP_FIELD_READ_POLICY`: `fleet.read` ou
`trip.report-on-behalf`) publicava `amounts` — `documentsTotal` (soma das notas), `revenueTotal` e
`revenueSource` — sem checar `trip.financials`. `separator` e `viewer` viam receita e valor da carga
na tabela. É o único campo de dinheiro da linha: o resto é id, status, datas, veículo, `driverNames`
e a previsão de chegada.

### Decisões

- **O campo sai do objeto, não vira `null`** (spec 153 D10, mesmo molde de
  `redactTripDocumentMoney`). `amounts: null` já significa "a API não calculou", e a tabela o
  imprime como "sem valor" — seria afirmar que a carga não tem preço quando o que falta é a
  permissão.
- **Recorte no serializador**, como no detalhe: `redactTripAmounts` em
  `shared/monetary-redaction.service.ts`, com `permissions.has('trip.financials')`. A conta de
  receita (`readTripRevenueTotals`) continua rodando para quem não vê; cortar a consulta seria
  otimização de outra tarefa.
- **Frontend: as duas colunas de dinheiro saem** para quem não tem `trip.financials`
  (`visibleTripColumns`, exposta pelo `useTripTable` como `table.columns`), em vez de imprimir
  "sem valor" em toda linha. O validador (`isAbsentOrTripAmounts`) já aceitava ausente e `null`;
  ganhou contrato para não regredir.

### Arquivos

- API: `src/shared/monetary-redaction.service.ts` (`redactTripAmounts`),
  `src/trips/presentation/trip.routes.ts` (rota da listagem e tipo de retorno de `serializeTrip`),
  `test/fixtures/trip-http.fixture.ts` (`listTripsResult`), `test/trip-http/list.contract.ts`
  (usava `fleet.read` e esperava `amounts` — era o vazamento cristalizado; passou a
  `FINANCIALS_PERMISSIONS`), `test/trip-http/list-money-redaction.contract.ts` (novo),
  `test/trip-http.contract.test.ts`.
- Frontend: `src/modules/trip/shared/tripTable.service.ts` (`visibleTripColumns`),
  `src/modules/trip/hooks/useTripTable.hook.ts` (`columns`),
  `src/modules/trip/components/TripTable.component.tsx`, `test/trip/amount-columns.contract.ts`.

### Contratos (antes da implementação)

- API, `list-money-redaction.contract.ts`, com os papéis reais de `COMPANY_ROLE_PERMISSIONS`:
  `separator` e `viewer` sem a chave `amounts` (**falhou** antes do conserto: `2 fail`); `finance`,
  `operator` e `company-admin` com `amounts` inteiro.
- Frontend, `amount-columns.contract.ts`: `visibleTripColumns` sem `cargoValue`/`revenue` sem a
  permissão e com todas as colunas com ela (**falhou** antes: export inexistente); cabeçalho e
  células desenhados por `table.columns`; `tripListFromApi` aceita a linha sem `amounts`, com `null`
  e com o objeto, e recusa `amounts: {}`.

### Gates

- `make check` → exit 0, depois de rebase sobre `origin/staging` (`c5430a5f`): format, lint e
  typecheck das seis apps; API `6512 pass · 0 fail`, worker `1381 pass`, frontend
  `4342 pass · 0 fail` mais `5 pass` dos hooks com DOM, build com PWA.
- Integração com Postgres não se aplica: nenhuma query mudou.

### Revisão de design

`prints/l6-trip-list-viewer.png` (`fleet.read`) e `prints/l6-trip-list-finance.png`
(`fleet.read` + `trip.financials`), 1280 px, build de preview com a API mockada pelo helper do smoke.
Sem as duas colunas, a tabela redistribui a largura sem buraco, e cabeçalho, ordenação e botão "Ver"
seguem iguais aos da versão com dinheiro.

O esqueleto de carregamento (`TripsTableSkeleton`) ficou como pendência na primeira entrega e foi
fechado em seguida, na mesma L6a:

- Ele desenhava as seis colunas para todo mundo e, além disso, só **cinco** células por linha
  contra **sete** cabeçalhos: as duas colunas de dinheiro tinham entrado na tabela sem célula no
  esqueleto. Isso é anterior à L6.
- Agora ele recebe `columns` e desenha uma célula por coluna. Com a lista pedida, recebe o
  `table.columns` do `useTripTable`. No esqueleto de página inteira, que aparece antes de o
  `/auth/me` responder, recebe `visibleTripColumns({ canReadFinancials: false })`: sem saber a
  permissão, não anuncia coluna de dinheiro. Quem tem `trip.financials` vê as duas aparecerem quando
  a tela carrega.
- Contrato em `amount-columns.contract.ts` (falhou antes do conserto): a página não usa mais
  `TRIP_COLUMN_KEYS`, os dois esqueletos recebem as colunas, e cabeçalho e células mapeiam a mesma
  lista.
- Prints `prints/l6-trip-list-skeleton-viewer.png` (4 colunas + ações, 5 células) e
  `prints/l6-trip-list-skeleton-finance.png` (6 + ações, 7 células), com a lista mockada pendurada.
- `make check` → exit 0: API `6512 pass`, frontend `4377 pass` mais `7 pass` dos hooks, 0 falhas.

## T9

Linha do tempo com autoria (D3) e `FieldOccurrenceDialog` (uma nota ou o lote da seleção, D7,
aceite 10). A API já gravava `channel`/`on_behalf_of_driver_id` desde a T4 — esta task é a primeira
a **ler** isso: nenhuma leitura publicava autoria antes dela.

### Escopo confirmado por leitura, antes de implementar

Conferido antes de tocar em código (instrução da task): nenhuma leitura hoje expunha
`channel`/ator/`onBehalfOfDriverName`. Decisão de escopo, registrada aqui:

- **Ocorrência de nota** (`GET .../documents/:documentId/occurrences`, usada por `TripOccurrences`)
  e o **feed da empresa** (`GET /trips/occurrences`, `/ocorrencias`) ganharam autoria nesta task —
  são a leitura que `FieldOccurrenceDialog` alimenta e o que o aceite 10 cobra ("cada uma aparece em
  `/ocorrencias`").
- **`trip_document_events`/`trip_stop_events`** (a entrega/devolução/chegada em si) **não têm
  leitura nenhuma hoje** — nem antes nem depois desta task. Não existe endpoint que liste esses
  eventos; a T4/T5/T6 só os gravam. Promover a autoria deles a uma tela é trabalho novo de leitura
  (caso de uso, rota, tipo, validador), não uma extensão de duas linhas — fora do escopo desta task,
  registrado como achado.

### Arquivos

**API (aditivo, mesma resposta, campos novos):**

- `src/trips/application/register-trip-occurrence.use-case.ts`: `TripOccurrenceAuthorship`
  (`channel`, `actorName`, `onBehalfOfDriverName`), somada a `TripOccurrenceWithAttachment` (o tipo
  que `listTripOccurrences.execute` já declarava) — o tipo de escrita (`TripOccurrence` puro,
  `saveTripOccurrence`) não mudou, porque a rota de escrita não é uma leitura que a tela usa.
- `src/trips/application/trip-occurrence-feed.use-case.ts`: os mesmos três campos em
  `TripOccurrenceFeedItem`.
- `src/trips/infrastructure/delivery-proof-read.support.ts`: `listTripOccurrences` ganhou os
  `leftJoin`s — `userCompanyMemberships`/`identityUserProfiles` (ator, mesma janela de
  `ACTIVE_MEMBERSHIP_STATUS` que `nfe-documents` já usa para D16/H13, reaproveitada por import, não
  reescrita) e `fleetDrivers` (o motorista de `onBehalfOfDriverId`, por `companyId`).
- `src/trips/infrastructure/trip-occurrence-feed.query.ts`: os mesmos dois `leftJoin`s, replicados
  nas **duas** sub-consultas (`listDocumentOccurrenceRows` e `listStopOccurrenceRows` — a segunda já
  tinha `actorUserId`/`channel`/`onBehalfOfDriverId` na tabela, só não os lia).
- `test/trip-schema/occurrence-feed-query-tenant-safety.contract.ts`: a leitura estática que exige
  `and(eq(<tabela>.companyId, …` em toda junção ganhou uma exceção documentada — a junção com
  `identity_user_profiles` não tem `company_id` (é global, por `user_id`), e só é segura porque vem
  **depois** de uma junção com `userCompanyMemberships` já escopada pela empresa.

**Frontend (novos):**

- `src/modules/trip/components/FieldOccurrenceDialog.component.tsx` — o diálogo pedido pela task,
  no molde de `TripStopOccurrenceDialog` (T8): mesma estrutura de portal/overlay/`useModalDialog`,
  troca de vocabulário (tipo vindo de `GET /trips/occurrence-types/field`, não o `kind` fixo de
  parada) e de forma de envio (multipart, `FileField` do design system para a foto — **não** um
  `<input type="file">` cru, que o `test/design-system/file-field.contract.ts` recusa). Serve **uma**
  nota (`documentIds.length === 1`, ação da linha) e **várias** (a seleção existente, ação em massa)
  — o mesmo formulário, só o título/rótulo do botão mudam (`resolveFieldOccurrenceDialogMode`).
- `src/modules/trip/shared/fieldOccurrenceBatch.service.ts` — `MAX_FIELD_OCCURRENCE_DOCUMENTS` (o
  mesmo 50 da API, nunca um número solto de novo) e `resolveFieldOccurrenceDialogMode`.
- `src/modules/trip/shared/fieldOccurrenceAuthorship.service.ts` — `resolveFieldAuthorshipText`, a
  frase da timeline por canal (D3): `office` com os dois nomes, `driver_app` só com o do motorista
  (ele é o próprio ator), `whatsapp` sem nome nenhum (o canal não garante identidade resolvida do
  mesmo jeito que os outros dois). Ator sem vínculo ativo (`actorName: null`) cai no rótulo genérico
  — nunca imprime `null`/`undefined`/id cru.

**Frontend (alterados):**

- `shared/trip.types.ts` — `TRIP_FIELD_CHANNELS`/`TripFieldChannel` (cópia por valor da API),
  `TripOccurrence.channel`/`actorName`/`onBehalfOfDriverName` (os três **opcionais**, M1),
  `FieldOccurrenceType`, `RegisterFieldOccurrencesInput`.
- `shared/trip.constant.ts` — `TRIP_OCCURRENCE_OPTIONAL_KEYS`, `FIELD_OCCURRENCE_TYPE_KEYS`,
  `TRIP_FIELD_OCCURRENCE_TYPES_PATH`; `TRIP_FEEDBACK_KEY_BY_ERROR` ganhou
  `OCCURRENCE_TYPE_NOT_FIELD`/`TRIP_DOCUMENT_NOT_REACHABLE` (`TRIP_FIELD_REPORT_KEY_REUSED` já
  existia da T8, reusado sem código novo).
- `shared/tripResponse.validation.ts` — `isOccurrence` trocou `hasExactKeys` por `hasKeys` com a
  lista opcional (M1 — o mesmo padrão de `isStopDetail`/`isDetail`, nunca um afrouxamento livre);
  `isFieldOccurrenceType`; `fieldOccurrenceTypesFromApi`/`fieldOccurrenceBatchResultFromApi`
  (a resposta do lote, `{ items: [{ documentId, id }] }`, na ordem do pedido).
- `shared/tripClient.service.ts` — `authorizedRequest` ganhou `form?: FormData` (não existia
  suporte a multipart neste client antes; o padrão veio de `driverTripClient.service.ts`, o app do
  motorista); `readFieldOccurrenceTypes`, `registerFieldOccurrences` (monta o `FormData` com
  `documentIds` repetido, como a rota espera).
- `hooks/useTripWorkspace.hook.ts` — os dois métodos no `TripController`, gated por
  `canReportOnBehalf` (a mesma permissão de T8); `fieldOccurrenceTypesQuery` e
  `registerFieldOccurrencesMutation`, com `Idempotency-Key` por escopo do **lote** (a lista de notas
  ordenada), reusando `resolveFieldReportKey`/`clearFieldReportKey` da T8 em vez de um mecanismo
  próprio.
- `components/TripDetail.component.tsx` — estado único `fieldOccurrenceDocumentIds` (uma nota ou o
  maço da seleção) abre o mesmo diálogo; `documentActions.canFieldOccurrence`/`onOpenFieldOccurrence`
  (por nota); `canFieldOccurrenceBatch` computado da seleção para o botão em massa;
  `registerFieldOccurrencesMutation.error` entra em `resolveFirstTripFeedbackKey`.
- `components/TripStopList.component.tsx` — `TripStopDocumentActions.canFieldOccurrence` é
  **função**, não booleano (a capacidade varia nota a nota, `allowed-actions`), e
  `onOpenFieldOccurrence`; botão "Ocorrência" na linha, ao lado dos existentes.
- `components/TripStateActions.component.tsx` — `canFieldOccurrenceBatch`/
  `onOpenFieldOccurrenceBatch`; botão de lote (`stateActions.batchFieldOccurrence`) no mesmo grupo de
  `batchLoad`/`batchReturn`.
- `components/TripOccurrences.component.tsx` — a linha de cada ocorrência ganhou a frase de autoria
  (`resolveFieldAuthorshipText`), ausente (`null`) quando `channel` não veio (histórico anterior à
  ADR-0067, ou API antiga na janela do M1).
- `locales/trip.locale.json`/`trip.en.locale.json` — `occurrence.authorship.*` (as cinco frases),
  namespace `fieldOccurrence` (título, tipos, motorista, nota, foto, erros de lote), `actions.
fieldOccurrence`, `stateActions.batchFieldOccurrence`, e as duas chaves novas de `feedback`.

### Decisões

**Escrita não ganhou autoria, só a leitura.** A task pede "leituras que a tela usa"; `saveTripOccurrence`
(o `POST /trips/:id/documents/:documentId/occurrences` do galpão) continua devolvendo o tipo
`TripOccurrence` sem os três campos — ele não é consumido como "a tela mostra autoria" em lugar
nenhum, e adicionar os campos ali exigiria resolver nome de ator/motorista numa escrita que hoje não
precisa disso. Menor mudança que resolve exatamente o pedido.

**`identity_user_profiles` sem `company_id` é exceção documentada, não regra quebrada.** O contrato
estático de `trip-occurrence-feed.query.ts` (tenant safety por junção) existia antes desta task e
exigia `and(eq(...companyId,` em toda junção. A junção com o perfil do usuário não tem coluna de
empresa — é intencional (login é do realm inteiro, `identity-user-profile.schema.ts`) — e o teste
foi ajustado para reconhecer essa junção específica como segura **por transitividade**: ela só roda
depois de `userCompanyMemberships`, que já filtra pela empresa. Ajustar o teste em vez de forçar uma
junção artificial com `company_id` inexistente.

**`FieldOccurrenceDialog` usa `FileField`, não `<input type="file">` cru.** A primeira versão usava o
input nativo; `test/design-system/file-field.contract.ts` (varredura estática por
`type="file"` fora da lista de exceções) reprovou. Trocado pelo componente do design system — mesmo
usado por `DriverStopCard`/`NfeUploadPanel` — com `label`/`actionLabel`/`placeholder` separados
(rótulo do campo, texto do botão, texto vazio), não os três reaproveitando o mesmo texto (achado da
própria revisão de design, corrigido antes do print final).

**`canFieldOccurrence` é função por nota, não booleano do painel.** Ao contrário de `canDeliver`/
`canReturn` (globais, decididos pelo status da nota inteira), a capacidade de ocorrência de campo
vem de `allowed-actions` por documento — duas notas na mesma parada podem divergir. Um booleano só
mostraria o botão em todas ou nenhuma.

**O botão de lote mora em `TripStateActions`, então segue o gate de `canManage`.** A task pediu
"ação em massa na seleção existente de notas... TripStateActions" — e esse componente só renderiza
com `trip.manage`. Quem tem só `trip.report-on-behalf` sem `trip.manage` (hipoteticamente um
`finance` sem mais nada) não veria o botão de lote, só a ação por linha via `TripFieldActions`/
`TripStopList` — mas isso não vale para o caso real de hoje: a ADR-0067 concede
`trip.report-on-behalf` a `admin`, `operator` e `finance`, e `operator`/`admin` já têm `trip.manage`.
Registrado aqui porque é uma decisão de leitura da task, não um contrato testado.

### Achado fora do escopo (registrado, não corrigido nesta task)

**Não há leitura de `trip_document_events`/`trip_stop_events` (entrega, devolução, chegada) em
lugar nenhum da API.** A T9 promete "linha do tempo com autoria" e a spec fala em "eventos/ocorrências
da viagem e da nota" — mas a única coisa que a tela lê hoje é _ocorrência_ (nota e feed), nunca o
evento de entrega/devolução em si, porque não existe endpoint para isso. Adicionar autoria a um
evento que ninguém lista seria enfeite morto. Sinalizado como tarefa separada, fora da spec 156.

### TDD

- `apps/api-transportada/test/integration/trip-field-office.integration.ts`, teste "aceite 10: três
  notas..." (T7.3) — estendido com as asserções novas desta task: `feed.items` trazem
  `channel: 'office'`, `onBehalfOfDriverName: 'Motorista Um'` e `actorName: null` (a fixture não
  semeia `identity_user_profiles` para o ator — sem vínculo com nome resolvido, é `null`, nunca o id
  cru); `listTripOccurrences` (a leitura de `GET .../occurrences`) confirma os mesmos três campos.
  Como `channel`/`actorName`/`onBehalfOfDriverName` não existiam nessas leituras antes da task, o
  teste teria falhado por `undefined`/chave ausente contra o `src` anterior — confirmado pela
  exploração prévia (nenhuma leitura publicava esses campos), não por reversão e re-execução.
- Frontend, `test/trip/field-occurrence-validation.contract.ts`: `occurrencesFromApi` aceita a
  ocorrência sem os três campos novos (API antiga, M1), aceita com `actorName: null` (ator sem
  vínculo, nunca id cru), recusa `channel` fora do vocabulário e recusa chave desconhecida;
  `fieldOccurrenceTypesFromApi`/`fieldOccurrenceBatchResultFromApi` (o catálogo e o resultado do
  lote, na ordem do pedido).
- `test/trip/field-occurrence-authorship.contract.ts`: as cinco frases de autoria por canal,
  inclusive o caso "office sem vínculo ativo do ator" (nunca imprime `null`/`undefined`), e a
  presença das cinco chaves nos dois idiomas.
- `test/trip/field-occurrence-error-mapping.contract.ts`: `OCCURRENCE_TYPE_NOT_FIELD`/
  `TRIP_DOCUMENT_NOT_REACHABLE` mapeiam para `feedback` com texto nos dois idiomas.
- `test/trip/field-occurrence-dialog.contract.ts`: modo do diálogo (uma nota vs. lote) e o teto de
  50 notas (`isWithinFieldOccurrenceLimit`), o mesmo número da API.
- Todos os quatro registrados em `test/trip.contract.test.ts` (o entrypoint listado no
  `package.json`), rodando contra o `src` sem a implementação primeiro: `Cannot find module
'.../fieldOccurrenceAuthorship.service'`/`'.../fieldOccurrenceBatch.service'` e `occurrencesFromApi`
  recusando `channel`/`actorName` (chave desconhecida, `hasExactKeys` da T7.3) — vermelho confirmado
  antes de escrever `fieldOccurrenceAuthorship.service.ts`/`fieldOccurrenceBatch.service.ts` e trocar
  `isOccurrence` para `hasKeys`. Depois: verde, ver "Gates".

### Revisão de design (web.md §15)

Mesma limitação da T8 registrada aqui de novo: sem dev server com dados neste ambiente (sem
Keycloak/API/seed disponíveis para navegar a tela real). A comparação foi feita com o **CSS de
produção real** (`bun run --cwd apps/frontend-transportada build`, servido por `http.server` local)
e o `chromium` de `node_modules/.bun/playwright-core@1.58.2`, tema escuro (único do produto),
1280×720 e 375×900 — exatamente o recorte que a T8 documentou, com as classes hasheadas reais
extraídas do CSS gerado (`_mdfeGateDialog_183z4_315`, `_trigger_1psko_14`, `_field_hi3w5_1` etc.),
não nomes inventados.

**Achado corrigido na própria task:** a primeira versão do campo de foto reaproveitava o mesmo texto
para `label`, `actionLabel` e `placeholder` do `FileField` ("Foto (opcional)" repetido três vezes na
tela). Corrigido para o padrão que `DriverStopCard`/`NfeUploadPanel` já usam: rótulo do campo,
"Escolher foto" no botão, "Nenhuma foto escolhida" no vazio, com a explicação do lote
("uma foto vale para todas as notas") como legenda própria abaixo — sem repetição.

Prints, comparando `FieldOccurrenceDialog` com o vizinho `TripStopOccurrenceDialog` (mesmo
`_mdfeGateOverlay_`/`_mdfeGateDialog_`/`_mdfeGateHeader_`/`_mdfeGateFooter_`, mesmo `Select`,
`ui-button` `default`/`ghost`):

- `specs/156-o-escritorio-da-baixa-pelo-motorista/prints/t9-field-occurrence-dialog-desktop.png`
  (1280×720)
- `specs/156-o-escritorio-da-baixa-pelo-motorista/prints/t9-field-occurrence-dialog-mobile.png`
  (375×900)

Conferido: borda copper, raio e fundo do diálogo idênticos ao vizinho; `Select` com o mesmo
`_trigger_`/`_chevron_`; `FileField` com a mesma altura de campo dos outros usos no produto; botão
primário copper e ghost secundário; sem scroll horizontal em 375px; alvo de toque `sm` igual ao
resto da tela. Pendência explícita (mesma da T8): print contra a tela **real** com dado de
verdade — inclusive o texto de autoria (`Marina Alves (escritório) pelo motorista João Pereira`,
mockado no recorte) — fica para quando houver ambiente com Keycloak/seed disponível nesta sessão.

### Gates

- `bun run typecheck` (raiz, 6 apps) → exit 0, sem `error TS`.
- `bun run lint` (raiz, 6 apps) → exit 0, sem saída de erro.
- `bun run --cwd apps/api-transportada test` → `6502 pass · 32 skip · 0 fail`, 22646 `expect()`,
  180 arquivos (sem mudança de contagem de arquivo — os campos novos entraram em teste de integração
  existente, não um arquivo unitário novo).
- `bun --env-file=../../.env.test test --timeout 120000` de dentro de `apps/api-transportada`, com
  `./test/integration/trip-field-office.integration.ts ./test/integration/trip-lifecycle.integration.ts
./test/integration/me-trip.integration.ts` → `23 pass · 0 fail · 0 skip`, 141 `expect()`.
- `bun run --cwd apps/frontend-transportada test` → `4359 pass · 0 fail`, 37145 `expect()`,
  29 arquivos (+21 em relação à T8, os quatro contratos novos desta task).
- `bun run --cwd apps/frontend-transportada build` → build limpo, PWA gerado, sem erro.

## T10

**Escopo:** `canhotoIdentification.service.ts` (D6, aceite 6) — função pura que classifica a foto do
canhoto contra a nota pedida no passo, a seleção do lote e as notas da viagem. Nenhuma chamada de
rede, nenhuma gravação: a foto **sugere**, quem confirma é a pessoa (ADR-0067 §4).

### Decisões tomadas nesta task

- **Formato da chave no código de barras:** o código de barras da DANFE é Code128, sempre numérico
  (o próprio gerador do produto, `code128.service.ts`, assume Code128-C). Por isso a validação usa
  `^\d{44}$`, diferente do `NFE_ACCESS_KEY_PATTERN` alfanumérico de `nfeAccessKey.service.ts`
  (usado para QR/link colado, onde o CNPJ do emitente pode ter letra desde a IN RFB 2229/2024). São
  dois formatos de entrada distintos com a mesma origem de dado — mantidos em módulos separados de
  propósito, para não misturar a régua do link colado com a do código impresso.
- **Dígito verificador:** reimplementado o módulo 11 (pesos 2→9, direita para a esquerda) em vez de
  importar `@adatechnology/fiscal-provider` — o bundle do frontend não carrega o pacote (mesma razão
  já registrada em `nfeAccessKey.service.ts`). Conferido manualmente com chaves geradas em Python
  usando o mesmo algoritmo do `SefazTaxId.ts` do pacote, para garantir que o cálculo bate.
- **`onTripNotSelected` (a decisão pendente que a task pedia para registrar):** nota que pertence à
  viagem mas está fora do lote marcado **bloqueia**, com o `documentId` da nota encontrada — nunca é
  incluída sozinha na seleção. Só `otherSelected` oferece trocar, e troca só acontece **dentro** do
  que já está marcado. Justificativa: o assistente decidir incluir uma nota nova no lote a partir de
  uma foto seria o mesmo "decidir sozinho" que a ADR-0067 §4 proíbe para o próprio registro da
  entrega — a composição do lote é decisão de quem está operando, não da leitura da foto.
- **Rótulo da nota fora da viagem:** reaproveita `tripDocumentLabel` (já usado na listagem de
  entregas, `tripDocument.service.ts`) para montar "número/série" a partir do que a chave revelou,
  em vez de duplicar a formatação — mesmo texto que a pessoa já vê em qualquer outra tela do
  produto.

### TDD

Contrato escrito antes: `test/trip/canhoto-identification.contract.ts`, importado por
`test/trip.contract.test.ts` (arquivo já na lista do `package.json`, nenhuma entrada nova
necessária ali). Rodado isolado antes da implementação — falhava com `Cannot find module
'@/modules/trip/shared/canhotoIdentification.service'` (arquivo ainda não existia) — e voltou verde
depois de `src/modules/trip/shared/canhotoIdentification.service.ts` escrito.

Cobertura:

- **Classificação por texto** (sem imagem): chave da nota pedida (`matched`), chave de outra nota da
  seleção (`otherSelected`), chave de nota fora da viagem (`notOnTrip`, com `documentLabel`
  `"99999/1"`), chave de nota da viagem fora da seleção (`onTripNotSelected`), dígito verificador
  errado (`unreadable`), modelo 65/NFC-e (`unreadable`), lixo sem formato de chave (`unreadable`),
  ausência de código — canhoto destacado sem código de barras (`unreadable`), e
  `parseNfeAccessKeyFromBarcode` extraindo número/série sem zero à esquerda.
- **Fixtures de imagem sintética de DANFE**, passando pelo `decodeBarcodeFrame` real (zxing): legível
  da nota pedida, de outra nota da seleção, de nota fora da viagem, e canhoto sem código de barras
  (quadro em branco). `@zxing/library` 0.23.0 (versão instalada) não expõe `Code128Writer` — só
  leitores —, então o fixture (`test/fixtures/canhotoBarcodeFrame.fixture.ts`) reaproveita o
  gerador manual que **já existe no produto**, `encodeCode128C` de `code128.service.ts` (usado hoje
  para desenhar o código de barras na tela/romaneio), convertendo as larguras em módulos que ele
  devolve para um `Uint8ClampedArray` de luminância (`BarcodeFrame`), sem depender de PNG nem de
  canvas — determinístico e sem I/O.

### Gates

- `bun run typecheck` (raiz, 6 apps) → exit 0, sem `error TS`.
- `bun run lint` (raiz, 6 apps) → exit 0, sem saída de erro (um ajuste no meio do caminho: `new
Array(n).fill(x)` tipava `any[]` sob `@typescript-eslint/no-unsafe-assignment`; trocado por
  `Array.from<number>({ length: n }).fill(x)` no fixture).
- `bun run --cwd apps/frontend-transportada test` → `4376 pass · 0 fail`, 37169 `expect()`,
  29 arquivos (mesma contagem de arquivo da T9 — o contrato novo entrou dentro de `trip.contract.test.ts`
  via `import`, não como entrada nova do `package.json`) + `test:hooks` `5 pass · 0 fail`.

### Arquivos

- `apps/frontend-transportada/src/modules/trip/shared/canhotoIdentification.service.ts` (novo)
- `apps/frontend-transportada/test/trip/canhoto-identification.contract.ts` (novo)
- `apps/frontend-transportada/test/fixtures/canhotoBarcodeFrame.fixture.ts` (novo)
- `apps/frontend-transportada/test/trip.contract.test.ts` (import acrescentado)

## T8b

Remove o caminho antigo de entrega/devolução do escritório (sem autoria, `trip.manage`) e deixa só
o caminho novo com autoria (`field-delivery`/`field-return`, `trip.report-on-behalf`), acionado
pelos botões "Entregar"/"Devolver" da tela.

### T8b.1 — `findDriverReachableDocument` filtra `releasedAt`

Achado B2 da validação da T7: `findDriverReachableDocument`
(`apps/api-transportada/src/trips/infrastructure/delivery-proof-read.support.ts`) não filtrava
`isNull(tripDocuments.releasedAt)` no `where`, ao contrário de `findReachableDocumentIds`
(`drizzle-office-occurrence-batch.repository.ts`, já correta) e de `findDocumentForDriver`
(`drizzle-driver-field-report.repository.ts`, usada por entrega/devolução, já correta). Uma nota
liberada da viagem (`markCancelled`, revisão de layout) continuava respondendo alcançável para
`registerDriverOccurrence` enquanto a viagem seguia em estado ativo.

**Achado da investigação, registrado antes da correção:** `findDriverReachableDocument` só é
alcançada, na composição real (`main.ts:738` e `main.ts:2439`), pelo motorista — `/me` (PWA) e o
fluxo do WhatsApp —, nunca pelo escritório. O escritório usa `findReachableDocumentIds` (lote de
ocorrências, já filtrava) e `findDocumentForDriver` (entrega/devolução via
`report-document-delivery.use-case.ts`, já filtrava). A frase da task ("e o escritório, pelo mesmo
helper") descreve o vocabulário compartilhado (`FieldTripTarget`, que aceita `kind: 'trip'` do
escritório e `kind: 'driver'` do motorista) — não um caminho de produção hoje alcançado pelo
escritório por esta função específica. Corrigido do mesmo jeito: defesa em profundidade, e o teste
cobre os dois `kind` do alvo, não só o que a produção usa hoje.

### Arquivos

**Alterados:**

- `apps/api-transportada/src/trips/infrastructure/delivery-proof-read.support.ts` — importa `isNull`
  de `drizzle-orm`; `findDriverReachableDocument` ganha `isNull(tripDocuments.releasedAt)` no
  `where`, no mesmo lugar de `findReachableDocumentIds`. Comentário da função atualizado para citar
  as duas funções irmãs e a spec 156 T8b.1.
- `apps/api-transportada/test/integration/field-trip-target.integration.ts` — novo teste "nota
  liberada da própria viagem não é alcançável, nem pelo motorista nem pelo escritório (T8b.1)":
  libera a nota (`UPDATE trip_documents SET released_at`), confirma `findDriverReachableDocument`
  responde `null` para `target: { kind: 'driver' }` e para `target: { kind: 'trip' }`, e confirma que
  uma segunda nota da mesma viagem, não liberada, continua alcançável (não é regressão de tenant).

### TDD

Vermelho confirmado revertendo a linha `isNull(tripDocuments.releasedAt)` e rodando só o teste novo:

```
(fail) o alvo trip do escritório contra o Postgres (spec 156 T3) > nota liberada da própria viagem
não é alcançável, nem pelo motorista nem pelo escritório (T8b.1)
expect(received).toBeNull()
Received: { tripId: "05322028-b6ee-4b9d-9970-0ccaaa091fa9" }
```

Verde depois de restaurar o `isNull`: `6 pass · 0 fail` em `field-trip-target.integration.ts`.

### Gates

- `bun run --cwd apps/api-transportada typecheck` → exit 0.
- `bun run --cwd apps/api-transportada test` → `6504 pass · 0 fail · 32 skip`, 22643 `expect()`.
- Integração (`bun --env-file=../../.env.test test --timeout 120000`, dentro de
  `apps/api-transportada`): `field-trip-target.integration.ts`, `me-trip.integration.ts`,
  `trip-field-office.integration.ts`, `trip-field-authorship.integration.ts`,
  `trip-repository.integration.ts`, `whatsapp-driver-flow-actions.integration.ts` →
  `34 pass · 0 fail`, 0 skip.

### T8b.2 — Só o caminho com autoria fica

Achado B2 da validação da T7 e decisão do usuário na conversa: em vez de conceder
`trip.report-on-behalf` a mais papéis ou fechar `trip.manage` no separador, o caminho antigo
(entrega/devolução sem autoria) saiu por inteiro. `separate`/`load` continuam — são trabalho de
galpão, não de campo.

### Arquivos

**Backend (`apps/api-transportada`), alterados:**

- `src/trips/presentation/trip.routes.ts` — saíram as duas chamadas a `tripDocumentActionRoute` para
  `deliver`/`return` (e `TRIP_DOCUMENT_DELIVER_PATH`/`TRIP_DOCUMENT_RETURN_PATH`), os dois campos
  `deliverTripDocument`/`returnTripDocument` de `RouteDependencies` e o comentário sobre a rota antiga.
  `separate`/`load` continuam na mesma `tripDocumentActionRoute`. Comentário de cabeçalho atualizado
  para explicar por que as duas saíram (ADR-0067, spec 156 T8b) no lugar do comentário obsoleto da
  ADR-0043 que já não descrevia o código real (achado da investigação: o comentário antigo dizia que
  `deliver` "não ganha rota individual", quando na verdade tinha ganhado uma havia meses).
- `src/trips/presentation/trip-request.schema.ts` — `TRIP_DOCUMENT_ACTIONS` de
  `['deliver', 'load', 'return', 'separate']` para `['load', 'separate']`; `returnReason` saiu de
  `transitionTripDocumentSchema` (só servia a rota `/return`, que não existe mais) e de
  `batchTransitionTripDocumentsSchema` (o lote não aceita mais `return`, logo o motivo nunca chega).
- `src/trips/application/trip-lifecycle.use-case.ts` — as chaves `deliver`/`return` do objeto
  retornado por `createTripLifecycleUseCase` saíram (`document('deliver')`/`document('return')`);
  `transitionTripDocument` (o motor genérico) e `separate`/`load` continuam intactos — ele também
  segue servindo o lote (`transitionTripDocumentsBatch`, que nunca dependeu dessas duas chaves).
- `src/main.ts` — a fiação de `deliverTripDocument`/`returnTripDocument` (chaves de
  `createTripRoutes`) saiu; nenhum outro caminho as usava.

**Backend, testes alterados:**

- `test/fixtures/trip-http.fixture.ts` — `deliverTripDocument`/`returnTripDocument` saíram do tipo
  `RouteDependencies`, do `CreateFixtureParams`, do retorno da fábrica e da implementação.
- `test/trip-http/documents.contract.ts` — `'delivers a linked document through the state machine'`
  virou `'the old individual deliver route no longer exists'`: mesma chamada, `expect(status).toBe(404)`
  no lugar de 200.
- `test/trips/routes.contract.ts` — `'returns a document, forwarding the reason'` virou
  `'the old individual return route no longer exists'` (mesma troca 200→404); o `objectContaining` do
  teste de lote parou de afirmar `returnReason: null` (campo que não existe mais no corpo); novo
  `test.each(['deliver', 'return'])('refuses a batch with the retired action %s', …)` confirma 400 e
  zero chamadas ao use case.
- `test/trip-http/security.contract.ts` — as duas asserções que usavam `tripDocumentDeliverPath()`
  como uma das "cinco rotas de escrita" passaram a usar `tripDocumentSeparatePath()` (que continua
  exigindo `trip.manage`), preservando a cobertura das cinco rotas sem depender de uma rota que saiu.
- `test/separator-role.contract.test.ts` — `'POST /trips/:id/documents/:documentId/deliver'` e
  `.../return'` saíram da lista exaustiva do que o `separator` alcança.
- `test/trip-delivery-proof/orphan-deliver.contract.ts` — o teste que afirmava
  `main).toInclude('tripLifecycle.deliver.execute')` (a segunda geração da rota, que a T8b também
  matou) virou `not.toInclude`, e ganhou a mesma asserção para `tripLifecycle.return.execute`.

**Frontend (`apps/frontend-transportada`), novos:**

- `src/modules/trip/components/TripReturnReasonDialog.component.tsx` — mesmo molde visual de
  `TripReasonDialog`, com `@/components/ui/select` sobre `DRIVER_RETURN_REASONS` (copiado por valor
  do módulo `driver-trip`, mesma cópia que o app do motorista já usa) no lugar do campo de texto
  livre — `field-return` exige um enum, não uma frase.
- `src/modules/trip/shared/tripFieldActionQueue.service.ts` — `runFieldActionQueue`, fila de
  concorrência limitada por item (não por fatia, ao contrário de `runEmissionQueue` do
  `nfe-workspace`, que inspirou o desenho): uma `field-return` por nota, concorrência 3, falha
  isolada não derruba as irmãs.
- `test/trip/field-office-retired-routes.contract.ts` — `TRIP_BATCH_ACTIONS`/
  `TRIP_DOCUMENT_TRANSITION_ACTIONS` não voltam a listar `deliver`/`return`; o texto-fonte do client
  não contém mais `/deliver`\` nem `deliverTripDocument`, e contém `/field-delivery`\`/`/field-return`\`.

**Frontend, alterados:**

- `shared/trip.types.ts` — `TRIP_DOCUMENT_TRANSITION_ACTIONS`/`TRIP_BATCH_ACTIONS` para
  `['load', 'separate']`; `returnReason` saiu de `TransitionTripDocumentInput`/`BatchStatusInput`;
  `FieldDeliverDocumentInput`, `FieldReturnDocumentInput` (`reason: DriverReturnReason`, importado do
  módulo `driver-trip` — cruzar módulos dentro do mesmo app já é padrão aqui, ex. `fleet.types`) e
  `FieldSettlementResult` (`{ alreadySettled, id, stopCompleted, tripCompleted }`, o formato comum de
  `field-delivery`/`field-return`, T6).
- `shared/tripClient.service.ts` — `authorizedRequest` ganhou `form?: FormData` (mesmo padrão de
  `driverTripClient.service.ts`: o `content-type` do multipart só o `fetch` sabe montar);
  `deliverTripDocument` saiu; `fieldDeliverDocument` (multipart: `deliveredAt`, `driverId?`) e
  `fieldReturnDocument` (JSON: `driverId?`, `reason`, `returnedAt?`) entraram, os dois com
  `idempotencyKey`; `readFieldSettlementResult` valida a resposta comum; `batchStatus`/
  `transitionTripDocument` pararam de mandar `returnReason`.
- `hooks/useTripWorkspace.hook.ts` — `deliverDocumentMutation` saiu; `fieldDeliverDocumentMutation`/
  `fieldReturnDocumentMutation` entraram, reusando `resolveFieldReportKey`/`clearFieldReportKey` (T8)
  com escopo `fieldDeliver:${documentId}`/`fieldReturn:${documentId}`; `batchFieldReturnMutation`
  roda `runFieldActionQueue` (concorrência 3) chamando `fieldReturnDocument` por nota, cada uma com a
  própria chave de idempotência.
- `components/TripStopList.component.tsx` — `TripStopDocumentActions` trocou `canDeliver`/`canReturn`/
  `onDeliver`/`onReturn` por `capabilities: FieldActionCapabilities` (o mesmo tipo que
  `TripFieldActions`, T8, já consome) e `onFieldDeliver`/`onFieldReturn`; os botões usam
  `capabilities.canDocument(document.id, 'fieldDelivery'|'fieldReturn')` — nunca mais
  `canManage && canDeliver`.
- `components/TripStateActions.component.tsx` — `canReturn: boolean` (derivado de
  `canReturnDocuments(trip.status)`) virou `capabilities: FieldActionCapabilities` +
  `canReturnSelection` (`ao menos uma nota selecionada aceita fieldReturn`); `onBatch` perdeu a ação
  `'return'`/`returnReason` (só `load`/`separate` seguem em lote via `batch-status`); `onBatchReturn`
  entrou, chamado pelo novo diálogo de motivo fechado.
- `components/TripDetail.component.tsx` — `documentActions` reconstruído em cima de `capabilities`;
  `handleReturnSubmit` chama `fieldReturnDocumentMutation`; `handleBatch` só repassa `load`/`separate`;
  `handleBatchReturn` novo filtra a seleção por `canDocument(…, 'fieldReturn')` e dispara
  `batchFieldReturnMutation`; seletor de motorista (`selectedOfficeDriverId`, usando
  `resolveDefaultOnBehalfDriverId`/`hasMultipleDrivers` de `tripFieldActions.service.ts`, o mesmo
  seletor que `TripFieldActions` já usa) aparece só com mais de um motorista, acima da lista de
  paradas, e alimenta `field-delivery`/`field-return` da linha e do lote.
- `shared/tripStatus.service.ts` — `canDeliverDocuments`/`canReturnDocuments` saíram: a porta de rua
  deixou de existir no cliente, porque `allowedActions` (resolvido pelo servidor) é quem decide agora.
- `locales/trip.locale.json`/`trip.en.locale.json` — `fieldActions.returnReason.*` (cinco chaves,
  cópia dos rótulos que `driverTrip.locale.json` já usa para os mesmos `DRIVER_RETURN_REASONS`).

### Decisões

**`findDriverReachableDocument` não é chamada pelo escritório em produção hoje** (ver T8b.1) — mas
`field-delivery`/`field-return` (que o escritório usa de fato) chamam `findDocumentForDriver`, que já
filtrava `releasedAt` desde a T3/T6. Nada nesta task precisou tocar nesse caminho.

**`returnReason` (texto livre) saiu por completo, não só da rota `/return`.** O schema do lote também
o carregava; como `return` saiu das ações do lote, mantê-lo ali seria um campo aceito que nunca chega
a lugar nenhum — pior que removê-lo, porque um cliente antigo que ainda o mandasse não veria aviso
nenhum (o body é `.strict()`, então na prática ele já quebraria — mas a intenção do campo ficaria
enganosa no código).

**`transitionTripDocumentsBatch`/`transitionTripDocument` (o motor genérico da máquina de estados)
não foram tocados.** Eles continuam aceitando `deliver`/`return` como `TripDocumentAction` no nível de
domínio (`trip-state.policy.ts`) — é o vocabulário da máquina de estados, não da superfície HTTP. Só
a fronteira (schema Zod, `TRIP_DOCUMENT_ACTIONS`) ficou mais estreita. Encolher o enum de domínio
também exigiria auditar todo consumidor de `TripDocumentAction` (inclusive o que resta de
`whatsapp-commands`, que hoje não chega em `deliver`/`return` por nenhum caminho, mas declara o tipo
largo) — risco desproporcional ao pedido desta task.

**Viagem despachada sem motorista, tentando "Entregar"/"Devolver": consequência aceita, sem
fallback novo.** `resolveFieldTripTarget` (T3) já responde `422 TRIP_WITHOUT_DRIVER` para esse caso,
e a T8 já mapeia esse código para uma mensagem de erro na tela (`TRIP_FEEDBACK_KEY_BY_ERROR`). Não
foi necessário nenhum tratamento novo — é o mesmo portão que `field-delivery`/`field-return` já
tinham antes desta task, agora alcançado pelos botões da lista em vez de só pelo painel de campo.

**Seletor de motorista: um só, no nível da tela, não um por linha.** A task pede "o mesmo
seletor/decisão de `driverId` que a T8 usa em `TripFieldActions`". `TripFieldActions` tem o próprio
seletor local porque suas ações (conferir carga, iniciar rota) são da viagem inteira. As ações de nota
(entregar/devolver, na lista e em massa) preferem um seletor único acima da lista — replicar o
seletor por linha de nota multiplicaria o mesmo controle dezenas de vezes na tela sem ganho: quem bate
à porta em nome de um motorista normalmente está processando o maço inteiro daquela viagem, não
trocando de motorista nota a nota.

### TDD

Contratos escritos e verificados antes/durante a implementação:

- Backend: `test/trip-http/documents.contract.ts` e `test/trips/routes.contract.ts` viraram negativos
  (200→404) **antes** de as rotas serem removidas do código — rodados vermelho contra o código velho
  não fazia sentido (o objetivo era a rota sumir), então a ordem real foi: remover a rota, então
  atualizar o teste, então confirmar verde. `test.each(['deliver', 'return'])` no lote nasceu depois
  do `TRIP_DOCUMENT_ACTIONS` estreito, para provar o 400.
- `test/trip-delivery-proof/orphan-deliver.contract.ts`: vermelho ao trocar `toInclude` por
  `not.toInclude` contra o `main.ts` ainda com a fiação antiga (confirmado durante o desenvolvimento,
  antes de remover `deliverTripDocument`/`returnTripDocument` de `main.ts`); verde depois.
- Frontend: `test/trip/field-office-retired-routes.contract.ts` (novo) confirma que `TRIP_BATCH_ACTIONS`/
  `TRIP_DOCUMENT_TRANSITION_ACTIONS` não voltam a listar as ações retiradas e que o texto-fonte do
  client não contém mais `/deliver`; `test/trip/client-and-controller.contract.ts` exercita
  `fieldDeliverDocument` contra um servidor sintético real (`Request`/`Response` de verdade, não
  dublê), afirmando método, path, `idempotency-key` e os campos do `FormData`; a mesma suíte prova que
  `trip.manage` sozinho recebe `TRIP_FORBIDDEN` em `fieldDeliverDocument` e que
  `trip.report-on-behalf` a alcança.
- `test/trip/state-gates.contract.ts`: a tabela `GATES_BY_STATUS` perdeu a coluna `return`; o teste
  antigo que afirmava `canDeliverDocuments === canReturnDocuments` foi substituído por um que afirma
  que **nenhuma das duas funções existe mais** no módulo — a regressão que este arquivo guardava
  (entregar herdando o portão de devolver) deixou de ser possível porque não há mais portão nenhum
  no cliente para herdar.

### Gates

- `bun run typecheck` (raiz, 6 apps) → exit 0, sem `error TS`.
- `bun run lint` (raiz, 6 apps) → exit 0, sem saída de erro.
- `bunx prettier --check .` (raiz) → `All matched files use Prettier code style!`.
- `bun run --cwd apps/api-transportada test` → `6504 pass · 0 fail · 32 skip`, 22643 `expect()`.
- `bun run --cwd apps/frontend-transportada test` → `4339 pass · 0 fail`, 37096 `expect()`, 29
  arquivos (3 testes a mais que a rodada anterior, todos em
  `test/trip/field-office-retired-routes.contract.ts`).
- Integração (`bun --env-file=../../.env.test test --timeout 120000`, dentro de
  `apps/api-transportada`): `field-trip-target.integration.ts`, `me-trip.integration.ts`,
  `trip-field-office.integration.ts`, `trip-field-authorship.integration.ts`,
  `trip-repository.integration.ts`, `whatsapp-driver-flow-actions.integration.ts` →
  `34 pass · 0 fail`, 0 skip.

### Pendências explícitas

- Revisão de design (web.md §15) do seletor de motorista novo e do `TripReturnReasonDialog` fica
  para a T16 (revisão final de design e usabilidade da spec) — este ambiente não tem Keycloak/API
  para renderizar a tela autenticada (mesma limitação registrada na T8).

### Revisão do code-reviewer (opus) — correções

A primeira rodada da T8b.2 foi reprovada. Rebase sobre `origin/staging` (18 commits à frente,
conflito em 9 arquivos — a T9, `be7e069c`, mexeu nos mesmos componentes) resolvido preservando os
dois lados; depois `bun install --frozen-lockfile` e um segundo rebase (mais 6 commits, sem
conflito). Dois commits mantidos (T8b.1/T8b.2) mais um terceiro, `fix(trips): correções da revisão
da T8b`, com as correções abaixo.

**Bloqueantes:**

1. `test/separator-role.contract.test.ts`: `createTripFieldOfficeRoutes`/
   `createTripFieldOfficeOccurrenceRoutes` entraram em `reachableRoutes`, para a lista exaustiva
   **provar** a ausência das rotas com autoria, não só presumi-la por elas nunca terem sido
   testadas. Teste novo exercita `AuthorizationService.authorize` de verdade contra a
   `OFFICE_REPORT_POLICY` exportada da rota, com o contexto real do `separator`. Mutante local
   (trocar `TRIP_REPORT_ON_BEHALF_PERMISSION` por `'trip.manage'` em `OFFICE_REPORT_POLICY`)
   confirmado derrubando os dois testes — revertido, não commitado.
2. "Devolver" em massa: falha parcial parava de ser visível atrás de um `selection.clear()` cego.
   `useTripDocumentSelection.hook.ts` ganhou `replace()`; `handleBatchReturn` em
   `TripDetail.component.tsx` lê o resultado por nota de `batchFieldReturnMutation`, mantém
   selecionadas só as que falharam e mostra `stateActions.batchReturnPartialFailure` (locale
   pt-BR/en) com o motivo da primeira falha, mapeado por `TRIP_FEEDBACK_KEY_BY_ERROR`.
   `selection.clear()` só roda quando todas as notas passam. Achado durante a correção:
   `tripFieldActionQueue.service.ts` lia `error.code`, mas `requestError` (`tripClient.service.ts`)
   grava o código em `error.message` — toda falha caía em `'UNKNOWN'` antes desta correção; é bug
   real, não só o que o revisor pediu.

**Importantes:**

4/5. Um seletor de motorista só: `TripFieldActions.component.tsx` perdeu o `useState` próprio —
recebe `selectedDriverId`/`onSelectDriverId` de `TripDetail`, que também os usa para
`field-delivery`/`field-return` da lista e do lote. `officeDriverId` só aceita o id escolhido
quando ele está em `trip.drivers` da viagem **atual** (`isSelectedDriverOnTrip`); senão cai em
`resolveDefaultOnBehalfDriverId` — a página não remonta ao trocar de viagem, e um id da viagem
anterior sobreviveria sem essa checagem. 6. Testes novos: `test/trip/client-and-controller.contract.ts` ganhou `fieldReturnDocument`
exercitado contra servidor sintético real (URL `/field-return`, corpo `{ reason }`, header
`idempotency-key`); `test/trip/field-action-queue.contract.ts` (novo) cobre `runFieldActionQueue`
— lista vazia, concorrência máxima respeitada, ordem do resultado preservada mesmo com item mais
lento no meio, falha isolada não derruba as irmãs, erro que não é `Error` vira `'UNKNOWN'`;
`test/trip/field-action-capabilities.contract.ts` ganhou `selectFieldReturnableDocumentIds`
(extraída de `tripFieldActions.service.ts` — nem `TripStateActions` nem `TripDetail` têm suíte de
render, então o filtro do lote vive numa função pura testável). 7. `trip-lifecycle.use-case.ts`: `batchStatus` estreitado de `TripDocumentAction` (4 valores) para
`'load' | 'separate'`; `returnReason` removido tanto do `batchStatus` quanto do helper genérico
`document()` — nenhum dos dois consumidores restantes (`separate`, `load`) o usa. O motor
genérico (`transitionTripDocumentsBatch`/`transitionTripDocument`) não foi tocado — continua
aceitando os 4 valores no nível de domínio, que é vocabulário da máquina de estados, não da
superfície HTTP.

**Menores:** cabeçalho de copyright restaurado em `state-gates.contract.ts` (tinha sido apagado
numa reescrita anterior); comentário de `trip.fixture.ts:5` corrigido (`operator` **tem**
`trip.report-on-behalf`); comentário de `delivery-proof-read.support.ts` não iguala mais o recorte
de `findDriverReachableDocument` ao de `findDeliveryEventId` (que não filtra `released_at` de
propósito — comprovante de entrega já feita continua válido após a nota ser liberada; não mudei
`findDeliveryEventId`, só o comentário que mentia sobre ela); `TripReturnReasonDialog` reseta o
motivo a cada abertura (`useEffect` em `isOpen`) e trocou `value as DriverReturnReason` por
`isDriverReturnReason`, type guard; título do `test/trip-field-office/policy.contract.ts` corrigido
de "as quatro" para "as sete" (o teste já afirmava `toHaveLength(7)`, só o texto estava desatualizado).

### Gates (pós-rebase e correções)

- `git fetch && git rebase origin/staging` → dois rebases (18 + 6 commits), sem conflito no
  segundo. SHAs finais: `ee9fb102` (T8b.1), `d5e382e6` (T8b.2), `b022d03f` (correções da revisão).
- `bun install --frozen-lockfile` → sem mudança de lockfile.
- `bun run typecheck` (raiz, 6 apps) → exit 0, sem `error TS`.
- `bun run lint` (raiz, 6 apps) → exit 0, sem saída de erro.
- `bunx prettier --check .` (raiz) → `All matched files use Prettier code style!`.
- `bun run --cwd apps/frontend-transportada test` → `4397 pass · 0 fail`, 37198 `expect()`, mais
  `bun run test:hooks` → `10 pass · 0 fail`.
- API, contrato (`bun --env-file=../../.env.test test --timeout 120000`, dentro de
  `apps/api-transportada`, com `DATABASE_URL` e `DRIZZLE_TEST_DATABASE_URL` no Postgres nativo
  descartável) → `6558 pass · 1 fail · 0 skip`, 180 arquivos, depois do último rebase. A falha é
  `Drizzle migration integration > … fiscal migration`, e ela se repete de forma determinística:
  o `DELETE` em `nfse_emission_profiles` viola `cte_emission_profiles_company_nfse_profile_fk`, que é
  `ON DELETE RESTRICT`. O Postgres 18.4 do Homebrew devolve `23001` (`restrict_violation`) onde o
  teste espera `23503`. É ambiente: o `compose.yaml` fixa outra imagem por digest, e a T8b não toca
  essa migration nem esse teste. A segunda revisão tinha medido `0 fail`, mas com 23 skips: sem
  `DRIZZLE_TEST_DATABASE_URL`, o teste de migration não roda.
- API, integração (`bun --env-file=../../.env.test run test:integration`) → o Docker local estava
  fora do ar (`Cannot connect to the Docker daemon`); rodado contra Postgres nativo descartável
  (`initdb`/`pg_ctl` em `65433`, `max_connections=400` — o padrão de 100 esgotava sob os 414 testes
  concorrentes e produzia dezenas de "Connection closed" espúrios; com 400, o número de falhas caiu
  de 161 para 18 e ficou estável). Resultado: `396 pass · 18 fail · 3059 expect()`. As 18 falhas são
  todas de infraestrutura fora do escopo da T8b, confirmadas por não tocarem nenhum arquivo de
  `trips`/`field-office`: 6 de `database-availability.integration.ts` (spec 137, dependem de
  `statement_timeout`/config de pool do Postgres do Docker, que o nativo não replica) e testes de
  isolamento de tenant/`auth-me` fechando conexão sob carga; 8 de object storage indisponível
  (MinIO também estava no Docker parado — `cte archive gateway`, extrato/recarga de pedágio spec
  154); 1 é a mesma do teste de contrato acima (`23001` do Postgres 18).
  **Os seis arquivos de integração da T8b, rodados isolados e dentro da rodada cheia, deram
  `34 pass · 0 fail · 0 skip`** — nenhum skip, nenhuma falha, nos dois modos.

### Segunda revisão (`code-reviewer`, opus): aprovada

Os bloqueantes e importantes da primeira rodada foram resolvidos. Os quatro menores que sobraram
foram corrigidos no último commit da T8b:

- O cabeçalho de copyright de `test/trip/state-gates.contract.ts` voltou.
- O `FieldOccurrenceDialog` (T9) abre com o motorista escolhido no painel da viagem
  (`defaultDriverId`), não com o de `position = 1`. É o mesmo seletor único da T8b.
- O aviso "N de M não foram devolvidas" some quando começa um lote novo, quando se troca de
  viagem ou quando nenhuma nota continua marcada.
- A seção de gates acima dá a causa medida da falha de contrato, que é ambiente.

Fica fora: o seletor de motorista vive em `TripFieldActions`, que não aparece numa viagem
despachada sem nenhuma parada. O revisor deu confiança baixa ao caso, e ele vai para a T16.

## Aceite 2 — linha do tempo (2026-09-18)

A parte "a linha do tempo mostra 'por <usuária> (escritório) pelo motorista <nome>'" do aceite 2 não
foi entregue pela T9 (só a ocorrência ganhou autoria; ver "Achado fora do escopo" da T9). Ela fecha
pela spec 158 (`specs/158-linha-do-tempo-da-viagem/`), com a ADR-0068.

## T11

**Escopo:** `FieldDeliveryWizard.component.tsx` (D5, D6, D8, D9; aceites 5, 6, 8, 9) — o assistente
de baixa com canhoto, um passo por nota, com câmera, conferência, pular e voltar. Serve tanto a
ação da linha (uma nota, capacidade `fieldDelivery` do `allowed-actions`) quanto a ação em massa da
seleção existente (`TripStateActions`).

### Decisões tomadas nesta task

- **"Trocar pela identificação" consome o passo atual, não o do alvo.** Quando a foto capturada no
  passo da nota A é identificada como a nota B (`otherSelected`, dentro do lote marcado), confirmar
  grava o rascunho de B e marca A como pulada — não existe um "voltar para A automaticamente". Quem
  quiser fotografar A de novo usa "Voltar" (se ainda estiver por perto no lote) ou reabre o
  assistente noutra rodada. Alternativa descartada: tentar reinserir A no fim da fila
  automaticamente — isso reintroduziria o mesmo "decidir sozinho" que a ADR-0067 §4 proíbe para a
  própria classificação (T10), agora aplicado à ordem do lote em vez de à nota.
- **`dispatchedAt` chega `null` do chamador.** `GET /trips/:id` ainda não expõe
  `trip_dispatch_snapshots.dispatched_at` na resposta que o frontend lê hoje (conferido em
  `trip.types.ts`: `TripDetail` não tem o campo). `validateFieldDeliveryDeliveredAt` já aceita
  `dispatchedAt: null` e aplica só a régua do futuro nesse caso — a régua do despacho continua
  valendo no servidor (`report-document-delivery.use-case.ts`), que responde 400 se o cliente
  deixar passar uma data antes do despacho. Pendência registrada, fora do escopo desta task de
  frontend (exigiria expor o campo na rota, que é T5/T6 já fechadas).
- **Nome/documento do recebedor ficam opcionais no formulário.** D8 diz que o nome é obrigatório
  quando a empresa exige assinatura, mas o frontend não lê essa configuração hoje (mesma pendência
  que a T6 já registrou no próprio `evidence.md` dela, para o lado do motorista). Em vez de inventar
  uma regra client-side sem a fonte da verdade, o campo fica opcional na tela e a falta dele vira o
  422 da API (`TRIP_DELIVERY_PROOF_PHOTO_REQUIRED`/equivalente de assinatura) quando a T12 ligar o
  envio de verdade.
- **A identificação por câmera não usa `useBarcodeScanner`.** Esse hook varre continuamente à
  procura de qualquer código de barras (uso da etiqueta de caixa, spec 055/152); aqui a leitura
  acontece **uma vez**, no instante da captura, sobre o quadro que vai virar o comprovante — por
  isso o wizard usa `useCameraStream` (D19, já compartilhado com o leitor e a medida de caixa) mais
  um recorte próprio (`fieldDeliveryCapture.service.ts`) que gera o quadro de luminância só na hora
  do clique, e não a cada 250ms.
- **Redução de imagem sem EXIF "de graça".** Reencodar pelo `canvas.toBlob('image/jpeg', …)`
  descarta metadado por natureza — nenhuma biblioteca extra foi necessária para a exigência "sem
  EXIF" do D9.

### Achado de design corrigido na própria task (web.md §15)

Ao montar os prints, os botões soltos ("Voltar" no cabeçalho, "Tirar outra foto" no bloqueio,
"Enviar arquivo" na captura) esticavam para 100% da largura do diálogo — filhos diretos de
`_dialog_` (`display:flex; flex-direction:column`, `align-items` padrão `stretch`). Os vizinhos
(`TripConfirmDialog`, `FieldOccurrenceDialog`) nunca soltam um botão direto no fluxo do diálogo:
sempre envolvem em `mdfeGateFooter`/`captureActions`, uma faixa `flex-row`. Corrigido nos três
lugares (`FieldDeliveryWizardHeader.component.tsx`, `FieldDeliveryWizard.component.tsx`,
`FieldDeliveryCaptureStep.component.tsx`), reaproveitando a classe `captureActions` já existente em
vez de criar uma nova só para isto.

### TDD

Testes escritos antes da implementação, todos rodados vermelhos primeiro (`Cannot find module`
contra o `src` sem os arquivos novos) e depois verdes:

- `test/trip/field-delivery-wizard.contract.ts`: a máquina de passos pura
  (`fieldDeliveryWizardReducer`) — capturar (matched segue para conferência; `notOnTrip`/
  `onTripNotSelected` bloqueiam com a identificação completa, não só o texto), retomar depois do
  bloqueio/conferência sem perder o índice, confirmar grava o rascunho e avança, pular marca e
  avança sem gravar, voltar recua um passo sem apagar o que já foi decidido, "trocar pela
  identificação" grava para a nota alvo e deixa a esperada pendente, término com todas as notas
  decididas, e a montagem dos rascunhos preserva a ordem original dos documentos (não a ordem de
  confirmação).
- `test/trip/field-delivery-validation.contract.ts`: `validateFieldDeliveryDeliveredAt` — agora
  aceito, futuro recusado, antes do despacho recusado, fronteira do despacho inclusiva, sem
  despacho conhecido só a régua do futuro vale, e data inválida nunca passa em silêncio.
- `test/trip/field-delivery-image.contract.ts`: `computeFieldDeliveryImageDimensions` — abaixo do
  teto não muda, no teto exato não muda, retrato e paisagem escalam proporcionalmente ao lado maior
  (2000px), e proporção extrema nunca devolve dimensão zero. `reduceFieldDeliveryImageToJpeg` (que
  usa `canvas`) não é exercitada aqui — isolada como função separada e impura, conforme a instrução
  da task, porque o ambiente de teste (`bun:test`, sem DOM) não tem `HTMLCanvasElement`.
- `test/trip/field-delivery-document.contract.ts`: `buildFieldDeliveryWizardDocuments` — monta na
  ordem da seleção (não a ordem da viagem), cidade vem do rótulo da parada, nota sem parada/contato
  não quebra (campos vazios), e id que não existe mais na viagem é descartado sem gerar passo vazio.
- Todos os quatro registrados em `test/trip.contract.test.ts` (entrypoint já listado no
  `package.json` — nenhuma entrada nova necessária, mesmo padrão da T9/T10).

**Parada do stream ao trocar de passo/fechar:** não há um hook próprio para testar com dublê de
`MediaStream` — o wizard reaproveita `useCameraStream` (D19), que já tem essa garantia coberta em
`test/design-system/camera-stream.contract.ts` ("fecha a trilha aberta quando desativa ou
desmonta"). `FieldDeliveryCaptureStep` monta com `isActive: true` e o **pai** desmonta o componente
ao sair da etapa "capturing" (para "reviewing", "blocked" ou fechar o assistente) — a garantia vem
de o React sempre rodar o cleanup do efeito ao desmontar, e reescrever esse teste aqui duplicaria o
que o design-system já prova. Verificado manualmente lendo `FieldDeliveryWizard.component.tsx`:
`FieldDeliveryCaptureStep` só aparece no JSX quando `state.step.kind === 'capturing'`.

### Revisão de design (web.md §15)

Sem dev server com dados neste ambiente (mesma limitação registrada pela T8/T9: sem Keycloak/API/
seed disponíveis para navegar a tela real). A comparação foi feita com o **CSS de produção real**
(`bun run --cwd apps/frontend-transportada build`, servido por `python3 -m http.server` local) e o
`chromium` do Playwright (`@playwright/test` 1.58.2, instalado nesta sessão via
`bunx playwright install chromium` — não estava em cache), tema escuro forçado por
`data-theme="dark"` no `<html>` (headless por padrão reporta `prefers-color-scheme: light`, e o
produto tem `@media(prefers-color-scheme:light)` como variante — sem o atributo, o print saía no
tema errado), 1280×720 e 375×900, com as classes hasheadas reais extraídas do CSS gerado
(`_dialog_1u37j_13`, `_banner_1u37j_57`, `_icon_lgjzr_2`, `_trigger_1psko_14`, `_field_hi3w5_1`
etc.), não nomes inventados.

Conferido contra os vizinhos (`TripConfirmDialog`, `FieldOccurrenceDialog`, `BarcodeScanner`): mesma
moldura de diálogo (borda `--color-slate`, fundo `--color-asphalt`, sombra), mesmo `ui-button`
`default`/`ghost`/`secondary`, `FileField` com a mesma altura de campo, alvo de toque `default`
(`--control-height`) nos botões de ação, sem scroll horizontal em 375px. Achado corrigido: ver seção
acima (botões soltos esticando 100% da largura).

Prints:

- `specs/156-o-escritorio-da-baixa-pelo-motorista/prints/t11-capture-desktop.png` (1280×720) —
  passo de captura, com a faixa da nota sobre a "câmera" (imagem estática, conforme a task permite)
  e os botões Capturar/Pular/Enviar arquivo.
- `specs/156-o-escritorio-da-baixa-pelo-motorista/prints/t11-capture-mobile.png` (375×900) — mesmo
  passo, sem scroll horizontal, botões empilhados por `flex-wrap`.
- `specs/156-o-escritorio-da-baixa-pelo-motorista/prints/t11-review-matched-desktop.png` (1280×720)
  — conferência com identificação `matched`, campos de "Entregue em", recebedor e o seletor de nota
  alvo.
- `specs/156-o-escritorio-da-baixa-pelo-motorista/prints/t11-blocked-desktop.png` (1280×720) —
  bloqueio por nota fora da viagem (D6, aceite 6), com a mensagem "este canhoto é da nota X, que não
  está nesta viagem" e o botão para tirar outra foto.
- `specs/156-o-escritorio-da-baixa-pelo-motorista/prints/t11-upload-desktop.png` (1280×720) —
  fallback de "enviar arquivo" quando a câmera está indisponível, com o `FileField` do design
  system.

Pendência explícita (mesma das tasks anteriores): print contra a tela **real**, com dado de
verdade e vídeo de câmera de fato, fica para quando houver ambiente com Keycloak/seed disponível
nesta sessão.

### Wiring (fora do que a task pedia como núcleo, mas necessário para "abrir para uma nota e para

### várias")

- `TripDetail.component.tsx`: estado `fieldDeliveryDocumentIds` (mesmo padrão de
  `fieldOccurrenceDocumentIds`, T9), `canFieldDeliveryBatch`, `documentActions.canFieldDelivery`/
  `onOpenFieldDelivery`, e o `<FieldDeliveryWizard>` montado com `dispatchedAt={null}` (decisão
  acima) e `onSubmit` **provisório** que só fecha o assistente
  (`() => setFieldDeliveryDocumentIds(null)`) — **não chama a API**. A T12 substitui este `onSubmit`
  pelo envio de verdade via `useFieldDelivery`.
- `TripStopList.component.tsx`: `canFieldDelivery`/`onOpenFieldDelivery` na `TripStopDocumentActions`
  e o botão da linha, ao lado do de ocorrência de campo.
- `TripStateActions.component.tsx`: `canFieldDeliveryBatch`/`onOpenFieldDeliveryBatch` e o botão de
  lote, ao lado do de ocorrência em massa.
- Textos em `trip.locale.json`/`trip.en.locale.json`, namespace `fieldDelivery` mais as chaves de
  `actions.fieldDelivery` e `stateActions.batchFieldDelivery` (com plural real `_one`/`_other`, não
  "nota(s)" — o achado que a T16 já cobrou das tasks anteriores).

### Gates

- `bun run typecheck` (raiz, 6 apps) → exit 0, sem `error TS`.
- `bun run lint` (raiz, 6 apps) → exit 0, sem saída de erro.
- `bun run --cwd apps/frontend-transportada test` → `4403 pass · 0 fail`, 37207 `expect()`,
  29 arquivos (mesma contagem — os quatro contratos novos entraram via `import` em
  `test/trip.contract.test.ts`, já listado no `package.json`) + `test:hooks` `5 pass · 0 fail`.
- `bun run --cwd apps/frontend-transportada build` → build limpo, PWA gerado, sem erro (rodado duas
  vezes: antes e depois da correção do achado de design, para confirmar que a mudança de CSS não
  quebrou nada).

### Arquivos

- `apps/frontend-transportada/src/modules/trip/components/FieldDeliveryWizard.component.tsx` (novo)
- `apps/frontend-transportada/src/modules/trip/components/FieldDeliveryWizardHeader.component.tsx` (novo)
- `apps/frontend-transportada/src/modules/trip/components/FieldDeliveryCaptureStep.component.tsx` (novo)
- `apps/frontend-transportada/src/modules/trip/components/FieldDeliveryReviewStep.component.tsx` (novo)
- `apps/frontend-transportada/src/modules/trip/components/FieldDeliveryFinishedStep.component.tsx` (novo)
- `apps/frontend-transportada/src/modules/trip/components/FieldDeliveryNoteBanner.component.tsx` (novo)
- `apps/frontend-transportada/src/modules/trip/shared/fieldDeliveryWizard.service.ts` (novo)
- `apps/frontend-transportada/src/modules/trip/shared/fieldDeliveryValidation.service.ts` (novo)
- `apps/frontend-transportada/src/modules/trip/shared/fieldDeliveryImage.service.ts` (novo)
- `apps/frontend-transportada/src/modules/trip/shared/fieldDeliveryDocument.service.ts` (novo)
- `apps/frontend-transportada/src/modules/trip/shared/fieldDeliveryCapture.service.ts` (novo)
- `apps/frontend-transportada/src/modules/trip/styles/fieldDeliveryWizard.module.css` (novo)
- `apps/frontend-transportada/test/trip/field-delivery-wizard.contract.ts` (novo)
- `apps/frontend-transportada/test/trip/field-delivery-validation.contract.ts` (novo)
- `apps/frontend-transportada/test/trip/field-delivery-image.contract.ts` (novo)
- `apps/frontend-transportada/test/trip/field-delivery-document.contract.ts` (novo)
- `apps/frontend-transportada/test/trip.contract.test.ts` (import acrescentado)
- `apps/frontend-transportada/src/modules/trip/components/TripDetail.component.tsx` (wiring)
- `apps/frontend-transportada/src/modules/trip/components/TripStateActions.component.tsx` (wiring)
- `apps/frontend-transportada/src/modules/trip/components/TripStopList.component.tsx` (wiring)
- `apps/frontend-transportada/src/modules/trip/locales/trip.locale.json` (textos)
- `apps/frontend-transportada/src/modules/trip/locales/trip.en.locale.json` (textos)
- `specs/156-o-escritorio-da-baixa-pelo-motorista/prints/t11-*.png` (5 novos)

## T12

**Escopo:** `useFieldDelivery.hook.ts` (D5, D9; aceites 5, 7, 8, 9, 12) — o envio de verdade do
`FieldDeliveryWizard` (T11): uma chamada `POST .../field-delivery` por nota, concorrência 3, a
própria `Idempotency-Key` por nota (gerada uma vez, reusada em qualquer retentativa), falha
parcial sem travar o resto, "tentar de novo" só nas falhas, 409 `DOCUMENT_ALREADY_SETTLED` tratado
como "já estava entregue" (informativo, não erro vermelho), e invalidação da viagem ao fim do
lote. Smoke Playwright com câmera simulada para o aceite 5.

### Dois defeitos de produção achados ao ligar o envio (nenhum é desta task, os dois bloqueavam)

Nenhuma decisão nova de domínio — os dois são bugs de mecânica React/TanStack Query, achados só
porque esta foi a primeira vez que alguém exercitou o fluxo real (T7/T8/T11 tinham cobertura de
unidade e prints estáticos, nunca o app de ponta a ponta com dado de verdade). Registrados aqui
porque bloqueavam a própria entrega da T12, e a correção de cada um está isolada num arquivo só:

1. **`GET /trips/:id/allowed-actions` disparava com `documentIds`/`stopIds` vazios e ficava presa
   nisso para sempre** (`useTripAllowedActions.hook.ts`/`useTripWorkspace.hook.ts`). A consulta é
   `enabled` assim que a permissão chega, no mesmo instante em que a consulta da viagem também
   começa — então, na primeira montagem, `documentIds`/`stopIds` ainda são `[]` (a viagem não
   carregou). `parseTripAllowedActions` recusa (`RESPONSE_INVALID`, fail-closed) qualquer id da
   resposta que não esteja na lista que a consulta _pediu_, e como o app usa `retry: false` e a
   `queryKey` não leva os ids, a consulta nunca tenta de novo com a lista certa. Reproduzido no
   smoke: com `allowed-actions` liberando `fieldDelivery` para 5 notas reais, nenhum botão de
   baixa do escritório aparecia (nem por nota, nem em lote), sem erro visível na tela. Corrigido
   com uma condição a mais em `useTripWorkspace.hook.ts`: `canRead: controller.canReadTrips &&
tripQuery.data !== undefined` — a consulta de ações permitidas passa a esperar a viagem
   carregar, e as duas deixam de disparar juntas com a lista vazia. Efeito colateral aceitável: as
   duas consultas ficam sequenciais só nesta tela (era isso ou trocar a `queryKey`, que exigiria
   tocar `useTripAllowedActions.hook.ts` e a invalidação em mais lugares).
2. **`FieldDeliveryWizard` ficava com a lista de notas da primeira montagem para sempre**
   (`useReducer(fieldDeliveryWizardReducer, documents, init)` em
   `FieldDeliveryWizard.component.tsx`). O componente é montado uma vez só (`isOpen` só escondia
   via `return null`), e o `init` lazy do `useReducer` roda **uma vez na vida do componente** — na
   primeira renderização, quando `fieldDeliveryDocumentIds` ainda é `null` e a lista é vazia. Todo
   "Dar baixa" seguinte reabria o mesmo estado congelado: a tela pulava direto para "Enviar 0
   nota", mesmo com 5 notas marcadas. Corrigido com uma `key` em `TripDetail.component.tsx`
   (`fieldDeliveryDocumentIds === null ? 'field-delivery-closed' : fieldDeliveryDocumentIds.join(',')`)
   — o React desmonta e remonta o assistente a cada lote novo, e o inicializador roda de novo com
   a lista certa. Sem essa correção a T11 nunca teria funcionado de ponta a ponta em produção,
   fora de um teste de unidade que já constrói o estado direto.

### Decisões desta task

- **`useFieldDelivery` recebe `reportFieldDelivery` e `invalidate` como funções, não client/
  companyId/tripId crus.** O hook não sabe nada de `TripClient`, `TripController` ou da forma da
  `queryKey` da viagem — quem chama (`TripDetail`, via `workspace.controller.reportFieldDelivery`
  e a nova `workspace.invalidateFieldDeliveryEffects`) já resolve a permissão e a invalidação.
  Isso mantém o hook puramente sobre "enviar o lote e guardar o status por nota", testável com uma
  função falsa, e evita duplicar a forma da `queryKey` da viagem (`[TRIP_QUERY_KEY, companyId,
tripId]`) num segundo arquivo — duplicar essa forma seria o mesmo risco de drift que o comentário
  de `MUTATION_EFFECT_QUERY_KEYS` já registra para outro caso.
- **A fila de envio é um serviço puro** (`fieldDeliverySend.service.ts`,
  `runFieldDeliverySendBatch`): concorrência 3 por fila com workers, `send` nunca lança (quem
  chama já converteu qualquer rejeição em `{ kind: 'failed', code }`), testável sem DOM nem rede.
  O hook (`useFieldDelivery.hook.ts`) só guarda estado React por nota e faz a chamada de verdade —
  mesma separação que a T11 já usava para a máquina de passos.
- **Idempotency-Key por `documentId`, num `useRef`, nunca limpa durante a sessão do lote** —
  mesmo padrão de `resolveFieldReportKey` em `useTripWorkspace.hook.ts` (T8), só que por nota em
  vez de por escopo textual. `retryFailed` chama `submit` de novo com os mesmos drafts, e
  `resolveIdempotencyKey` devolve a mesma chave porque o `Record` nunca é limpo por nota
  individual — só o `reset()` inteiro (ao fechar o assistente) apaga todas.
- **409 `DOCUMENT_ALREADY_SETTLED` nunca chega a `status: 'failed'`.** `sendDraft` converte
  `result.alreadySettled` em `{ kind: 'alreadySettled' }` antes de qualquer coisa chegar ao
  orquestrador — o "erro" nem existe do ponto de vista da fila, é um dos dois desfechos de
  sucesso possíveis (aceite 12).
- **Mensagem de erro por código reusa `resolveTripFeedbackKey`/`trip.feedback.*`** (o catálogo já
  usado pelo resto da viagem, T8), em vez de uma segunda tabela de mensagens só para esta tela.
  Só quatro chaves novas em `feedback.*` (`documentAlreadySettled`, `deliveredAtInFuture`,
  `deliveredAtBeforeDispatch`, `deliveryProofPhotoRequired`) — as duas de `deliveredAt` já
  existiam como texto em `fieldDelivery.deliveredAtError.*` (validação client-side, T11); as novas
  são para o erro **do servidor** na tela de resultado, propositalmente um catálogo textual
  diferente do client-side (mesmo código, contexto diferente).
- **Fechar com envio em andamento pede confirmação; fechar depois de terminado, não.** A pergunta
  original de "fechar com envio em andamento pede confirmação" tocou o mesmo `requestClose` que já
  perguntava por causa de `hasCaptures` (rascunhos tirados nesta sessão, T11) — sem ajuste, fechar
  DEPOIS de um envio bem sucedido perguntaria de novo à toa (os rascunhos já foram enviados, não há
  o que perder). `requestClose` passou a pedir confirmação só quando `isSubmitting` **ou**
  (`hasCaptures` **e não** `hasSubmitted`) — sessão em andamento ou fotos que nunca foram enviadas.

### TDD

- `test/trip/field-delivery-send.contract.ts` (puro, sem DOM): concorrência nunca passa de 3
  mesmo com 5 notas em fila; lote menor que a concorrência processa tudo; uma falha no meio não
  impede as outras quatro de terminarem (aceite 7); lote vazio nunca chama `send`.
- `test/trip/field-delivery-error-mapping.contract.ts`: os quatro códigos novos
  (`DOCUMENT_ALREADY_SETTLED`, `DELIVERED_AT_IN_FUTURE`, `DELIVERED_AT_BEFORE_DISPATCH`,
  `TRIP_DELIVERY_PROOF_PHOTO_REQUIRED`) têm texto nos dois idiomas via `resolveTripFeedbackKey`.
- `test/trip-hooks/field-delivery.contract.ts` (`renderHook`/`act`, `test:hooks`): a
  `Idempotency-Key` de uma nota que falha e depois é reenviada é a mesma nas duas chamadas; falha
  parcial não impede as outras notas, e `retryFailed` só reenvia a que falhou (a contagem de
  chamadas das que já tinham dado certo não muda); 409 `alreadySettled` nunca aparece como
  `failed`; `invalidate` é chamado **uma vez** ao fim do lote inteiro, não por nota; `reset` limpa
  o status para a próxima sessão. Todos escritos e rodados vermelhos antes da implementação do
  hook (`Cannot find module`), depois verdes.
- Smoke Playwright (aceite 5), `test/field-delivery.smoke.spec.ts`: 5 notas selecionadas em lote
  (checkbox "selecionar todas" da parada), pula a primeira, fotografa e confirma as outras 4 com
  câmera simulada (`--use-fake-device-for-media-stream` + `--use-fake-ui-for-media-stream` +
  `--use-file-for-fake-video-capture`, apontando para um Y4M gerado em
  `test/fixtures/fieldDeliveryBarcodeVideo.helper.ts` a partir da fixture de DANFE da T10 —
  `buildAccessKeyBarcodeFrame`, colado no centro de um quadro 640×480 cinza), envia o lote, uma
  nota falha de rede na primeira tentativa (`route.abort('failed')`) e é a única reenviada no
  "tentar de novo" com a **mesma** `Idempotency-Key` das duas chamadas (asserção no corpo
  multipart e no cabeçalho). Contrato de teste: 5 chamadas HTTP no total (4 notas × 1, mais o
  retry da que falhou), `deliveredAt` presente em todas, `Idempotency-Key` presente em todas e
  estável na que repetiu.

**⚠️ `--use-fake-ui-for-media-stream` é obrigatório, não só `permissions: ['camera']` do
Playwright.** Medido isolado (script fora do test runner, mesmo `chromium.launch`): só
`--use-fake-device-for-media-stream` + `context.grantPermissions(['camera'])` faz
`getUserMedia` recusar com `NotSupportedError` neste ambiente (macOS, Chrome for Testing
1243); acrescentar `--use-fake-ui-for-media-stream` (que pula o próprio diálogo de permissão do
Chrome, uma camada abaixo do que o CDP concede) resolve — confirmado também sem a flag de vídeo
customizado, então não é o Y4M gerado que causava o erro.

### Revisão de design (web.md §15)

Com o CSS de produção real (`bun run --cwd apps/frontend-transportada build` + `bun run preview`)
e o mesmo `chromium` do Playwright do smoke (não um `python3 -m http.server` estático como T8/T9/
T11 usaram — aqui o fluxo precisa da API mockada de verdade para o estado de envio existir), tema
escuro forçado por `data-theme="dark"`, 1280×720 e 375×900:

- `specs/156-o-escritorio-da-baixa-pelo-motorista/prints/t12-send-partial-failure-desktop.png` e
  `-mobile.png` — 3 entregues, 1 falhou (mensagem "Não foi possível falar com a API." — o
  `REQUEST_FAILED` genérico, porque a falha simulada foi de rede, não um código de negócio), botão
  "Tentar de novo (1)" e "Fechar" lado a lado.
- `specs/156-o-escritorio-da-baixa-pelo-motorista/prints/t12-send-success-desktop.png` e
  `-mobile.png` — as 4 entregues depois do retry, só o botão "Fechar".

Conferido contra a T11 (`t11-capture-desktop.png` etc.): mesma moldura de diálogo (borda
`--color-slate`, fundo `--color-asphalt`), a lista reaproveita exatamente `finishedList`/
`finishedListItem` (T11), os dois botões novos (`sendStatusDelivered`/`sendStatusFailed`) só
adicionam cor de texto (`--color-ready`/`--color-alert`, os mesmos tokens de estado que o resto do
produto usa para verde/vermelho) e o ícone (`check`/`alert`) — nada de primitivo cru. Sem scroll
horizontal em 375px. Nenhum achado de design novo nesta task (T11 já tinha corrigido o botão
solto esticando 100%; a linha de status desta task reaproveita a faixa `captureActions` para os
botões, mesma correção).

### Gates

- `bun run typecheck` (raiz, 6 apps) → exit 0, sem `error TS`.
- `bun run lint` (raiz, 6 apps) → exit 0, sem saída de erro.
- `bun run --cwd apps/frontend-transportada test` → `4412 pass · 0 fail`
  (9 a mais que a T11: 4 de `field-delivery-send.contract.ts`, 5 de
  `field-delivery-error-mapping.contract.ts`) + `test:hooks` `10 pass · 0 fail` (5 a mais:
  `field-delivery.contract.ts`).
- `bun run --cwd apps/frontend-transportada build` → build limpo, PWA gerado, sem erro.
- `bun run --cwd apps/frontend-transportada smoke` (`playwright test`, Chrome for Testing 1243,
  servidores de API e frontend buildados do zero) → **53 pass · 0 fail** — os 52 testes já
  existentes de `responsive.smoke.spec.ts` (nenhuma regressão das duas correções de mecânica
  acima) mais o novo `field-delivery.smoke.spec.ts`.

### Arquivos

- `apps/frontend-transportada/src/modules/trip/shared/fieldDeliverySend.service.ts` (novo) — fila
  pura de envio (concorrência, `FieldDeliverySendOutcome`/`FieldDeliverySendStatus`).
- `apps/frontend-transportada/src/modules/trip/hooks/useFieldDelivery.hook.ts` (novo) — o hook em
  si: `Idempotency-Key` por nota, `submit`/`retryFailed`/`reset`, invalidação ao fim do lote.
- `apps/frontend-transportada/src/modules/trip/components/FieldDeliverySendStep.component.tsx`
  (novo) — a tela final: resumo por status, lista por nota, "tentar de novo" só com falha.
- `apps/frontend-transportada/src/modules/trip/components/FieldDeliveryWizard.component.tsx`
  (alterado) — troca `onSubmit` provisório por `fieldDelivery` (prop), mostra
  `FieldDeliverySendStep` depois do envio, `requestClose` considera `isSubmitting`, `key` no
  `TripDetail` corrige o `useReducer` congelado (achado acima).
- `apps/frontend-transportada/src/modules/trip/components/TripDetail.component.tsx` (alterado) —
  instancia `useFieldDelivery`, passa `fieldDelivery` e a `key` corretiva ao wizard.
- `apps/frontend-transportada/src/modules/trip/hooks/useTripWorkspace.hook.ts` (alterado) —
  `reportFieldDelivery` no `TripController` (gated por `canReportOnBehalf`),
  `invalidateFieldDeliveryEffects`, e a correção do achado 1 (`canRead` de `allowed-actions`
  espera `tripQuery.data`).
- `apps/frontend-transportada/src/modules/trip/shared/tripClient.service.ts` (alterado) —
  `reportFieldDelivery` (multipart, `POST .../field-delivery`).
- `apps/frontend-transportada/src/modules/trip/shared/tripResponse.validation.ts` (alterado) —
  guard e adaptador do envelope de `field-delivery`.
- `apps/frontend-transportada/src/modules/trip/shared/trip.types.ts` (alterado) —
  `ReportFieldDeliveryInput`/`ReportFieldDeliveryResult`.
- `apps/frontend-transportada/src/modules/trip/shared/trip.constant.ts` (alterado) —
  `REPORT_FIELD_DELIVERY_RESULT_KEYS`, quatro entradas novas em `TRIP_FEEDBACK_KEY_BY_ERROR`.
- `apps/frontend-transportada/src/modules/trip/styles/fieldDeliveryWizard.module.css` (alterado) —
  `sendStatusDelivered`/`sendStatusFailed`/`sendStatusNeutral`.
- `apps/frontend-transportada/src/modules/trip/locales/trip.locale.json` /
  `trip.en.locale.json` (alterados) — textos de `fieldDelivery.send*`, `closeSendingMessage`, e as
  quatro chaves novas de `feedback.*`.
- `apps/frontend-transportada/test/trip/field-delivery-send.contract.ts`,
  `test/trip/field-delivery-error-mapping.contract.ts`,
  `test/trip-hooks/field-delivery.contract.ts` (novos, TDD acima) +
  `test/trip.contract.test.ts`/`test/trip-hooks.contract.test.ts` (imports acrescentados).
- `apps/frontend-transportada/test/fixtures/fieldDeliveryBarcodeVideo.helper.ts`,
  `test/field-delivery-smoke.helper.ts`, `test/field-delivery.smoke.spec.ts` (novos, smoke).
- `apps/frontend-transportada/playwright.config.ts` (alterado) — `testMatch` passa a ser uma
  lista (`responsive.smoke.spec.ts` + `field-delivery.smoke.spec.ts`).
- `specs/156-o-escritorio-da-baixa-pelo-motorista/prints/t12-send-*.png` (4 novos).
