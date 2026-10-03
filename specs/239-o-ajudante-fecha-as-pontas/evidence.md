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

## T5 · A6 — O papel com ficha lê como a etiqueta (D7, RF-6)

**Defeito:** `FleetRoleBadge` rende `<span class="badge">` (caixa alta, fonte utilitária, 0,72 rem) para quem
não tem ficha e um `Button ghost` (`.roleLink`, sem caixa alta) para quem tem — "Ajudante" de um lado,
"AJUDANTE" do outro.

**Conserto (CSS puro, `userAdministration.module.css`):** `button.roleLink` (o seletor com elemento garante
vencer `.ui-button-size-sm` sem depender da ordem das folhas) leva a mesma borda, cor, fonte, tamanho,
`white-space`, `text-transform: uppercase` e `padding` do `.badge`, `min-height: 0` (a altura mínima do
controle engordava a caixa) e `background: none`. Em `pointer: coarse` a altura volta a `--touch-target`.
O componente não mudou.

**Contrato** `test/identity/role-badge-parity.contract.ts` (entra em `test/identity.contract.test.ts`): lê os
dois blocos da folha e afirma igualdade de `border`, `color`, `font-family`, `font-size`, `padding`,
`text-transform` e `white-space`, `min-height: 0` no link, e que o componente usa as duas classes.

**Vermelho antes do código:** `SELECTOR_NOT_FOUND: button.roleLink` (a folha só tinha `.roleLink` com
`padding-inline` e `0,75 rem`).

**Mutação** (restaurada e conferida com `cmp`): sem `text-transform` → 1 fail; `font-size: 0.75rem` → 1 fail;
`min-height: 2rem` → 1 fail.

**Gates:** `bun run test` do painel 6597 pass / 0 fail (+ hooks 364 / 0); `tsc --noEmit` limpo; eslint
dos tocados limpo; prettier limpo. A conferência visual (375 px, claro e escuro) é da T7.

## T5 · A7 — O ajudante não vê texto de motorista nem de agregado (D6, RF-6)

**Defeito:** o perfil Ajudante via "Identificação do motorista" (`driverIdentityLegend`, em `DriverForm` e
`DriverQuickCreateDialog`) e "Endereço da empresa do agregado" (`DriverLinkedAddressFields`, montado sem
condição em `DriverForm`).

**Conserto:** o predicado que já existia, `isHelperOnlyDriver` (via `hasLicense`), decide as duas coisas. Nova
chave `driverIdentityLegendHelper` ("Identificação do ajudante" / "Helper identification") nas duas legendas;
`DriverLinkedAddressFields` só monta com `hasLicense`. O diálogo de criação rápida **não** monta o bloco de
endereço (conferido: nenhuma referência), então só a legenda mudou. Na edição a decisão vem da ficha
carregada (`canDrive`), como o resto da ficha — o estado do formulário já nasce dela.

**Contrato** (`test/fleet/driver-helper-fields.contract.tsx`, bloco "spec 239 T5 A7"): ficha com `canDrive`
falso mostra a legenda do ajudante e não mostra a de motorista nem a do agregado; ficha de quem dirige segue
igual; legenda nos dois idiomas; o diálogo usa a mesma troca e não monta o endereço. Dois contratos
existentes foram atualizados por mudança legítima de estrutura: `driver-form-parity.contract.ts` (o texto da
legenda, agora com a troca) e `driver-helper-fields.contract.tsx` (o bloco condicional do `DriverForm`
passou de 3 para 4).

**Vermelho antes do código:** 4 fail (legenda do ajudante, ficha de quem dirige, locales, diálogo) com a chave
`driverIdentityLegendHelper` inexistente.

**Mutação** (restaurada e conferida com `cmp`): endereço montado sempre → 2 fail; legenda fixa na `DriverForm`
→ 2 fail; legenda fixa no diálogo → 2 fail.

**Observação fora do escopo (não alterada):** a ficha do ajudante ainda traz "Dados pessoais do motorista"
(`driverPersonalLegend`), em `DriverPersonalFields`. Não estava nos achados A3/A6/A7.

**Gates:** `bun run test` do painel 6601 pass / 0 fail (+ hooks 364 / 0); `tsc --noEmit` limpo; eslint dos
tocados limpo; prettier limpo.

## T6 · App do motorista conhece o papel e o ajudante acompanha (D3/D4, RF-3/RF-4)

