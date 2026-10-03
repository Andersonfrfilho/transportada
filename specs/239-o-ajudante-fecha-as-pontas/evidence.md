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

## T2 — `crewRole` por viagem em `GET /me/trips/current` (D3)

**Mudança:** `DriverTrip.crewRole: TripCrewRole` (`find-current-driver-trip.use-case.ts`);
`listActiveTrips` (`drizzle-current-driver-trip.repository.ts`) seleciona `tripDrivers.role` na mesma
consulta que já recorta as viagens por `trip_drivers.driver_id` — uma linha de `trip_drivers` por
(viagem, pessoa), garantida por `trip_drivers_company_trip_driver_unique`, então sem duplicar viagem e
sem consulta por viagem (sem N+1); `serializeTrip` (`me-trip.routes.ts`) devolve `crewRole`. Nenhuma
política nem regra de leitura mudou. O cliente do `frontend-driver` fica para a T6.

**Contrato** `apps/api-transportada/test/driver-trip/crew-role.contract.ts` (entra por
`test/driver-trip.contract.test.ts`, já na lista do `package.json`): ajudante → `helper`, motorista →
`driver`, a mesma pessoa `driver` numa viagem e `helper` na outra (pela rota serializada), e o caso de
uso repassando o papel. Fixtures de `current-trip.contract.ts` ganharam `crewRole: 'driver'`.

**Integração** `test/integration/me-trip.integration.ts` — "crewRole é o papel da linha da tripulação
de cada viagem": a pessoa do vínculo dirige a viagem A e é `helper` na viagem B; o outro motorista da B
lê `driver`.

**Vermelho antes do código:**

```
(fail) ... > o ajudante recebe crewRole helper na viagem que acompanha
(fail) ... > o motorista recebe crewRole driver na viagem que dirige
(fail) ... > a mesma pessoa é driver numa viagem e helper na outra
 258 pass
 3 fail
(fail) a viagem no bolso do motorista (spec 057 T017) > crewRole é o papel da linha da tripulação de cada viagem
 0 pass
 1 fail
```

**Mutação:**

- serializador sem `crewRole` → contrato `258 pass / 3 fail`; restaurado, `cmp` idêntico.
- repositório com `crewRole: 'driver'` fixo → integração `0 pass / 1 fail`; restaurado, `cmp`
  idêntico. Depois: contrato `261 pass / 0 fail`, integração `1 pass / 0 fail`.

**Gates** (Postgres 18.4 nativo descartável em 127.0.0.1:65435, `DATABASE_URL` e
`DRIZZLE_TEST_DATABASE_URL` exportados):

- Contrato completo: `9219 pass / 0 fail`, `Ran 9219 tests across 194 files`.
- Integração, arquivo por arquivo, nenhum pulado: `me-trip` 20/0, `current-driver-trip-concluded-window`
  4/0, `whatsapp-driver-flow-actions` 4/0, `event-location-stamp` 23/0, `field-trip-target` 7/0,
  `delivered-moment` 18/0, `mixed-cargo-end-to-end` 1/0, `me-location-consent` 5/0.
- `bun run typecheck` (raiz, as sete apps): exit 0. `eslint` dos tocados (cwd da API): exit 0.
  `prettier --check` dos tocados: limpo.
- Sem migration.

## T3 — Diária geral do ajudante no painel (D2, RF-2)

**O que entrou** (`apps/frontend-transportada/src/modules/fleet/`): `shared/crewSettings.validation.ts`
(chaves exatas), `shared/crewSettingsClient.service.ts` (`GET`/`PUT /company-crew-settings`, erro com o
código da API), `shared/crewSettingsForm.service.ts` (`180,00` ↔ `180.0000`, vazio ↔ `null`),
`hooks/useCrewSettings.hook.ts` (query `[chave, companyId]`, `setQueryData` no sucesso),
`components/DriverCrewSettingsPanel.component.tsx` e locales `crewSettings.*` pt/en. Montado na aba
`drivers` de `FleetWorkspace.page.tsx`, acima da lista.

**Decisão D2, divergência deliberada:** consulta liga com `canReadFleet` (`fleet.read`) e aba aberta;
campo editável e botão só com `canManageFleet` (`fleet.manage`) — a permissão da API, nunca
`settings.manage`/`canManageSettings`. Não entra em `SETTINGS_PANEL_PLACEMENT`; `settingsTabsOf('fleet')`
não mudou e os contratos fuel-tab, regions-tab e toll-booth-charge-tab seguem verdes.

**Contrato** `test/fleet/driver-crew-settings-panel.contract.tsx` (entra em `test/fleet.contract.test.ts`):
rótulos nos dois locales; cliente (caminho, método, corpo estrito, código de erro, resposta inválida);
validação; conversão do campo; painel renderizado (com valor, vazio, sem `fleet.manage`, carregando,
falha de leitura, erro com código, salvo); montagem na aba com a permissão certa.

