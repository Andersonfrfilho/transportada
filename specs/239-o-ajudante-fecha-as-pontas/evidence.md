# Evidence — Spec 239

## T1 — Cobrança é do escritório (D1)

**Validação do desenho antes de mexer** (2026-10-03):

- `authorization.policy.ts`: `trip.financials` está em `company-admin`, `finance` e `operator`.
  `trip.read` está só em `driver`, `aggregate`, `separator` e `helper` — nenhum papel do escritório o
  tem. Logo, nenhum papel de escritório que lia a cobrança deixa de ler; ao contrário, **o próprio
  escritório recebia `403`** nas duas leituras antes da troca (medido pelo contrato vermelho abaixo).
- Painel: o workspace `extra-charges` exige `billing.create` ou `trip.financials`
  (`workspaceAccess.service.ts:51`); quem tem `billing.create` (`company-admin`, `finance`) também tem
  `trip.financials`. Consumidor: `extraChargesClient.service.ts` (`listCharges` →
  `GET /delivery-charges`). Nenhum consumidor de `GET /delivery-clients/:id/charge-rules` no painel.
- Busca em `apps/frontend-client`, `apps/frontend-driver`, `apps/worker-transportada`,
  `apps/cron-transportada`, `.railway`, `deploy`: zero ocorrências de `delivery-charges`,
  `charge-rules` ou `deliveryCharges`. WhatsApp e integração chamam os casos de uso direto, sem a
  política da rota.

**Mudança:** `CHARGE_READ_POLICY` = `{ permission: 'trip.financials', scope: 'company' }` em
`apps/api-transportada/src/delivery-clients/presentation/delivery-charge.routes.ts`. Escritas
inalteradas (`trip.manage`).

**Contrato** `apps/api-transportada/test/delivery-clients/charge-read-policy.contract.ts` (entra por
`test/delivery-clients.contract.test.ts`, já na lista do `package.json`): um teste nomeado por papel ×
rota — `company-admin`, `finance`, `operator` leem; `driver`, `aggregate`, `separator`, `helper`,
`viewer`, `fiscal`, `contractor`, `automation` recebem `403` — mais a tabela cobrindo `COMPANY_ROLES`
inteiro e `finance` sem confirmar/descartar. `test/helper-role.contract.test.ts`: a lista de rotas do
ajudante cai de 9 para 7 e as duas leituras entram na lista de recusas. `separator-role.contract.test.ts`
não monta as rotas de cobrança (nada a mudar).

**Vermelho antes do código:**

```
(fail) ... company-admin lê GET /delivery-charges
(fail) ... finance lê GET /delivery-charges
(fail) ... operator lê GET /delivery-charges
(fail) ... driver recebe 403 em GET /delivery-charges
(fail) ... aggregate recebe 403 em GET /delivery-charges
(fail) ... separator recebe 403 em GET /delivery-charges
(fail) ... helper recebe 403 em GET /delivery-charges
(fail) ... (os mesmos sete em GET /delivery-clients/:id/charge-rules)
(fail) helper role contract > reaches only read routes of the driver app
(fail) helper role contract > is refused by every route that needs trip.report, fleet or trip management
 67 pass
 16 fail
Ran 83 tests across 2 files.
```

**Mutação:** `CHARGE_READ_POLICY` de volta a `trip.read` → `67 pass / 16 fail`; restaurado,
`cmp` idêntico à versão nova → `83 pass / 0 fail`.

**Gates:**

- Contrato completo (`bun --env-file=../../.env.test test --timeout 120000`): `9215 pass / 0 fail`,
  `Ran 9215 tests across 194 files`. (A primeira rodada deu 2 fail + 1 error em
  `meta-whatsapp-migration`/`pre-deploy`: `node_modules` com `meta-whatsapp-module@0.1.0`, o
  `package.json` pede `0.7.0`; `bun install --frozen-lockfile` resolveu — não é desta task.)
- Integração `./test/integration/delivery-charge-end-to-end.integration.ts` contra Postgres 18 nativo
  descartável (127.0.0.1:65435): `1 pass / 0 fail`, nenhum pulado. Nenhuma integração passa pela
  política HTTP das duas rotas.
- `bun run typecheck` (raiz): exit 0. `eslint` dos arquivos tocados (cwd da API): exit 0.
  `prettier --check` dos tocados: limpo.
- Sem migration.
