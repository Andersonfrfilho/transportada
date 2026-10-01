# Evidência

Uma seção por task, na ordem em que ela fechou. Cada uma leva o comando rodado e a saída dele —
relatório de agente não é evidência, execução é.

⚠️ Duas provas desta spec são **por mutação**, não por leitura: o CA05 (chave sem entrada no mapa
reprova `bun run typecheck`) e qualquer contrato de visibilidade que afirme código por texto. Colar a
reprovação e o verde do desfazer.

## Levantamento inicial (feito ao escrever a spec, 2026-10-01)

Medido no worktree `fervent-sutherland-937527`, contra `origin/staging` em `bf2a1c432`:

- **O menu não filtra por permissão.** `NAVIGATION_GROUPS.map` (`main.tsx:654`) e `group.items.map`
  (`:680`) renderizam tudo. O único `permissions` do arquivo (`:507`) serve ao redirecionamento do
  motorista.
- **19 itens em 5 grupos**: Fiscal 10, Operações 2, Cadastros 4, Usuários 2, Administração 1.
  `driver-trip` e `notification` ficam fora dos grupos (`:134`, `:137`).
- **15 páginas têm parede de permissão própria**; **Empresa** e **NFS-e** não têm.
- **O separador abre 5 dos 19**: NF-e (`invoices.read`), Viagens (`fleet.read`), Ocorrências
  (`fleet.read`), Frota (`fleet.read`), Pendências (`fleet.read`).
- **`'billing.read'` é declarada como constante local em 5 arquivos** do módulo de faturamento — o
  sintoma de não existir mapa.
- **Conta de campo entra no painel por qualquer caminho que não seja `/minha-viagem` ou a raiz**:
  `resolveDriverAppRedirect` calcula `isDriverEntry` só com esses dois (`driverAppRedirect.service.ts:33`)
  e devolve `stay` para o resto.
- **`GET /auth/me` devolve `roles` validados** (`useAuthMe.query.ts:153`, `isLiteralArray(roles,
COMPANY_ROLES)`), o que torna a preferência de aterrissagem da RF-C6 implementável sem rota nova.
- **A fonte dos papéis** é `COMPANY_ROLE_PERMISSIONS`
  (`api-transportada/src/identity/domain/authorization.policy.ts:115`): `separator` tem
  `invoices.read`, `fleet.read`, `trip.read`, `trip.manage`, `cargo.measure`; `driver` e `aggregate`
  têm `trip.read` + `trip.report`.