**Vermelho antes do código:** `Cannot find module '.../DriverCrewSettingsPanel.component'` (0 pass / 1 fail).

**Mutação** (cada uma restaurada e conferida com `cmp`; base 653 pass):

- painel mostra botão sem checar `canManage` → 1 fail (sem fleet.manage);
- hook ligado por `canManageSettings` → 1 fail (montagem com a permissão da API);
- conversão com escala 2 em vez de 4 → 1 fail (`180,00` ↔ `180.0000`);
- cliente com `POST` no lugar de `PUT` → 1 fail (cliente).

**Gates:** `bun run test` do painel 6579 pass / 0 fail (+ hooks 359 / 0); `tsc --noEmit` limpo; eslint
dos tocados 0 erros (3 avisos já existentes em arquivos não tocados); prettier limpo.

## T4 — `NoWorkspaceAccess` com variante de acompanhamento (D5, RF-5)

**O que entrou** (`apps/frontend-transportada/src/`): `modules/identity/shared/noWorkspaceAccessVariant.service.ts`
(função pura `resolveNoWorkspaceAccessVariant({ driverAppUrl, permissions })` → `tracking` com `trip.read`,
`default` sem ela), `NoWorkspaceAccess.component.tsx` recebe `variant`, `main.tsx` calcula a variante com
`readDriverAppUrl()`, locales `noWorkspaceAccess.trackingTitle/trackingBody/openDriverApp` pt/en.
O botão é `Button asChild` sobre `<a href rel="noopener noreferrer">`, mesma aba, ícone `truck`, só quando a
URL existe; o "Sair" fica sempre. A variante de acompanhamento não mostra "peça ao administrador".

**Contrato** `test/identity/no-workspace-access-variant.contract.tsx` (entra em `test/identity.contract.test.ts`):
`['trip.read']` com e sem URL, `[]` com URL, `['trip.read','fleet.read']` não chega a `no-access`, HTML
renderizado nas três situações, locales e a ligação no `main.tsx`. `helper-role.contract.ts` (:83-91) mantém
`no-access` para o landing e ganhou a asserção da variante exibida.

**Vermelho antes do código:** `0 pass / 1 fail / 1 error` (módulo `noWorkspaceAccessVariant.service` inexistente).

**Mutação** (restaurada e conferida com `cmp`; base 266 pass): serviço sem a checagem de `trip.read` → 2 fail;
link sem `rel` → 1 fail; botão sempre renderizado → 2 fail; `main.tsx` com `driverAppUrl: undefined` → 1 fail.

**Gates:** `bun run test` do painel 6587 pass / 0 fail (+ hooks 359 / 0); `tsc --noEmit` limpo; eslint dos
tocados limpo; prettier limpo.

## T5 · A3 — Salvar não rejeita a promise (D8, RF-6)

**Defeito:** as funções assíncronas de `useUserAdministration.hook.ts` faziam `await mutation.mutateAsync(...)`,
que rejeita com o erro da API; a página as chama com `void`, e a rejeição virava `unhandledrejection`
(`pageerror`). O erro já fica em `mutation.error` e a tela o mostra.

**Conserto:** `settleWithoutRejecting(action)` (um `try/catch`, com o porquê numa linha) envolve o corpo de
`submitInvite`, `submitEdit`, `confirmRemove`, `activateUser`, `resendInvitation`, `assignGroups` e
`assignRoles`. O que vem depois do `await` (fechar diálogo, marcar aviso, limpar seleção) continua só no
sucesso, porque está dentro do mesmo corpo.

**Contrato** `test/trip-hooks/user-administration-failure.contract.ts` (hook montado com o `dom.preload` do
repo, cliente falso que recusa ou aceita; entra em `test/trip-hooks.contract.test.ts`, rodado por
`bun run test:hooks`): convidar, editar, remover, ativar, reenviar e papéis/grupos em lote — a função não
rejeita; na falha o diálogo segue aberto (`removeTarget`, `editTarget`, `isInviteOpen`) e o aviso de
sucesso não aparece; no sucesso o diálogo fecha e o aviso marca.

**Vermelho antes do código:** `0 pass / 5 fail`, todos com `error: SAVE_REFUSED` saindo de `submitInvite`,
`activateUser`, `assignRoles` etc. — a rejeição vazando.

**Mutação** (restaurada e conferida com `cmp`): `catch` trocado por `finally` → 0 pass / 5 fail; `setRemoveTarget(null)`
fora do corpo protegido → 1 fail (remover); `setActivatedUserId` fora → 1 fail (ativar); `setEditTarget(null)`
fora → 1 fail (editar).

**Gates:** `bun run test` do painel 6587 pass / 0 fail (+ hooks 364 / 0); `tsc --noEmit` limpo; eslint dos
tocados limpo; prettier limpo.
