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

### Achados para as próximas tasks

- ⚠️ **O `finance` recebe a permissão, mas não abre a viagem.** `GET /trips/:id` é `fleet.read`
  (`TRIP_READ_POLICY` em `trip.routes.ts`), e o `finance` não tem `fleet.read`. Isso precisa de
  decisão antes da T8. Registrado na ADR-0067, em Consequências.
- ⚠️ **`recorded_at` não existe hoje.** A spec diz que a hora da gravação "continua gravada à parte",
  mas nas tabelas de campo só existe `occurred_at defaultNow()`. A ADR registra que a coluna é
  criada pela migration de autoria (T4).
- Não precisaram mudar: `realm/` (o Keycloak não carrega permissões, só papéis), o banco (a coluna de
  permissão de grupo não tem CHECK, e a matriz não é persistida), `list-role-permissions.use-case.ts`
  e `role-permissions.contract.ts` (derivam da constante), `driverWorkspace.service.ts`
  (`isFieldOnlyUser` segue olhando só `trip.report`), `separator-role.contract.test.ts` (nenhuma rota
  nova). `apps/api-transportada/CLAUDE.md` e `docs/ai-context/` ficam para a T15, que já tem essa
  atualização no escopo.