**O que mudou** (`apps/frontend-driver`): `DriverTrip` ganha `crewRole?: 'driver' | 'helper'` (opcional de
propósito: o snapshot guardado no IndexedDB já é o objeto parseado e não passa de novo pela validação, então
o de ontem não traz o campo — `resolveTripCrewRole` o lê como `driver`, o molde de `isLegacyEnRouteTracking`).
A validação (`readCrewRole`) é fechada: ausente vale `driver`, valor fora do vocabulário é
`DRIVER_TRIP_RESPONSE_INVALID`. Predicado puro `canReportOnTrip` em `shared/tripCrewRole.service.ts`, usado pela
tela. Com `helper`: aviso fixo `DriverHelperNotice` (`role="status"`, texto `helperNotice.title/detail` em pt e
en, mesmo tom dos avisos de estado — cobre a 12%, borda de cobre, tema claro/escuro herdados dos tokens) no topo
da viagem; o `DriverStopCard` ganha `isReadOnly` e reaproveita o caminho que já existia para viagem não
despachada (`isFieldWorkBlocked`): some Cheguei/Iniciar rota/Cancelar rota/atalho do bloqueio, "Registrar
entrega depois", e a nota vira só leitura (sem Entreguei, Não entreguei, ocorrência, comprovante). Ficam a
leitura (paradas, notas, "Navegar", manifesto/DAMDFE, romaneio). O botão "Despachar viagem" não é oferecido ao
ajudante, e `useLocationSharing` só recebe as viagens em que ele reporta. Motorista: nada muda (prop default
`false`; os 1180 contratos anteriores seguem verdes).

**A fila offline com 403 (lido, não presumido)** — `useDriverTrip.hook.ts` envia por `client.send` e converte
a exceção em `toAttachmentSendOutcome` (`driverTripClient.service.ts:127`): só rede caída
(`isOffline`), `408/429/502/503/504` e erro de identidade viram `failed-network` (volta para a próxima
tentativa). O **403** tem `status` e não está em `RETRYABLE_STATUSES`, logo vira `rejected` com a causa
`"403 <código>"`; `drainQueue` (`offlineQueue.service.ts`) põe o item recusado em `settledKeys` e o tira da
fila na mesma transação — **não é reenviado**, aparece como "recusado" na tela de eventos. Não há laço
infinito: nenhum defeito. Contrato prova os dois elos (o 403 vira `rejected`; duas drenagens, um envio só). O
que a T6 garante a mais é que, com `helper`, nenhum botão chama `report(...)`, então nada chega à fila.

**Contrato** (`test/driver-trip/helper-crew-role.contract.ts`, importado em `driver-trip.contract.test.ts`):
validação (helper, driver, ausente = driver, fora do vocabulário recusa), predicado, cartão renderizado em modo
leitura (sem ação nenhuma, com leitura e "Navegar") e como motorista (com as ações), aviso nos dois idiomas, ligação da
tela (aviso, `isReadOnly`, despacho, localização) e o 403. `stop-activity.contract.ts` ajustado só na string
da condição renomeada (`areFieldActionsHidden`).

**Vermelho antes do código:** `Cannot find module '.../DriverHelperNotice.component'` (suíte inteira não
carregava; `tripCrewRole.service` também inexistente).

**Mutação** (restaurada e conferida com `cmp`): cartão sem `|| isReadOnly` → 1 fail; predicado invertido →
1 fail; papel desconhecido vira `driver` → 1 fail; ausente deixa de valer `driver` → 21 fail; localização com
todas as viagens → 1 fail; despacho sem o predicado → 1 fail; aviso removido → 1 fail.

**Gates:** `bun run test` do app do motorista 1182 pass / 0 fail; `bun run typecheck` da raiz limpo (7 apps);
eslint dos tocados limpo; prettier limpo. Verificação visual (375 px, claro e escuro, alvo de toque) é da T7.

**Fora do escopo, não alterado:** o atalho "Fotos pendentes (N)" lê `pendingProofs` da raiz do snapshot sem
filtrar por papel; se a API devolver pendência de viagem em que ele é ajudante, o atalho aparece. Conferir na T7.

## T6b (extra) · "Dados pessoais do ajudante" na ficha do ajudante

A observação deixada na T5 A7: a ficha do ajudante ainda trazia a legenda "Dados pessoais do motorista"
(`driverPersonalLegend`, em `DriverPersonalFields`). Chave nova `driverPersonalLegendHelper` ("Dados pessoais do
ajudante" / "Helper personal data"); `DriverPersonalFields` escolhe pela mesma `hasLicense`
(`!isHelperOnlyDriver`) que já decide a CNH no componente.

**Contrato** (`test/fleet/driver-helper-fields.contract.tsx`): a ficha do ajudante mostra a legenda nova e não a
de motorista; a de quem dirige, o contrário; texto nos dois idiomas. **Vermelho antes do código:** 1 fail
(`driverPersonalLegendHelper` inexistente). **Mutação** (restaurada, `cmp`): legenda fixa → 1 fail.

**Gates:** `bun run test` do painel 6602 pass / 0 fail (+ hooks 364 / 0); `tsc --noEmit`, eslint e prettier limpos.
