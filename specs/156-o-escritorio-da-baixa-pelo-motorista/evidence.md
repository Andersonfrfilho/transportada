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
