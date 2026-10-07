# Evidence — Spec 243

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

**Contrato** (`test/fleet/driver-helper-fields.contract.tsx`, bloco "spec 243 T5 A7"): ficha com `canDrive`
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

## T8 — Documentação viva

**O que entrou:**

1. **ADR-0095** — "A cobrança é do escritório, e o ajudante acompanha" (próximo número livre em `origin/staging`
   após o 0093). Contexto, decisões D1-D5, consequências, alternativas descartadas, e revisão da seção 5 do
   ADR-0093 com nota apontando para o novo ADR.

2. **docs/ai-context/api-transportada.md** — Seção "Spec 243 — O ajudante fecha as pontas: cobrança, diária geral
   e papel na resposta" com arquivos-chave (rotas, casos de uso, repositórios, testes) e pegadinhas (permissão
   `trip.financials` é nova, lacuna HELPER_DAILY_RATE_MISSING persiste).

3. **docs/ai-context/frontend-transportada.md** — Seção "Spec 243 — O ajudante fecha as pontas" com painel de diária,
   variante de sem acesso, validação, e conversão de escalas (180,00 ↔ 180.0000).

4. **docs/ai-context/frontend-driver.md** — Seção "Spec 243 — O ajudante acompanha a viagem" com tipo `crewRole`,
   aviso, ações escondidas, e pegadinha de fotos pendentes sem filtro de papel.

5. **apps/api-transportada/CLAUDE.md** — Seção "O ajudante fecha as pontas (spec 243)" com as três decisões e
   referências ao ADR-0095 e docs/ai-context.

6. **apps/frontend-transportada/CLAUDE.md** — Seção "O ajudante fecha as pontas (spec 243)" com painel de diária,
   variante de acompanhamento, contrato. Corrigida seção "O menu mostra só o que a pessoa pode abrir": cobrança
   agora lê com `trip.financials` (era `trip.read`, achado BOLA).

7. **apps/frontend-driver/CLAUDE.md** — Seção "O ajudante acompanha a viagem (spec 243)" com `crewRole`, aviso e
   contrato, incluindo a pegadinha da fila offline.

8. **specs/235-o-ajudante-e-um-perfil/spec.md** — Nota ao fim de "Fora do escopo": "Pontas abertas: cinco questões
   deixadas em aberto aqui foram fechadas pela spec 243 e o ADR-0095."

**Verificação:** prettier rodado nos .md tocados (`bunx prettier --write` e `bunx prettier --check`);
todos os arquivos em compliance; nenhuma linha acima de 100 caracteres.

## Correções da revisão final (spec 243)

Nove itens da revisão final, um commit por item, contrato vermelho antes do código e prova por mutação
(correção arrancada, vermelho visto, restaurada e conferida com `cmp`).

| Item | O que                                                                                                      | Commit      |
| ---- | ---------------------------------------------------------------------------------------------------------- | ----------- |
| 1    | A3: a barra de papéis em lote mostra a falha de papéis e de grupos (`bulkAssignErrorCode`, `role="alert"`) | `ca4791153` |
| 2    | `readCrewRole`: papel desconhecido vira `helper` (somente leitura), ausente segue `driver`                 | `7c12cf879` |
| 3    | Paridade de `TRIP_CREW_ROLES` do app do motorista com o arquivo da API                                     | `4f11e68c8` |
| 8    | `DEFAULT_TRIP_CREW_ROLE` no lugar do literal `'driver'` repetido                                           | `e32e12d19` |
| 4    | `DocumentRow` com `isReadOnly` próprio: ajudante mantém selo e hora; espera do despacho volta para ele     | `34f117fee` |
| 5    | Diária geral: "salvo" não fica preso, "Tentar de novo" na leitura, montagem testada                        | `c22fa437c` |
| 6    | B1: endereço do ajudante; nota e regiões atendidas escondidas para o ajudante puro                         | `b78a5acae` |
| 9    | B2: `.fuelPriceStatusError` com `overflow-wrap: anywhere`                                                  | `fac628a6a` |
| 7    | Integração de `crewRole` afirma `expect(drivingTrip).toBeDefined()`                                        | `4b2c8b64a` |

**Item 1.** O erro da atribuição em lote ficava em `assignRolesMutation.error` / `groups.assignMutation.error`,
que nenhuma tela lia. O hook expõe `bulkAssignErrorCode` (papéis primeiro, depois grupos) e a barra o renderiza
com a chave `users.errors.<código>` e o texto padrão como reserva. Contrato: o hook devolve o código na falha e
`undefined` depois de uma nova tentativa que dá certo (papéis); a falha de grupos também chega ao código; a
barra renderizada traz o alerta com a mensagem (conhecida e padrão) e não traz alerta sem erro. Mutação: hook
sem o código, 2 fails; barra sem o bloco, 2 fails. **Limite:** a página não é montada nos contratos (ela cria o
cliente HTTP real); o fio `screen.bulkAssignErrorCode` → barra é uma linha, coberta pelo typecheck.
O comentário de `settleWithoutRejecting` agora diz a verdade (a falha fica em `mutation.error`).