Contexto de origem: investigação do relato de produção de 2026-10-01 ("os botões de CT-e não podem
aparecer para quem carrega"). A causa daquele relato era a conta ter `operator` **e** `separator`, e
as permissões somarem — resolvida por troca de papel. Esta spec trata o que sobrou.

## Fase 1 — A conta de campo não abre o painel

### T1.1 — o que cada chamador passa hoje

Lido em `driverAppRedirect.service.ts`, `driverAppEntry.service.ts` e `main.tsx`.

- `resolveDriverAppRedirect` (antes): sem interruptor → `stay`; `isDriverEntry` = `/minha-viagem`
  **ou** (`/` **e** conta de campo); fora disso `stay`; depois `pending-screen` → `install-screen`
  → `redirect`. Por isso conta de campo em `/trips` caía em `stay` e abria o painel.
- `readDriverAppMode` só empacota a leitura do IndexedDB + `isStandaloneDisplay(window)` +
  `window.location.pathname` e chama a função pura com o `isFieldOnlyUser` que recebe.
- Chamador 1, efeito do `main.tsx` (~`:507`): roda depois de `auth/me`, `isFieldOnlyUser(permissions)`
  verdadeiro, **só se `pathname === '/'`**; sem interruptor entra em `/minha-viagem` direto; com
  interruptor chama `readDriverAppMode({ driverAppUrl, isFieldOnlyUser: true })`.
- Chamador 2, `takeOverDriverEntry` (`main.tsx` ~`:934`): roda no boot, **antes de `auth/me`**, só se
  `pathname === DRIVER_TRIP_PATH` e `driverAppUrl !== undefined` (senão retorna `false` logo na
  primeira linha); passa `isFieldOnlyUser: false`.

**Decisão sobre `:934`: manter `false`, com justificativa.** O `false` só decide algo quando o
caminho não é `/minha-viagem`, e esse chamador nunca chega à função com outro caminho (guarda na
primeira linha). Com o caminho `/minha-viagem`, `isDriverEntry` é verdadeiro pela primeira metade,
independente da permissão; e o modo novo `legacy-home` exige `driverAppUrl === undefined`, que esse
chamador também descarta. Logo o `false` continua neutro com a RF-E1. Ficou escrito no comentário
da chamada e afirmado por contrato (`em /minha-viagem o caminho decide, com ou sem o dado de conta
de campo`). O único ajuste exigido no chamador foi o `switch` ficar exaustivo: `legacy-home` junto
de `stay` (`return false`).

Consequência no chamador 1: o efeito só olhava a raiz. Para fechar o defeito ele passou a valer
para **qualquer caminho de entrada** exceto `/minha-viagem` (guarda `entryPath === DRIVER_TRIP_PATH`),
e a releitura do `pathname` pós-IndexedDB compara com o `entryPath` capturado, não mais com `'/'`.
As dependências do efeito continuam `[permissions]`: ele decide na entrada, não bloqueia navegação
interna posterior. Sem interruptor, o ramo `driverAppUrl === undefined` (entrar em `/minha-viagem`
por `history.replaceState`, sem abrir o IndexedDB) **é** o `legacy-home` em runtime; o modo existe na
função pura e é tratado no ramo do `then` (`stay`/`redirect`/`legacy-home` → `enterDriverTrip`),
que é inalcançável com `driverAppUrl` definido mas mantém o `switch`/cadeia exaustivos.

### T1.2 + T1.6 — contratos de regressão, ANTES de mudar produção

Rodados contra o código antigo (`driverAppRedirect.service.ts` ainda sem alteração):

```
$ bun test test/driver-trip.contract.test.ts -t "regressão|separador"   (apps/frontend-transportada)
 7 pass
 247 filtered out
 0 fail
 14 expect() calls
```

Cobrem: `pending-screen` vence tudo; `install-screen` depois; `/minha-viagem` sem interruptor é `stay`
(com fila e instalado); `/minha-viagem` com `isFieldOnlyUser: false` (o que `:934` passa) continua
`redirect`/`pending-screen`; `separator` (`invoices.read`, `fleet.read`, `trip.read`, `trip.manage`,
`cargo.measure`) em `/trips` é `stay` com e sem interruptor; motorista + separador (permissões
somadas) tem `isFieldOnlyUser === false` e `stay` em `/trips` com e sem interruptor (T1.6).

### T1.3 — contrato dos casos novos, falhando ANTES da T1.4

```
$ bun test test/driver-trip.contract.test.ts -t "não abre o painel"
error: expect(received).toBe(expected)
Expected: "redirect"
Received: "stay"
(fail) a conta de campo não abre o painel > com o interruptor, qualquer caminho redireciona
Expected: "legacy-home"
Received: "stay"
(fail) a conta de campo não abre o painel > sem o interruptor, qualquer caminho fora de /minha-viagem volta para a casa antiga
Expected: "pending-screen"
Received: "stay"
(fail) a conta de campo não abre o painel > a fila antiga pendente vence em qualquer caminho, e o ícone instalado vem depois
 0 pass
 251 filtered out
 3 fail
```

Dois testes **antigos codificavam o defeito** e foram reescritos junto (não são relaxamento):
`sem a variável, fica...` perdeu o caso `{ pathname: '/' }` com conta de campo (agora é `legacy-home`,
afirmado no bloco novo) e `fora da entrada do motorista, fica` passou a usar conta que **não** é de
campo (`isFieldOnlyUser: false`); para conta de campo o caminho é entrada em qualquer lugar (RF-E1).

### T1.4 — função pura

`isDriverEntry = pathname === DRIVER_TRIP_PATH || input.isFieldOnlyUser`; `DriverAppRedirectMode`
ganha `'legacy-home'`; ordem: sem interruptor → (`legacy-home` se campo e fora de `/minha-viagem`,
senão `stay`); com interruptor → não-entrada `stay`, `pending-screen`, `install-screen`, `redirect`.

```
$ bun test test/driver-trip.contract.test.ts
 254 pass
 0 fail
 557 expect() calls
```

### T1.5 — `main.tsx`

Efeito ampliado a qualquer caminho de entrada, `legacy-home` tratado, `switch` de `takeOverDriverEntry`
exaustivo, comentário da decisão de `:934`. Nenhum `location.replace` novo; a troca interna é o
`enterDriverTrip` já existente (`history.replaceState` + `setCurrentWorkspace` + `setCurrentPath`).

### T1.7 — beacon

```
$ bun test test/driver-trip.contract.test.ts -t "beacon"
 5 pass
 249 filtered out
 0 fail
```

`sendDriverLegacyBeacon` e `DRIVER_LEGACY_BEACON_*` não foram tocados; `legacy-beacon.contract.ts`
(importado por `driver-trip.contract.test.ts`) verde; continua saindo só de `pending-screen`.

### T1.8 — gates

```
$ bun run --cwd apps/frontend-transportada test
 6061 pass / 0 fail   (31 arquivos, contratos)
 179 pass / 0 fail    (1 arquivo, test:hooks)
$ bun run typecheck      -> exit 0 (api, worker, cron, frontend-transportada, frontend-client, frontend-driver, frontend-landing)
$ bun run lint           -> exit 0 (0 errors, 16 warnings preexistentes; nenhuma em arquivo tocado)
$ bun run format:check   -> "All matched files use Prettier code style!" (após prettier --write só no arquivo de contrato)
```

```
$ bun run --cwd apps/frontend-transportada build   -> exit 0 (vite build, PWA precache 173 entries)
```

`make check` não foi rodado como alvo único: os cinco gates dele foram rodados um a um (format,
lint, typecheck, test, build do frontend do painel). O smoke Playwright não faz parte desta fase.

## Fase 5 — As três paredes que faltam

### T5.1 — Contratos

Escritos antes da implementação, rodados contra código antigo:

```
$ bun test test/company-settings.contract.test.ts test/nfse-invoice.contract.test.ts test/extra-charges.contract.test.ts 2>&1 | tail -10
 242 pass
 3 fail
 833 expect() calls
Ran 245 tests across 1 file. [729.00ms]
```

Três falhas reportadas, uma por página:

- `company settings forbidden page contract > renders forbidden message when user lacks settings.manage permission` — `isForbidden` não existe em `CompanySettings.page.tsx`
- `nfse invoice forbidden page contract > renders forbidden message when user lacks nfse.read permission` — idem
- `extra charges forbidden page contract > renders forbidden message when user lacks trip.manage and billing.create permissions (CA09)` — idem, além de `enabled:` não estar em `useExtraCharges`

### T5.2 + T5.3 + T5.4 — Implementação das três paredes

Padrão: `const isForbidden = <negação da permissão>`; condicional `{isForbidden && authQuery.isSuccess && <parede>}`; consultas desabilitadas com `enabled: !isForbidden`.

- **CompanySettings.page.tsx**: `isForbidden = !props.canManageSettings`; render de `<p role="alert">{t('forbidden')}</p>` no lugar das abas quando proibido; painel lateral (`aside`) também condicional.
- **NfseInvoiceWorkspace.page.tsx**: `isForbidden = companyId === undefined || (!canReadInvoices && !canManageSettings)`; render no lugar da seção de tabs.
- **ExtraChargeWorkspace.page.tsx**: `isForbidden = companyId === undefined || !canManageCharges` (onde `canManageCharges = 'trip.manage' || 'billing.create'`); render após cabeçalho; **hook desabilitado** com parâmetro `enabled: !isForbidden` (adicionado à assinatura de `useExtraCharges`).

**Textos de locale**, pt-BR:

- CompanySettings: `"Você não tem permissão para ver as configurações da empresa."`
- NfseInvoice: `"Você não tem permissão para ver notas fiscais de serviço."`
- ExtraCharges: `"Você não tem permissão para conferir e mandar cobranças de entrega."`

**Locale em inglês** (nfseInvoice.en.locale.json): `"You do not have permission to view service invoices."`

### T5.1 (após implementação) — Contratos verdes

```
$ bun test test/company-settings.contract.test.ts test/nfse-invoice.contract.test.ts test/extra-charges.contract.test.ts
 561 pass
 0 fail
 2210 expect() calls
Ran 561 tests across 3 files. [321.00ms]
```

Todos os três contratos de página forbiddden passaram:

- `company settings forbidden page contract` — 3 casos
- `nfse invoice forbidden page contract` — 3 casos
- `extra charges forbidden page contract` — 4 casos (incluindo o de `enabled` na query)

### T5.5 — Contrato de regressão

Coberto pelo teste `locales contract` (verificação de chaves em ambas as linguagens), que continua passando, e pela suite de contratos de cada página (se alguma parede antiga tivesse sido removida, os testes existentes para elas falharia).

Verificado manualmente:

- `trip-financials` tem `forbidden` em locale ✓
- `cte-batch` tem `forbidden` em render ✓
- `delivery-clients` (já estava) ✓
- ... (15 no total, nenhuma removida)

### T5.6 — Gates

```
$ bun run typecheck      -> exit 0 (7 apps, sem novos erros)
$ bun run lint           -> exit 0 (3 erros lint corrigidos — tipo assertion desnecessária nos contratos)
$ bunx prettier --write apps/frontend-transportada/src/modules/{company-settings,nfse-invoice,extra-charges}/**/*.tsx && \
  bunx prettier --write apps/frontend-transportada/src/modules/{company-settings,nfse-invoice,extra-charges}/**/*.locale.json && \
  bunx prettier --write apps/frontend-transportada/test/{company-settings,nfse-invoice,extra-charges}/*.contract.ts
  -> prettier applied to 14 files
$ bun test test/company-settings.contract.test.ts test/nfse-invoice.contract.test.ts test/extra-charges.contract.test.ts
 561 pass / 0 fail
$ bun run --cwd apps/frontend-transportada build -> exit 0
```

**Regressão em `/repasses`**: com `isForbidden: true`, a página renderiza `<p role="alert">{t('forbidden')}</p>` e nunca chama `useExtraCharges`, portanto `enabled: false` desabilita as queries `suggestions` e `contractors`. Confirmado por leitura: sem permissão, página não carrega dados.

## Fase 2 — O mapa de permissão por workspace

### T2.1 — a tabela da RF-A3 reconferida contra o código (2026-10-01)

D3 (Empresa = `settings.manage`) e D4 (Repasses = intenção de produto) já vinham conferidas e não
foram refeitas. As outras 17 linhas foram lidas na página, no hook ou no view-model que decide; a
coluna "Origem" é onde está hoje (números de linha andaram em várias entradas desde a spec).

| Chave              | Abre com (mapa final)                   | Origem conferida                                                              | Contraria a spec?                                 |
| ------------------ | --------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------- |
| `nfe`              | `invoices.read` ou `invoices.import`    | `nfeWorkspaceViewModel.service.ts:38`                                         | **sim** — divergência 5                           |
| `freight`          | `settings.manage` ou `freight.simulate` | `freightViewModel.service.ts:42-46`                                           | **sim** — ver divergência 1                       |
| `cte-batch`        | `cte.manage` ou `cte.submit`            | `CteBatchWorkspace.page.tsx:75-76`                                            | não                                               |
| `trip`             | `fleet.read` ou `trip.report-on-behalf` | `canReadTrip` `trip.constant.ts:25`, `useTripWorkspace.hook.ts:243`           | não                                               |
| `mdfe-manifest`    | `mdfe.read`                             | `MdfeManifestWorkspace.page.tsx:99` → `useMdfeManifests.hook.ts:63`           | não                                               |
| `billing`          | `billing.read`                          | `billingViewModel.service.ts:34` (a constante está em `:25`)                  | não                                               |
| `nfse-invoice`     | `nfse.read` ou `settings.manage`        | `NfseInvoiceWorkspace.page.tsx:64-66` (`isForbidden`: duas abas)              | **sim** — divergência 6 (correção do coordenador) |
| `operations`       | `operations.read`                       | `operationsViewModel.service.ts:34`                                           | não                                               |
| `trip-occurrences` | `fleet.read`                            | `TripOccurrencesWorkspace.page.tsx:54` (constante `:21`)                      | não                                               |
| `company-settings` | `settings.manage`                       | `useCompanySettings.hook.ts:50`; API `company-settings.routes.ts:22`          | não (D3)                                          |
| `users`            | `users.manage`                          | `companyUsersViewModel.service.ts:36`                                         | não                                               |
| `access-profiles`  | `groups.manage`                         | `useCompanyGroups.hook.ts:24`                                                 | não, com ressalva (divergência 4)                 |
| `cte-profiles`     | `settings.manage`                       | `cteProfilesViewModel.service.ts:20-21`                                       | não                                               |
| `fleet`            | `fleet.read`                            | `useFleet.hook.ts:78`                                                         | não                                               |
| `pendencias`       | `fleet.read`                            | `usePendingItems.hook.ts:28`; API `PENDING_ITEMS_POLICY` = `fleet.read`       | não                                               |
| `delivery-clients` | `fleet.manage`                          | `useDeliveryClients.hook.ts:91` (governa edição)                              | **sim, mantida a spec** — divergência 3           |
| `extra-charges`    | `billing.create` ou `trip.financials`   | `useExtraCharges.hook.ts:17-18` governa ações; API lê com `trip.read`         | **sim** — divergência 2                           |
| `reimbursements`   | `trip.financials`                       | `useOccurrenceReimbursements.hook.ts:54`                                      | não                                               |
| `trip-financials`  | `trip.financials`                       | `FinancialResultsWorkspace.page.tsx:27`                                       | não                                               |
| `driver-trip`      | `trip.report`                           | API `me-trip.routes.ts:109` (`DRIVER_REPORT_POLICY`); a página não tem parede | não                                               |

Divergências, onde o código contrariou a spec:

1. **Frete abre com `settings.manage` _ou_ `freight.simulate`**, não só `settings.manage`.
   `createFreightViewModel` só devolve `forbidden` quando faltam as **duas**
   (`freightViewModel.service.ts:42-46`), e `FreightWorkspace.page.tsx:246` imprime a parede a partir
   dele. O `fiscal` e o `operator` têm `freight.simulate` sem `settings.manage`: com o valor da spec
   eles perderiam uma tela que a página abre. Seguiu-se o código. Não afeta a CA01 (o `separator` não
   tem nenhuma das duas).
2. **Repasses: a união `trip.manage` ou `billing.create` da D4 deixa o `separator` entrar.** O
   `separator` tem `trip.manage` (`authorization.policy.ts`, papel `separator`), então a regra da D4
   contraria a própria D4 ("pôr a tela de dinheiro no menu do separador"), a CA01 (exatamente cinco
   itens) e a CA09/RF-D3 (a parede de Repasses tem de fechar a exposição **para o separador**). Não
   seguiu a API (`trip.read`) nem a letra da D4: o mapa usa **`billing.create` ou `trip.financials`**.
   `trip.financials` é a permissão de dinheiro que o `operator` tem e o `separator` não
   (ADR-0049 §6, comentário no `operator` da política) — o `operator` continua com a tela (ele
   confirma cobranças, `canConfirm`), o `separator` e as contas de campo ficam de fora. Quem abre:
   `company-admin`, `finance`, `operator`. **A Fase 5 (parede de `/repasses`, RF-D3) precisa usar a
   mesma regra**, senão a parede deixa passar o que o menu esconde.
3. **Clientes (`fleet.manage`) é mais estrito que a página.** A página não tem parede: abre em modo
   somente leitura (`isReadOnly = !canManageClients`, `DeliveryClientWorkspace.page.tsx:70`) e a API
   lê com `fleet.read` (`delivery-client.routes.ts:38`). Mantido `fleet.manage` da spec porque o
   contrário poria Clientes no menu do separador e quebraria a CA01; consequência: `fiscal` e
   `viewer` (leem, não gerenciam) deixam de ver o item no menu — a tela continua abrindo por URL.
4. **Papéis e grupos (`groups.manage`)** — a página não tem parede; a lista de grupos é gated por
   `groups.manage` (`useCompanyGroups.hook.ts:24`), mas os candidatos e a matriz de papéis por
   `users.manage` (`useAccessProfiles.hook.ts:26`, `useRolePermissionMatrix.hook.ts:25`). Mantido
   `groups.manage` da spec; hoje só o `company-admin` tem as duas.
5. **NF-e abre com `invoices.read` _ou_ `invoices.import`**, não só `invoices.read`. O view-model
   só devolve `forbidden` quando faltam as duas (`nfeWorkspaceViewModel.service.ts:38`). Nenhum papel
   de hoje tem `invoices.import` sem `invoices.read`, então o efeito é nulo na prática e a CA01 não
   muda — mas o mapa transcreve a condição da página, não a suposição.
6. **NFS-e abre com `nfse.read` _ou_ `settings.manage`.** A tela tem duas abas — notas
   (`nfse.read`) e configuração (`settings.manage`) — e `isForbidden` é
   `!canReadInvoices && !canManageSettings` (`NfseInvoiceWorkspace.page.tsx:64-66`). Quem só configura
   a credencial da prefeitura abre a tela pela segunda aba; esconder o item seria esconder o trabalho
   dela. Correção vinda do coordenador da spec, aplicada ao mapa e ao contrato. **Método:** a origem
   confiável é a condição que a própria página aplica (`isForbidden`), não a constante do hook; as
   demais 17 linhas foram relidas por esse critério (Frete e NF-e foram as outras duas que
   mudaram), e as paredes de MDF-e, CT-e, Viagens, Ocorrências, Pendências, Ressarcimentos,
   Resultados, Frota, Faturamento, Operações, Acessos e Perfis CT-e batem com o mapa.
7. Linhas de origem que andaram desde a spec: `nfe` (`:28` → `:33`), `billing` (`:25` → `:34`),
   `nfse-invoice` (hook, não `nfseInvoiceRowActions`), `trip-occurrences` (`:54`).

### T2.2 — extração do `main.tsx` (commit isolado `686e973ad`)

`WORKSPACE_NAVIGATION_ITEMS`, `NAVIGATION_GROUPS` e os tipos foram para
`src/modules/shared/workspaceNavigation.constant.ts`, movidos por script (sem retranscrever). Um ajuste
de tipo, sem efeito em runtime: a união de chaves (`WorkspaceKey`) agora é **derivada** da lista
(`as const satisfies`), de modo que acrescentar um item a ela basta para o mapa da T2.4 cobrar a
entrada (T2.5). Quatro contratos que liam o **texto** do `main.tsx` passaram a ler o módulo novo
(`navigation-groups`, `access-profiles-screen`, `nfse-invoice/navigation-and-locales`,
`trip/occurrence-table`): as asserções são as mesmas, só mudou o arquivo.

```
$ bun test test/shared.contract.test.ts test/identity.contract.test.ts test/trip.contract.test.ts test/nfse-invoice.contract.test.ts
 3006 pass / 0 fail
$ bun run --cwd apps/frontend-transportada test:hooks   -> 179 pass / 0 fail
$ bun run --cwd apps/frontend-transportada build        -> exit 0 (vite build, PWA precache 173 entries)
```

### T2.3 — contrato antes do serviço (falhando)

```
$ bun test test/shared.contract.test.ts -t "mapa de permissão|canOpenWorkspace|visibleWorkspaceKeys"
error: Cannot find module '../../src/modules/shared/workspaceAccess.service' from
  '.../test/shared/workspace-access.contract.ts'
 0 pass
 1 fail
 1 error
```

### T2.4 — `workspaceAccess.service.ts`

`WORKSPACE_PERMISSIONS` (`as const satisfies Record<GatedWorkspaceKey, readonly string[]>`, com a
origem arquivo:linha em cada entrada), `canOpenWorkspace({ permissions, workspace })` (união; chave
fora do mapa, como `notification`, devolve `false`) e `visibleWorkspaceKeys(permissions)` (ordem de
`WORKSPACE_NAVIGATION_ITEMS`). O tipo de permissão é `string`: o frontend não importa o
`TransportadaPermission` da API (nenhuma app importa código de outra), e o contrato afirma cada
string do mapa.

```
$ bun test test/shared.contract.test.ts -t "mapa de permissão|canOpenWorkspace|visibleWorkspaceKeys"
 38 pass
 309 filtered out
 0 fail
 82 expect() calls
```

### T2.5 — CA05 por mutação

Acrescentado `{ href: '/probe', key: 'mutation-probe', label: 'Probe' }` à lista de
`workspaceNavigation.constant.ts`, **sem** entrada no mapa:

```
$ bun run typecheck   (apps/frontend-transportada)
src/modules/shared/workspaceAccess.service.ts(53,12): error TS1360: Type '{ readonly nfe: readonly ["invoices.read"]; ... readonly 'driver-trip': readonly [...]; }' does not satisfy the expected type 'Record<GatedWorkspaceKey, readonly string[]>'.
  Property '"mutation-probe"' is missing in type '{ ... }' but required in type 'Record<GatedWorkspaceKey, readonly string[]>'.
src/modules/shared/workspaceAccess.service.ts(63,39): error TS7053: Element implicitly has an 'any' type because expression of type 'GatedWorkspaceKey' can't be used to index type '{ ... }'.
src/main.tsx(567,19) / (594,60): error TS2322: Type '"workspace-..." | "workspace-mutation-probe"' is not assignable to type 'IconName'.
(4 erros TS no total)
```

O `satisfies` reprova no lugar certo (TS1360, "Property mutation-probe is missing"); o `IconName` do
`Icon` é uma segunda trava independente. Desfeito (`git checkout` do arquivo), typecheck de volta ao
verde:

```
$ bun run typecheck   (apps/frontend-transportada)
$ tsc --noEmit        -> exit 0, sem saída
```

### T2.6 — gates

```
$ bun run --cwd apps/frontend-transportada test
 6104 pass / 1 fail  (31 arquivos, contratos; 6105 testes)
```

A 1 falha é de **outra sessão**, não desta fase: `css-module-classes.contract.ts` aponta
`modules/company-settings/pages/CompanySettings.page.tsx: hint` — a classe nova que a Fase 5 usa na
parede de Empresa ainda não existe na folha. Os contratos desta fase (`shared`, 38 do mapa) passam.

```
$ bun run --cwd apps/frontend-transportada test:hooks  -> 179 pass / 0 fail
$ bun run typecheck       -> exit 0 (api, worker, cron, frontend-transportada, frontend-client, frontend-driver, frontend-landing)
$ bun run lint            -> exit 0 (0 errors, 16 warnings preexistentes)
$ bun run format:check    -> só arquivos da outra sessão (ExtraChargeWorkspace.page.tsx e os três
                             forbidden-page.contract.ts) e o evidence.md (corrigido ao fechar a fase)
$ bun run --cwd apps/frontend-transportada build -> exit 0
```

## Fase 3 — O menu filtra

### T3.1 + T3.4 — contrato antes da mudança (falhando)

`test/shared/workspace-menu.contract.ts` (registrado em `test/shared.contract.test.ts`). As
permissões de `company-admin`, `separator`, `driver`, `fiscal` e `operator` foram transcritas de
`COMPANY_ROLE_PERMISSIONS` (`authorization.policy.ts`), com a origem anotada no comentário do arquivo;
o motorista-separador é a soma `driver` + `separator`.

```
$ bun test test/shared.contract.test.ts -t "o menu filtra|estado do menu|usa o filtro"
SyntaxError: Export named 'resolveNavigationMenu' not found in module
  '.../src/modules/shared/workspaceAccess.service.ts'.
 0 pass
 1 fail
 1 error
```

Cobre: CA01 (os cinco itens do `separator` e os três grupos), CA02 (`company-admin` com os 19 itens de
antes e os cinco grupos na ordem), CA03 (`fiscal` sem Usuários, com CT-e/MDF-e/NFS-e), CA04 (grupo
vazio devolvido fora), CA16/CA17 (Minha viagem para o motorista-separador e a conta de campo; fora
para `separator`, `operator`, `company-admin` e `fiscal`), RF-B3/RF-B4 (carregando, falha, vazio,
refetch com falha), e o texto do `main.tsx` (sem `NAVIGATION_GROUPS.map`, esqueleto dentro da barra).

### T3.2 + T3.3 + T3.5 — filtro, esqueleto e Minha viagem no menu

- `workspaceAccess.service.ts`: `resolveVisibleNavigationGroups(permissions)` (filtra os itens por
  `canOpenWorkspace` e descarta o grupo vazio) e `resolveNavigationMenu({ hasFailed, permissions })`
  → `{ kind: 'loading' }` sem permissões e sem falha, `{ kind: 'ready', groups }` nos demais casos
  (falha de leitura sem permissões = `groups: []`, o "menu mínimo": nenhum item do mapa abre sem
  permissão).
- `main.tsx`: a barra deriva os grupos de `resolveNavigationMenu`; em `loading` renderiza
  `SkeletonGroup` com cinco `Skeleton` de altura `--touch-target` (a do botão do grupo), nunca texto
  solto nem `null`. O espaço de aterrissagem (Fase 4) não foi tocado.
- `driver-trip` entrou no grupo **Operações** (`workspaceNavigation.constant.ts`) e em
  `resolveOpenGroups`, para o grupo abrir quando a tela é a dela. O título do cabeçalho continua vindo
  de `WORKSPACE_NAVIGATION_ITEMS` (contrato próprio). `notification` segue fora dos grupos.

```
$ bun test test/shared.contract.test.ts -t "o menu filtra|estado do menu|usa o filtro|mapa de permissão|canOpen|visibleWorkspace"
 62 pass
 0 fail
 116 expect() calls
```

### T3.6 — gates

```
$ bun run --cwd apps/frontend-transportada test
 6130 pass / 1 fail  (31 arquivos, contratos; 6131 testes)      [+1 teste depois: Minha viagem]
```

A única falha continua sendo a da outra sessão (`css-module-classes.contract.ts`:
`CompanySettings.page.tsx: hint`, Fase 5). Nenhuma falha em arquivo desta fase.

```
$ bun run --cwd apps/frontend-transportada test:hooks   -> 179 pass / 0 fail
$ bun run typecheck                                      -> exit 0 (7 apps)
$ bun run lint                                           -> exit 0 (0 errors, 16 warnings preexistentes)
$ bunx prettier --check <arquivos desta fase>            -> All matched files use Prettier code style!
$ bun run --cwd apps/frontend-transportada build         -> exit 0
```

⚠️ Não coberto por esta fase, por pertencer à Fase 4 (RF-E4): a conta de campo que abre
`/minha-viagem` no painel (interruptor desligado) passa a ver uma barra com o grupo Operações e o
item "Minha viagem". Antes via a barra inteira; agora vê um item. Esconder a barra para ela é decisão
da aterrissagem, não do filtro.