**Item 2.** A viagem com papel fora do vocabulário (`'observer'`, `7`, `null`) vira `helper`; as outras viagens
da mesma resposta seguem válidas e a ausência continua valendo `driver`. Mutação (`?? 'driver'`): 2 fails.

**Item 3.** `TRIP_CREW_ROLES` lido de `api-transportada/src/shared/trip-crew-role.constant.ts`. Mutação (papel
extra no app): 3 fails.

**Item 8.** `DEFAULT_TRIP_CREW_ROLE` em `tripCrewRole.service.ts`, usado por `resolveTripCrewRole`,
`canReportOnTrip` e `readCrewRole`. Mutação (constante `'helper'`): 4 fails. O vermelho "antes" desta refatoração
foi o import de um nome que ainda não existia na suíte; o que garante a regra é a mutação.

**Item 4.** `isFieldWorkBlocked` (viagem sem despacho) e `isReadOnly` (ajudante) chegam separados a `DocumentRow`.
O ajudante vê a nota entregue com o selo e a hora, a devolvida com o motivo, a pendente só com os dados, e sem
nenhuma ação; a indicação `dispatch.waiting` aparece para ele quando a viagem não foi despachada. O rótulo do
selo virou o componente `DocumentSettledState`, e o contrato de texto-fonte `delivery-single-button` passou a
ler esse componente em vez do pedaço inline. Motorista: nada muda. Mutação: voltar o `&& !isReadOnly` da espera,
1 fail; desligar o ramo de leitura, 4 fails. **Limite:** o contrato do motorista com nota entregue não renderiza
(a `DeliveryProofSection` exige a sessão), então o "nada muda para o motorista" vale pelos contratos que já
existiam.

**Item 5.** A montagem saiu da página para `DriverCrewSettingsSection` (seam de teste: aceita `client`, como
`useUserAdministration`). Contrato com DOM em `test/trip-hooks/crew-settings-section.contract.tsx`:
com `fleet.read` e a aba de motoristas consulta e mostra o painel; sem permissão não consulta nem mostra;
fora da aba não consulta; digitar de novo depois de salvar apaga o "salvo"; a falha de leitura mostra
"Tentar de novo" (`crewSettings.retry`, nos dois idiomas) que consulta outra vez e mostra o campo. Mutações:
sem `onEdit`, sem `isActive`, sem `canRead`, sem `onRetry`, 1 fail cada. O contrato antigo que lia o texto-fonte
da página (`hookCall`) foi removido: a página agora só passa quatro props à seção. **Limite:** o fio página →
seção não é exercitado (montar `FleetWorkspacePage` exige o provedor Keycloak e a dúzia de hooks da frota); os
vizinhos (`fuel-tab`, `regions-tab`) só têm contrato de texto-fonte para a página, e aqui o comportamento ficou
na seção.

**Decisão conhecida: a diária zero (item 5c, não alterada).** O campo mostra zero como vazio
(`toTypedAmount` devolve `''` para 0), então um valor gravado `0.0000` aparece vazio; digitar `0,00` envia
`'0.0000'` à API (não `null`) e a API grava zero; só o campo realmente vazio envia `null`. Na leitura, "zero" e
"sem valor padrão" parecem iguais na tela, embora a conta da viagem trate `null` (aponta a lacuna) e `0.0000`
(valor zero) de forma diferente. Mesmo padrão da diária própria da ficha (`maskTypedAmount`/`toTypedAmount`).
Mantido; permitir exibir `0,00` exigiria mexer em `toTypedAmount`, que a ficha também usa, então não é trivial.
(Fechada pela spec 244 T3)

**Item 6 (B1), o que escondeu e o que renomeou.**

- **Renomeado:** o endereço. A legenda é "Endereço do ajudante" (`driverAddressLegendHelper`, nos dois
  idiomas), escolhida por `isHelperOnlyDriver`; o endereço serve ao ajudante do mesmo jeito (CEP, mapa do ponto).
- **Escondido (não renomeado):** a **nota** ("Nota do motorista") e as **regiões atendidas**. A nota nasce das
  fotos de comprovante de entrega dentro e fora do prazo (`driver-score.policy.ts`), e o ajudante não reporta
  entrega (a API recusa `trip.report`, D4); a cobertura de zonas só decide o motorista da viagem
  (`trip-driver-zone.policy.ts`). Nenhuma das duas se aplica ao ajudante puro, e o selo "Sem nota" só enganava.
  O motorista que também ajuda (`canDrive` verdadeiro) mantém as duas. A cobertura some também no diálogo de
  cadastro rápido, que usa o mesmo predicado. Coberturas já gravadas continuam no banco: o estado da ficha as
  mantém, só a seção não é mostrada.
- O contrato de texto-fonte `as duas fichas montam o mesmo controle` conta os blocos `{hasLicense ? (`; as
  contagens subiram de 4 para 5 (ficha) e de 2 para 3 (diálogo). O diálogo rápido não tem render nos contratos
  (é portal), então o que o prende é essa contagem.
- Mutações: esconder para todos, 5 fails; legenda fixa, 2 fails.

**Item 9 (B2).** `overflow-wrap: anywhere` em `.fuelPriceStatusError` (serve também o painel de combustível). O
contrato lê as regras do CSS (seletores separados por vírgula, comentários removidos) e afirma a propriedade no
bloco da classe. Mutação: a linha removida, 1 fail.

**Item 7.** Postgres 18 nativo descartável (porta 65435, fora do repositório), sem Docker e sem o 65432:
`me-trip.integration.ts` 20 pass / 0 fail / 0 skip. Mutação (`toBeUndefined`): 1 fail.

**Pendências conhecidas, sem tocar no código:**

- **Minor 5:** contrato do app do motorista que lê texto-fonte da página.
- **Minor 6:** a pendência de foto de conta foi reclassificada. (Fechada pela spec 244 T1)
- **Minor 7:** o cartão de consentimento de localização responde 403 para o ajudante puro. Fica para o resto da
  spec 235. (Fechada pela spec 244 T2)

**T7 (design) segue aberta:** depende do usuário. As mudanças visuais desta revisão (B1: ficha do ajudante sem
nota e sem regiões; item 5: botão "Tentar de novo"; item 4: selo na nota do ajudante) precisam de prints novos.

### D1 — o ajudante lê "Aguardando o despacho" (achado da revisão final)

`isTripAwaitingDispatch` da página incluía `canReportOnTrip(trip)`, falso para o ajudante, e o valor ia ao
cartão como `isFieldWorkBlocked`: o texto `dispatch.waiting` nunca aparecia para ele (o commit `34f117fee`
só tinha corrigido o cartão). A decisão virou a função pura `resolveDispatchState({ trip, isDispatchQueued })`
em `driverTripView.service.ts`: `isAwaiting` é fato da viagem (`route_planned` e despacho fora da fila, vale
para todo papel) e `canDispatch` é a permissão (`isAwaiting` e `canReportOnTrip`). A página passa `isAwaiting`
ao cartão e mostra o botão "Despachar viagem" só com `canDispatch`. Motorista: nada muda (texto do cartão e
botão, como antes).

Contrato de comportamento (`helper-crew-role.contract.ts`, vermelho antes: `resolveDispatchState` não existia):
ajudante + `route_planned` → aguardando sim, despachar não; motorista (e snapshot sem papel) → sim e sim;
papel desconhecido (degradado para ajudante) igual ao ajudante; viagem em andamento → nem um nem outro;
despacho na fila → motorista deixa de aguardar; cartão renderizado com o estado do ajudante mostra a espera
e nenhuma ação (sem Cheguei, Iniciar rota, Entreguei, nem "Iniciar viagem"). O contrato de texto-fonte
"o despacho fica atrás do mesmo predicado" foi removido: afirmava o predicado antigo e é coberto pelo
comportamento. Mutações: `isAwaiting` com `canReportOnTrip`, 3 fails; `canDispatch` sem o papel, 2 fails;
restaurado e conferido com `cmp`. **Limite:** o fio página → função → cartão não é montado (a página exige
sessão e dezenas de hooks); vale pelo typecheck e pela função pura.

### N1 — contraste do alerta da barra em lote (achado da revisão final)

O `.feedback` (texto de 13,6 px) tinha cor `--color-alert` sobre um fundo rosado (alerta a 8% sobre o asfalto):
5,01:1 no escuro e 4,19:1 no claro (medido 4,18 pela fórmula do contrato). Não existe token de tinta de alerta
no `index.css`; o par que atinge 4,5:1 nos dois temas sem inventar cor é o mesmo texto sobre `--color-graphite`
(escuro 4,87:1, claro 5,12:1). O fundo passou a `var(--color-graphite)`; o texto e a borda vermelha ficam.

Contrato `identity/bulk-role-bar-feedback-contrast.contract.ts` (vermelho antes: claro): lê a regra `.feedback`,
resolve cor e fundo (`var()` ou `color-mix` de dois tokens) com os temas do `index.css` e exige razão >= 4,5
nos dois, pelas funções de luminância de `design-system/contrast.helper.ts`. Mutação: fundo antigo, 1 fail
(claro); restaurado e conferido com `cmp`. Uma troca de cor para `--color-slate` sobre o asfalto passou, porque
esse par também tem >= 4,5:1 — o contrato mede o resultado, não proíbe token.

### N2 — registro, sem mudança de código

O texto de `FLEET_DRIVER_PROFILE_EMPTY` fala em tirar papéis, mas a barra em lote só acrescenta papéis: o 409
nunca ocorre ali na prática (foi simulado nos prints para provar a exibição do erro). Observação conhecida,
sem ação.
