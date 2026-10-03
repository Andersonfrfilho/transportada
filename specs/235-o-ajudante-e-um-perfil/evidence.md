# Evidence — Spec 235

## T1 — Papel `helper` e `fleet_drivers.can_drive`

Data: 2026-10-02. Branch `work/spec-235-ajudante`.

### O que mudou

- `COMPANY_ROLES` ganha `helper` entre `separator` e `contractor`
  (`apps/api-transportada/src/database/identity.schema.ts`); o CHECK literal de `membership_roles`
  (escrito à mão) acompanha na mesma posição. `user_invitation_roles_role_check` (deriva de
  `INVITABLE_COMPANY_ROLES`) e `company_group_roles_role_check` (deriva de `COMPANY_ROLES`) pegam o
  papel sozinhos — a migration toca **três** CHECKs de papel.
- `fleet_drivers.can_drive boolean not null default true` e o CHECK da D2
  `fleet_drivers_crew_capability_check` (`can_drive or can_act_as_helper`)
  (`apps/api-transportada/src/database/fleet.schema.ts`).
- Migration `apps/api-transportada/drizzle/20261002230234_helper_role_and_can_drive/` gerada por
  `bun run db:generate --name helper_role_and_can_drive` (`migration.sql` + `snapshot.json`); à mão,
  só o cabeçalho e o CHECK novo `NOT VALID` + `VALIDATE CONSTRAINT` em statement separado.
  `rollback.sql` à mão: `BEGIN`, `DO $$` que recusa com vínculo/convite/grupo `helper` ou ficha
  `can_drive = false`, restaura os três CHECKs anteriores (`membership_roles` e `company_group_roles`
  com 10 papéis; `user_invitation_roles` com 9, sem `automation`), derruba o CHECK novo e a coluna, e
  apaga a própria linha do journal por nome exigindo `ROW_COUNT = 1`.
- **Adiantado da T5:** `COMPANY_ROLE_PERMISSIONS` usa `satisfies Record<CompanyRole, …>`, então o papel
  novo exige entrada já: `helper: ['trip.read']` (D7), em
  `apps/api-transportada/src/identity/domain/authorization.policy.ts`, com contrato em
  `test/authorization.contract.test.ts` ("grants the helper role only the trip read" e o `toEqual`
  do mapa inteiro). `FLEET_LINKED_ROLES` (D8) **não** foi tocado — segue na T5.

### Contrato vermelho antes do código

`bun --env-file=../../.env.test test --timeout 120000 ./test/identity-schema.contract.test.ts ./test/user-invitation-schema.contract.test.ts ./test/fleet-schema.contract.test.ts ./test/authorization.contract.test.ts`
→ `141 pass · 7 fail` (papéis de `COMPANY_ROLES`, CHECK de `membership_roles`, CHECK do convite,
lista de colunas da ficha, `can_drive` not null/default, CHECK da D2, permissão do `helper`).

Asserções de banco novas (rodam dentro de `database-migration.contract.test.ts`):

- `identity-constraints.assertion.ts`: `membership_roles` aceita `helper`.
- `fleet-constraints.assertion.ts`: ficha nova nasce `can_drive = true, can_act_as_helper = false`;
  ajudante-puro (`false, true`) entra; ficha `false, false` falha `23514`
  `fleet_drivers_crew_capability_check`.
- `helper-role-rollback.assertion.ts` (novo): o rollback recusa com `helper` em `membership_roles`, em
  `user_invitation_roles`, em `company_group_roles` e com ficha `can_drive = false` — cada sonda é
  desfeita, porque a integração roda todos os rollbacks em ordem reversa no fim.

### Gates

O banco do `.env.test` deste worktree aponta para `127.0.0.1:65434`, onde nada escuta
(`pg_isready` → "nenhuma resposta"); o Postgres de teste do Docker está em 65432 com outra credencial e
é compartilhado com outras sessões. Subir `make migration-test` com `ENV_FILE=.env.test` recriaria o
container `transportada-test-postgres-1` com outra porta, derrubando quem o usa. Contorno: Postgres
18.4 nativo (Homebrew) descartável no scratchpad, porta 65435, `-A trust`, e
`DATABASE_URL`/`DRIZZLE_TEST_DATABASE_URL` apontados para ele (a variável do shell vence o
`--env-file` — conferido).

- `make migration-test` (equivalente sem o `postgres-up`: `set -a; . ./.env.test; set +a;`
  `DRIZZLE_TEST_DATABASE_URL=… bun run --cwd apps/api-transportada db:test`) →
  `115 pass · 0 fail · Ran 115 tests across 8 files` (0 skip).
- Prova por mutação: com a guarda `can_drive = false` do `rollback.sql` trocada por `IF false`,
  `bun test ./test/database-migration.contract.test.ts` → `78 pass · 1 fail`
  (`applies, constrains, rolls back, and reapplies the fiscal migration`,
  `expect(received).toBeInstanceOf(expected) … Received value: undefined`). Arquivo restaurado.
- `bun run db:generate --name probe` → `{"status":"no_changes"}`.
- Contrato da API: `bun --env-file=../../.env.test test --timeout 120000` →
  `8750 pass · 0 fail · Ran 8750 tests across 193 files` (0 skip). Sem o override de banco, a mesma
  execução dá 9 fail em `toll booth catalog repository` por `ERR_POSTGRES_CONNECTION_CLOSED` — é a
  porta 65434 vazia, não código.
- `bun run typecheck` (raiz) → exit 0.
- `bun run lint` (cwd `apps/api-transportada`) → exit 0.
- `bunx prettier --write` nos arquivos tocados.

### Fora desta task (Fase 3)

Listas de papéis duplicadas no painel, que ainda não conhecem `helper`:

- `apps/frontend-transportada/src/modules/identity/shared/companyUsers.constant.ts`
- `apps/frontend-transportada/src/modules/identity/queries/useAuthMe.query.ts` (lista fechada, :162)
- `apps/frontend-transportada/src/modules/shared/workspaceAccess.service.ts`

## T2 — `resolveTripCrew` recusa quem não dirige

Data: 2026-10-02. Branch `work/spec-235-ajudante`.

### O que mudou

- `TripDriverCandidate` ganha `readonly canDrive: boolean`
  (`apps/api-transportada/src/trips/domain/trip.policy.ts`). `resolveTripCrew` junta os `driverIds`
  com `canDrive === false` e lança `TripDriverCannotDriveError` (`409 TRIP_DRIVER_CANNOT_DRIVE`, ids
  em `details` com `field: 'driverIds'`) **depois** de duplicado, ajudante sem motorista e não
  encontrado/inativo, e antes de `TRIP_CREW_HELPER_NOT_ELIGIBLE`.
- `TripDriverCannotDriveError` em `apps/api-transportada/src/trips/domain/trip.error.ts`, com
  comentário distinguindo-o de `TRIP_CREW_HELPER_CANNOT_DRIVE` (403, o ajudante já na viagem tentando
  despachar).
- Leitura: `canDrive: fleetDrivers.canDrive` no `listDrivers` de
  `apps/api-transportada/src/trips/infrastructure/drizzle-trip.repository.ts`. Criação, troca de
  tripulação e aceite passam pelo mesmo funil (`trip-crew.service.ts`), sem mudança neles.
- Fakes que montam candidato ganham `canDrive: true`: `test/trip-application/trip-use-case.contract.ts`,
  `test/routing-application/trip-composer-adapter.contract.ts`.

### Contrato vermelho antes do código

`test/trip-domain/trip-policy.contract.ts`, quatro testes novos: ajudante-puro na lista de motoristas
(erro, código, 409, `details` com os dois ids na ordem pedida); ajudante-puro na lista de ajudantes
(aceito); motorista que também ajuda válido nos dois papéis; ordem das recusas (duplicado → ajudante
sem motorista → não encontrado → inativo, todos com um ajudante-puro na lista).

- Antes da classe de erro: `SyntaxError: Export named 'TripDriverCannotDriveError' not found` (`0 pass · 1 fail`).
- Com a classe e sem a checagem: `bun --env-file=../../.env.test test --timeout 120000 ./test/trip-domain.contract.test.ts`
  → `366 pass · 1 fail` (`rejects a helper-only record in the driver list, naming every one in details`).
- Com a checagem: `367 pass · 0 fail`.

`test/integration/trip-repository.integration.ts` ("grava e lê a tripulação com motorista e
ajudantes"): o segundo ajudante passa a ser ajudante-puro (`canDrive: false`) e o `listDrivers`
confere `canDrive`/`canActAsHelper` dos três.

### Prova por mutação

- Checagem trocada por `nonDrivingIds.length < 0` → `366 pass · 1 fail` no mesmo teste. Restaurado.
- `canDrive: fleetDrivers.canDrive` arrancado do select → `trip-repository.integration.ts`
  `4 pass · 1 fail` ("grava e lê a tripulação com motorista e ajudantes"). Restaurado.

### Gates

Mesmo Postgres 18.4 nativo descartável da T1 (porta 65435; o `.env.test` aponta para 65434, vazio).

- Contrato da API: `bun --env-file=../../.env.test test --timeout 120000` →
  `8754 pass · 0 fail · Ran 8754 tests across 193 files` (0 skip).
- Integração tocada: `bun --env-file=../../.env.test test --timeout 120000 ./test/integration/trip-repository.integration.ts`
  → `5 pass · 0 fail` (0 skip). De quebra, `./test/integration/trip-crew-update.integration.ts` →
  `10 pass · 0 fail` (0 skip).
- `bun run typecheck` (raiz) → exit 0.
- `bun run lint` (cwd `apps/api-transportada`) → exit 0.
- `bunx prettier --write` nos arquivos tocados.

### Lacunas levadas ao usuário (fora da T2)

- MDF-e avulso (`src/mdfe-manifests/application/mdfe-manifest-crew.service.ts`) monta condutores sem
  passar por `resolveTripCrew` e não lê `can_drive`.
- A proposta de viagem / consulta de motoristas ainda não filtra `can_drive` — é a T6.

## T3 — Reconciliação papel → colunas em `replaceRoles`

Data: 2026-10-02. Branch `work/spec-235-ajudante`.

### O que mudou

- Política pura `reconcileFleetCrewCapabilities`
  (`apps/api-transportada/src/identity/domain/fleet-role-reconciliation.policy.ts`): recebe papéis antes,
  papéis depois e as colunas atuais; cada coluna só muda pela entrada/saída do papel que lhe corresponde
  (`helper` → `can_act_as_helper`; `driver`/`aggregate` → `can_drive`), então troca que não toca a frota
  devolve `unchanged` e o switch da ficha sobrevive a troca alheia. Resultado `false/false` lança
  `FleetDriverProfileEmptyError`.
- `FleetDriverProfileEmptyError` (`409 FLEET_DRIVER_PROFILE_EMPTY`) em
  `apps/api-transportada/src/fleet/domain/fleet.error.ts`, ao lado dos `FLEET_DRIVER_*`.
- `replaceRoles` (`apps/api-transportada/src/identity/infrastructure/drizzle-company-user.repository.ts`)
  chama `reconcileFleetDriverWithRoles` dentro da transação, antes de apagar/regravar os papéis: acha a
  ficha por `company_id` + `membership_id` com `SELECT … FOR UPDATE`, **depois** lê os papéis antigos
  (assim duas trocas simultâneas da mesma pessoa ficam em fila na trava e a segunda lê o que a primeira
  gravou), decide pela política e, se mudou, faz `UPDATE` com `version = version + 1`. Sem ficha
  vinculada, nada. A recusa sai de dentro do callback e a transação desfaz tudo.
- Use case `replace-company-user-roles.use-case.ts` e porta **sem mudança**: o erro atravessa até o
  roteador como qualquer `ApiError`. O fixture HTTP ganhou a recusa `fleet-profile-empty`.

### Contrato vermelho antes do código

- `test/user-administration-application/fleet-role-reconciliation.contract.ts` (novo, ligado ao
  entrypoint `test/user-administration-application.contract.test.ts`, que já está no script `test`): 15
  testes explícitos, sem `test.each`. Antes do código:
  `SyntaxError: Export named 'FleetDriverProfileEmptyError' not found` e, com o erro criado,
  `Cannot find module '../../src/identity/domain/fleet-role-reconciliation.policy.js'`.
- `test/user-administration-http/routes.contract.ts`: "troca que deixaria a ficha de frota sem perfil
  responde 409" (`FLEET_DRIVER_PROFILE_EMPTY`). Passa assim que a classe existe — o mapeamento de
  `ApiError` é genérico; fica como guarda do código estável.
- `test/integration/company-user-fleet-link.integration.ts`, describe novo "troca de papéis —
  reconciliação com a ficha de frota" (já no `test:integration`). Antes do código:
  `8 pass · 7 fail` (os 6 originais + "fiscal não mexe" e "pessoa sem ficha" passam; helper entra,
  helper sai de quem dirige, helper sai de ajudante puro, driver entra, driver+aggregate saem, outra
  empresa e trava falham).

Casos da integração (9): dar `fiscal` não mexe na ficha (versão 1); `helper` entrou liga
`can_act_as_helper` e versão 2; `helper` saiu de quem dirige desliga só ele; `helper` saiu de ajudante
puro → `FleetDriverProfileEmptyError` e **nem papéis nem ficha** mudam; `driver` entrou num ajudante
puro liga `can_drive`; `driver`+`aggregate` saíram de quem não ajuda → 409 e nada muda; ficha da
mesma pessoa em **outra empresa** (vínculo próprio lá) intocada; falha ao gravar os papéis (papel fora
do catálogo, CHECK) desfaz também a ficha; pessoa sem ficha troca de papel sem reconciliar; com a ficha
travada por outra transação, a troca **espera** (300 ms sem concluir) e decide sobre o valor gravado
por ela (switch ligado → vira ajudante puro, versão 3, em vez de 409).

### Prova por mutação

Postgres 18.4 nativo descartável da T1 (porta 65435). Cada mutação restaurada e conferida com `cmp`.

- Política: `resolveCapability` sempre devolvendo o atual → contrato `5 pass · 10 fail`.
- Política: guarda `false/false` trocada por `if (false)` → contrato `13 pass · 2 fail` (as duas
  recusas) e integração `13 pass · 2 fail` (o `UPDATE` bate no CHECK `23514`, não no 409).
- Repositório: `UPDATE` da reconciliação arrancado → integração `10 pass · 5 fail`.
- Repositório: `.for('update')` arrancado → integração `14 pass · 1 fail` ("espera a ficha travada…").
- Repositório: `replaceRoles` sem `this.database.transaction` → na primeira rodada **passou tudo** (o
  `SELECT … FOR UPDATE` em autocommit também espera a trava, e a recusa sai antes de qualquer escrita).
  Por isso entrou o caso "falha ao gravar os papéis desfaz também a ficha"; com ele, a mesma mutação dá
  `15 pass · 1 fail`.

### Gates

Banco: `.env.test` aponta para `127.0.0.1:65434` (vazio). Postgres 18.4 nativo no scratchpad, porta
65435, `LC_ALL=C` e sem soquete Unix (caminho do scratchpad passa de 103 bytes),
`DATABASE_URL`/`DRIZZLE_TEST_DATABASE_URL` sobrescritos no shell. Parado ao fim.

- Contrato da API: `bun --env-file=../../.env.test test --timeout 120000` →
  `8770 pass · 0 fail · Ran 8770 tests across 193 files` (T2: 8754; +15 política, +1 rota).
- Integração, um arquivo por vez (`bun --env-file=../../.env.test test --timeout 120000 ./test/integration/<x>.integration.ts`),
  nenhum `(skip)`: company-user-fleet-link 16/0 · company-user-listing 10/0 · company-user-removal 4/0 ·
  identity-subject-relink 2/0 · invitation-status-join 1/0 · local-identity-seed 5/0 ·
  fleet-vehicle-repository 6/0 · driver-score 8/0 · current-driver-trip-concluded-window 4/0 ·
  driver-delivery-proof-read 4/0 · occurrence-conversation-driver 2/0 · whatsapp-command-driver 5/0 ·
  whatsapp-driver-flow-actions 1/0 · freight-region-repository 10/0 · pending-items 1/0 ·
  trip-repository 5/0 · trip-crew-update 10/0.
- `db:test` (equivalente do `make migration-test` sem `postgres-up`) → `115 pass · 0 fail`;
  `db:generate --name probe` → `no_changes`.
- `bun run format:check` (raiz) → "All matched files use Prettier code style!".
- `bun run lint` (raiz, todas as apps) → exit 0 (avisos antigos do frontend, nenhum novo).
- `bun run typecheck` (raiz) → exit 0.
- `bun run build` (raiz) → exit 0.
- `bun run test` (raiz) → **exit 1**: API 8770/0, worker 1558/0, cron 101/0, e o
  `frontend-transportada` `6421 pass · 1 fail` em `frontend foundation contract > keeps the allowlist in
sync with the API authorization policy` — o `COMPANY_ROLES` do painel (`useAuthMe.query.ts`) ainda
  não tem `helper`. Vem da T1 e é escopo da **T10** (já registrado em § T1 "Fora desta task"); a T3 não
  toca painel. As apps seguintes, rodadas à parte: frontend-client 89/0, frontend-driver 1048/0,
  frontend-landing 131/0. Logo `make check` **não** está verde ao fim da Fase 1 até a T10.

### Limites conhecidos (fora desta task, D4)

- `addRoles` / `assign-company-user-roles.use-case.ts` (atribuição em lote, só acrescenta) não
  reconcilia: dar `helper` em lote não liga `can_act_as_helper`.
- Papéis herdados por **grupo** (`company_group_roles`) não entram na conta: só os papéis diretos de
  `membership_roles`.

## Fechamento da Fase 1 — painel aceita `helper` em `/auth/me`

O `make check` da Fase 1 ficou vermelho em `frontend foundation contract > keeps the allowlist in sync
with the API authorization policy`: a lista fechada de `useAuthMe.query.ts` não tinha `helper`, e um
usuário com o papel derrubaria o `/auth/me` do painel. `helper` entrou na lista (a parte de T10 que
precisa subir junto da API); `bun test ./test/frontend-contract.test.ts` → 15 pass · 0 fail; typecheck do
frontend em exit 0. O resto da T10 (rótulos, convite, tabela) segue na Fase 3.

## T4 — Perfil `helper` no cadastro de frota e `canDrive` na leitura

Data: 2026-10-02. Branch `work/spec-235-ajudante`.

### O que mudou

- `FLEET_DRIVER_PROFILES` ganha `helper` (`src/fleet/domain/fleet-driver-profile.constant.ts`); o
  `satisfies readonly CompanyRole[]` e o `z.enum(FLEET_DRIVER_PROFILES)` do `POST` seguem o catálogo.
- **A CNH já era opcional no corpo** (`licenseNumber` = `optionalDigits`, `licenseCategory` =
  `literal('').or(enum)`, `licenseExpiresAt` = `iso.date().nullable()`), então não há schema condicional
  por perfil: o contrato só prova que o `helper` entra sem os três campos. `grep licenseExpiresAt src`
  só acha schema, semente, porta, mapper, política do agregado, rota e o schema do corpo — nenhum use
  case nem política de viagem lê vencimento, logo **nenhum gate de vencimento alcança o helper** (nada a
  alterar).
- `createFleetDriversUseCase.create` traduz o perfil em colunas (D2): `helper` ⇒ `canDrive = false` e
  `canActAsHelper = true` (ignora o valor do corpo); `driver`/`aggregate` ⇒ `canDrive = true` e
  `canActAsHelper` como veio. `canDrive` vai no `create` do repositório (campo novo do input da porta,
  gravado no `INSERT`) porque criar a ficha e o convite não compartilham transação — corrigir depois do
  `INSERT` deixaria a ficha nascer `can_drive = true`.
- Leitura: `FleetDriver.canDrive` (porta), `mapDriver`, `serializeDriver` (`GET` lista, `POST`, `PATCH`).
  O projeto não tem schema de **resposta** de frota (só de corpo), então não há schema a estender.
- `PATCH`: o corpo é `strict` e não aceita `canDrive` nem `profile` (hoje ele não trata perfil e nada foi
  inventado); `toDriverColumns` — usado também no `UPDATE` — não carrega `canDrive`, então só criação e
  troca de papéis (T3) o escrevem. Desligar `canActAsHelper` de quem não dirige bate no CHECK
  `fleet_drivers_crew_capability_check` (`23514`), que `runGuarded` converte em
  `FleetDriverProfileEmptyError` (`409 FLEET_DRIVER_PROFILE_EMPTY`) — nunca 500. A trava otimista segue:
  com versão velha nenhuma linha casa e o `UPDATE` devolve `null` sem avaliar o CHECK.
- Seed: o contrato "a semente cobre os dois perfis do catálogo" comparava com `FLEET_DRIVER_PROFILES`
  inteiro e passaria a exigir o `helper`; por ora ele filtra o `helper` (a T7 devolve a cobertura
  completa com as sementes novas).
- `package.json`: `test:integration` ganha `./test/integration/fleet-driver-repository.integration.ts`
  (arquivo novo; o repositório de motorista não tinha integração própria).

### Contrato vermelho antes do código

`bun --env-file=../../.env.test test --timeout 120000 ./test/fleet-http.contract.test.ts ./test/fleet-application.contract.test.ts`
→ `233 pass · 6 fail` (helper aceito sem CNH, `canDrive` em lista/criação/`PATCH`, tradução perfil →
colunas, `createCalls` com `canDrive`, lista de ficha). Integração nova:
`./test/integration/fleet-driver-repository.integration.ts` → `0 pass · 3 fail` antes do código.

Casos: use case — seis combinações perfil × switch (sem `test.each`); HTTP — helper sem CNH
encaminhado como `profile: 'helper'`, `canDrive` presente nas três respostas e `canDrive` no corpo de
`POST`/`PATCH` recusado com 400; integração — colunas gravadas e lidas por `findById`/`list`, recusa 409
sem alterar linha nem versão, `UPDATE` que não mexe em `can_drive` (ajudante renomeado, motorista liga e
desliga o switch) e versão velha → `null`.

### Prova por mutação

Cada uma restaurada por cópia do original.

- `canDrive: !isHelperProfile` → `canDrive: true` → `238 pass · 1 fail` (tradução perfil → colunas).
- `isHelperProfile || input.driver.canActAsHelper` → só o corpo → `238 pass · 1 fail` (mesmo teste).
- `serializeDriver` sem `canDrive` → `236 pass · 3 fail`.
- `canDrive: input.canDrive` arrancado do `INSERT` → integração `0 pass · 3 fail`.
- Conversão do CHECK em 409 desligada → integração `2 pass · 1 fail` (a recusa).
- `canDrive` fora do `mapDriver` → integração `0 pass · 3 fail`.
- `helper` fora de `FLEET_DRIVER_PROFILES` → `238 pass · 1 fail` (helper sem CNH aceito).

### Gates

Postgres 18.4 nativo descartável da T1 (porta 65435, usuário `postgres`, banco `transportada`
migrado; `.env.test` aponta para 65434, vazio), `DATABASE_URL`/`DRIZZLE_TEST_DATABASE_URL` no shell.

- Contrato da API: `bun --env-file=../../.env.test test --timeout 120000` →
  `8773 pass · 0 fail · Ran 8773 tests across 193 files` (0 skip; T3: 8770).
- Integração: fleet-driver-repository 3/0 · driver-score 8/0 · company-user-fleet-link 16/0 (0 skip).
- `bun run typecheck` (raiz) sem erro · `bun run lint` (cwd `apps/api-transportada`) exit 0 ·
  `prettier --check` nos arquivos tocados limpo.

## T5 — `helper` no convite (`FLEET_LINKED_ROLES`) e contrato de permissão

Data: 2026-10-02. Branch `work/spec-235-ajudante`.

### O que mudou

- **`trip.read` para o `helper` já estava na T1** (`COMPANY_ROLE_PERMISSIONS.helper`); a T5 só acrescenta o
  contrato dela e a D8.
- `FLEET_LINKED_ROLES` estava duplicado (`invite-company-user.use-case.ts` e
  `drizzle-company-user.repository.ts`). Passou a **uma** constante,
  `src/identity/domain/fleet-linked-roles.constant.ts` (`aggregate`, `driver`, `helper`), importada pelos
  dois. Não deriva de `FLEET_DRIVER_PROFILES` para não acoplar identidade a frota; um contrato
  (`fleet-role-reconciliation.contract.ts`: "são exatamente os perfis do cadastro de frota") mantém as
  duas em sintonia.
- Convite com `helper` e CPF casa a ficha órfã (`linkFleetDriver`) e responde `fleetLink: 'linked'`; sem
  ficha, `'no-driver-record'` e o convite sai.
- **Decisão (D2 no convite):** ao vincular a ficha órfã, `linkFleetDriver` agora lê a ficha com
  `SELECT … FOR UPDATE` e aplica a política pura nova `resolveInvitedFleetCrewCapabilities`
  (`fleet-role-reconciliation.policy.ts`): com `helper` nos papéis, `can_act_as_helper = true` e
  `can_drive` = há `driver`/`aggregate` nos papéis; sem `helper`, **nada muda** (o convite de motorista
  continua byte a byte como era, sem mexer em colunas nem em `version`). Mudou ⇒ `version + 1`. Não usei
  `reconcileFleetCrewCapabilities` porque ela é por diferença de papéis: com papéis antigos vazios, um
  `helper` sozinho deixaria `can_drive = true` numa ficha órfã de motorista, contra a D2 (perfil `helper`
  ⇒ `can_drive = false`).
- `test/helper-role.contract.test.ts` (molde do separador, entrou no script `test`): as rotas são as do
  contrato do separador mais as do app do motorista (`/me`, cobrança de entrega), que é onde `trip.read` e
  `trip.report` se separam.

### Contrato vermelho antes do código

Com o código de `src/identity` revertido e a constante apenas com o par antigo:
`user-administration-application.contract.test.ts` → `0 pass · 1 fail` (o arquivo nem carrega: falta
`resolveInvitedFleetCrewCapabilities`); `company-user-fleet-link.integration.ts` → `18 pass · 2 fail`
(ajudante convidado deixa a ficha só ajudando; helper + motorista mantém a ficha dirigindo e liga o ajudar).
O `helper-role` é verde de partida porque a permissão veio na T1; ele foi provado por mutação (abaixo).

### Achado para o usuário (fora do escopo)

`trip.read` é a permissão das rotas de **leitura do app do motorista**: o ajudante alcança
`GET /me/trips/current`, `.../documents/:id/proof`, `.../manifests/:id` (e o DAMDFE),
`.../occurrence-conversations`, `.../occurrences/:id/messages` (+ `POST .../messages/read`),
`GET /delivery-charges` e `GET /delivery-clients/:id/charge-rules`. Nenhuma escrita (`trip.report`).
O contrato lista as nove por extenso. Se a leitura de cobrança de entrega não for para o ajudante, é
decisão de produto à parte (spec fora do escopo: "o que o `frontend-driver` mostra a ele").

### Prova por mutação

- `helper` fora do `if` da política (`!roles.includes(HELPER_ROLE)` removido) → `138 pass · 1 fail`.
- `canDrive` da política fixo em `false` → `137 pass · 2 fail`; `canActAsHelper` em `false` → `136 pass · 3 fail`.
- `helper` fora de `FLEET_LINKED_ROLES` → `136 pass · 3 fail` (sintonia + as duas do convite).
- Repositório sem `version + 1` → integração `18 pass · 2 fail`; sem usar a política → `18 pass · 2 fail`.
- `'helper'` trocado por outro literal na política → `132 pass · 7 fail`.
- Permissão `helper` com `trip.report` (ou `fleet.read`) → `helper-role` `1 pass · 4 fail`.

### Gates

Postgres 18.4 nativo descartável (porta 65435), `DATABASE_URL`/`DRIZZLE_TEST_DATABASE_URL` no shell.

- Contrato da API: `bun --env-file=../../.env.test test --timeout 120000` →
  `8785 pass · 0 fail · Ran 8785 tests across 194 files` (0 skip; T4: 8773).
- Integração, uma por vez, 0 skip: company-user-fleet-link 20/0 · company-user-listing 10/0 ·
  company-user-removal 4/0 · identity-subject-relink 2/0 · invitation-status-join 1/0 ·
  local-identity-seed 5/0 · fleet-driver-repository 3/0.
- `bun run typecheck` (raiz) exit 0 · `bun run lint` (cwd `apps/api-transportada`) exit 0 ·
  `prettier --check` limpo.

## T6 — A proposta multi-veículo recusa quem não dirige como motorista

Data: 2026-10-02. Branch `work/spec-235-ajudante`.

### O que mudou

- Porta `MultiVehicleSuggestionRepository.findIneligibleDriverIds` (gêmeo de `findIneligibleHelperIds`):
  dos ids dados, quais **não** têm `can_drive = true` na ficha **desta empresa**. Implementação
  Drizzle pergunta quem é elegível e subtrai, como a do ajudante. Ausente/inativo/outra empresa continua
  respondendo por `findUnavailableDriverIds`.
- `MultiVehicleSuggestionDriverCannotDriveError` (`routing.error.ts`, `409
ROUTE_SUGGESTION_DRIVER_CANNOT_DRIVE`, ids em `details` com `field: 'driverIds'`), no padrão do
  `MultiVehicleSuggestionHelperNotEligibleError`.
- `createMultiVehicleSuggestionUseCase.create` confere `driverIds` (só os `driverId` dos veículos, nunca os
  ajudantes) na mesma `Promise.all` das outras conferências — todas são validação do caminho crítico, e
  qualquer uma falhar deve mesmo recusar a proposta. A recusa vem **depois** de indisponível e **antes** de
  ajudante não elegível (mesma ordem da T2 na viagem). Sem filtro "só os disponíveis": quem some
  (`unavailable`) já lançou antes.
- **Não existe consulta separada de "candidatos a motorista da proposta"** neste backend: a proposta recebe
  `driverIds` do chamador e só os valida; o seletor é o `GET /fleet/drivers` do painel (Fase 3, T11). Logo
  a consulta de candidatos de que a tarefa fala é esta validação.
- `package.json`: `test:integration` ganha
  `./test/integration/multi-vehicle-suggestion-driver-eligibility.integration.ts` (arquivo novo).

### Contrato vermelho antes do código

`routing-application.contract.test.ts` → `0 pass · 1 fail` (`Export named
'MultiVehicleSuggestionDriverCannotDriveError' not found`); integração nova → `TypeError:
repository.findIneligibleDriverIds is not a function`, `0 pass · 1 fail`.

Casos: use case — recusa com ids em `details`, 409 e código estável, sem `create`; o motorista
indisponível responde antes do que não dirige; o ajudante-puro como **ajudante** passa (o stub filtra pelo
que o use case pergunta, então só prova se os ajudantes não entram na consulta de `can_drive`);
integração — motorista, ajudante-puro, motorista que ajuda e ficha de **outra empresa** (dirige e ajuda):
`findIneligibleDriverIds` devolve ajudante-puro e a de fora; `findIneligibleHelperIds` devolve o motorista
puro e a de fora; lista vazia → `[]`.

### Prova por mutação

- Recusa desligada (`if (false)`) → `93 pass · 1 fail`.
- Ajudantes somados à consulta de `can_drive` → `93 pass · 1 fail` ("não confere can_drive dos ajudantes").
- Código do erro trocado → `93 pass · 1 fail`.
- `eq(canDrive, true)` arrancado da consulta → integração `0 pass · 1 fail`.
- Filtro de empresa arrancado **da consulta nova** → integração `0 pass · 1 fail` (a primeira tentativa
  mutou a consulta vizinha por engano — `findUnavailableDriverIds`, primeira ocorrência do texto — e
  sobreviveu; refeita com âncora que inclui `canDrive`).
- Sobreviveu e foi removido: um filtro `ineligible && !unavailable` que escrevi no use case era código
  morto (a indisponibilidade lança antes), então saiu em vez de ganhar teste.

### Gates

Postgres 18.4 nativo descartável (65435), variáveis no shell.

- Contrato da API: `bun --env-file=../../.env.test test --timeout 120000` →
  `8788 pass · 0 fail · Ran 8788 tests across 194 files` (0 skip; T5: 8785).
- Integração, 0 skip: multi-vehicle-suggestion-driver-eligibility 1/0 · multi-vehicle-suggestion 13/0 ·
  suggestion-helper-cost 2/0.
- `bun run typecheck` (raiz) exit 0 · `bun run lint` (cwd `apps/api-transportada`) exit 0 ·
  `prettier --check` limpo.

## T6b — O MDF-e avulso recusa quem não dirige como condutor

Data: 2026-10-02. Branch `work/spec-235-ajudante`.

### O que mudou

- `MdfeManifestDriver.canDrive` (porta) e `canDrive: fleetDrivers.canDrive` no `listDrivers` de
  `drizzle-mdfe-manifest.repository.ts`.
- `resolveManifestCrew` (`mdfe-manifest-crew.service.ts`): depois de validar cada condutor (duplicado →
  não encontrado → inativo, na ordem que já existia), junta os ids com `canDrive === false` e lança
  **`TripDriverCannotDriveError`** (`409 TRIP_DRIVER_CANNOT_DRIVE`, ids em `details`, `field: 'driverIds'`).
- **Decisão: reuso do erro da viagem.** O módulo `mdfe-manifests` já importa de `trips`
  (`trips/domain/trip-manifest.policy`, `trips/application/read-trip-fiscal-readiness.use-case`), e a classe é
  um erro de domínio puro, sem I/O; um gêmeo no módulo mdfe seria a mesma classe com outro nome. O nome
  "Trip…" num contexto de MDF-e é o preço, e o código estável fica igual ao da viagem para o painel.
- A função é a mesma que o `POST /trips/:id/mdfe-manifests` usa (condutores = `trip.drivers` com
  `role = 'driver'`), então o MDF-e **da viagem** passa a recusar a mesma ficha. Consequência para o caso
  extremo da spec ("motorista com viagem aberta que perde `driver`"): a viagem segue como está, mas gerar o
  MDF-e dela devolve `409 TRIP_DRIVER_CANNOT_DRIVE` até a tripulação ser corrigida (`PATCH /trips/:id/crew`
  enquanto o estado permitir). Isso é D5 aplicada, e não foi coberto por teste da viagem (o fixture dela
  tem os condutores fixos).
- `package.json`: `test:integration` ganha `./test/integration/mdfe-manifest-driver-capability.integration.ts`.

### Contrato vermelho antes do código

`mdfe-application.contract.test.ts` → `57 pass · 1 fail` (recusa de quem não dirige; o teste "inativo
responde antes" já passava e guarda a ordem). Integração nova → `0 pass · 1 fail` (`canDrive` ausente do
`listDrivers`).

Casos: recusa com dois condutores onde só o segundo não dirige (ids em `details` = só ele, nada criado);
condutor inativo que também não dirige responde `MDFE_MANIFEST_DRIVER_NOT_AVAILABLE` (422); integração —
`listDrivers` devolve `canDrive` de cada ficha da empresa e **não** devolve a de outra empresa.

### Prova por mutação

- Recusa desligada (`if (false)`) → `57 pass · 1 fail`.
- `canDrive` avaliado errado (`=== undefined`) → `57 pass · 1 fail`.
- `canDrive` arrancado do `select` → integração `0 pass · 1 fail`.

### Gates

Postgres 18.4 nativo descartável (65435), variáveis no shell.

- Contrato da API: `bun --env-file=../../.env.test test --timeout 120000` →
  `8790 pass · 0 fail · Ran 8790 tests across 194 files` (0 skip; T6: 8788).
- Integração, 0 skip: mdfe-manifest-driver-capability 1/0 · mdfe-document 5/0 ·
  mixed-cargo-end-to-end (usa o repositório de MDF-e) 1/0.
- `bun run typecheck` (raiz) exit 0 · `bun run lint` (cwd `apps/api-transportada`) exit 0 ·
  `prettier --check` limpo.

## T7 — Semente local com ajudante puro e motorista que ajuda

Data: 2026-10-02. Branch `work/spec-235-ajudante`.

### O que mudou

- `LOCAL_FLEET_DRIVER_SEEDS` ganha **duas sementes novas** (e não altera as seis antigas, porque a
  semente é idempotente por CPF — numa base local já semeada, mexer numa existente seria ignorado, e as
  novas entram na próxima execução): `Jussara Almeida Nogueira` (perfil `driver`, `canActAsHelper = true`,
  com CNH) e `Reginaldo Pires Camargo` (perfil `helper`, sem CNH). Nomes, CPFs (dígitos de teste) e
  telefones fictícios de propósito.
- `buildSeed` aceita `canActAsHelper` (padrão: `true` só para perfil `helper`) e `licenseNumber` opcional;
  ausente ⇒ `buildSeedLicense` devolve CNH vazia (número, categoria, cidade e UF do DETRAN, 1ª habilitação
  e validade nulos). O comentário "a base de bancada nasce sem ninguém marcado como ajudante" foi
  reescrito.
- O serviço `seedLocalFleetDrivers` **já** passava pelo `createFleetDriversUseCase` real; nenhuma mudança
  nele. As colunas saem da tradução perfil → colunas da T4.
- O contrato "a semente cobre os dois perfis" passou a "os três" (a exceção provisória da T4 saiu).
- `package.json`: `test:integration` ganha `./test/integration/local-fleet-seed-crew.integration.ts`.

### Contrato vermelho antes do código

`fleet-application.contract.test.ts` → `109 pass · 4 fail` (três perfis, ajudante sem CNH, motorista que
ajuda, só dois marcados). Integração nova → `0 pass · 1 fail` (sem a semente do ajudante a contagem de
"só ajuda" é 0).

A integração roda a **semente inteira** pelo caso de uso real e pelo repositório Drizzle real contra
Postgres, trocando apenas o convite do Keycloak por um que abre o usuário no banco
(`DrizzleCompanyUserRepository.createInvitedUser`): confere `can_drive`/`can_act_as_helper` de cada
semente, CNH vazia no ajudante, exatamente um "só ajuda" e um "dirige e ajuda", e que a segunda execução
pula todas.

### Prova por mutação

- Semente do ajudante com perfil `driver` → `110 pass · 3 fail`.
- `canActAsHelper` tirado do motorista que ajuda → `111 pass · 2 fail`.
- `buildSeedLicense` sempre com CNH → `112 pass · 1 fail`.
- `canDrive: !isHelperProfile` → `true` no caso de uso → integração `0 pass · 1 fail`.
- Sobrevivente conhecido: tirar `isHelperProfile ||` do caso de uso **não** derruba a integração da
  semente, porque a semente do ajudante já traz `canActAsHelper = true`; quem mata essa mutação é o
  contrato de tradução da T4 (`translates the profile into the crew columns on create`, com o corpo em
  `false`).

### Gates

Postgres 18.4 nativo descartável (65435), variáveis no shell.

- Contrato da API: `bun --env-file=../../.env.test test --timeout 120000` →
  `8793 pass · 0 fail · Ran 8793 tests across 194 files` (0 skip; T6b: 8790).
- Integração, 0 skip: local-fleet-seed-crew 1/0 · local-identity-seed 5/0 · fleet-driver-repository 3/0.
- `bun run typecheck` (raiz) exit 0 · `bun run lint` (cwd `apps/api-transportada`) exit 0 ·
  `prettier --check` limpo.

## T8 — Tipos, constantes, validação de resposta e formulário com `helper` e `canDrive`

Data: 2026-10-02. Branch `work/spec-235-ajudante`.

### O que mudou

- `FLEET_DRIVER_PROFILES` ganha `helper` (ordem da API: `aggregate`, `driver`, `helper`); `driverProfileOption.helper`
  entra nos dois locales (o contrato de paridade do seletor itera os perfis).
- `canDrive` entra **só na leitura**: `FleetDriverDetail`, `DRIVER_DETAIL_KEYS` e `isDriver` (`isBoolean`). Não está em
  `DRIVER_BODY_KEYS` nem em `DRIVER_CREATE_BODY_KEYS` — o PATCH é strict e a API grava as colunas pelo perfil.
  ⚠️ Como toda chave da lista de leitura, a API já sobe com ele (Fase 2); sem o campo, a linha seria recusada.
- Estado do formulário ganha `canDrive` (abre `true`; a ficha carregada traz o gravado).
- `isHelperOnlyDriver(state)` (`profile === 'helper'` na criação, `!canDrive` na edição, onde a API não devolve o
  papel). Para ele `toDriverBody` zera os cinco campos de CNH e manda `canActAsHelper: true`, mesmo com CNH digitada
  antes de trocar de perfil.

### Contrato vermelho antes do código

`test/fleet/driver-helper-profile.contract.ts` (entra por `fleet.contract.test.ts`, já na lista do `package.json`):
`626 tests · 11 fail` antes do código (catálogo, chaves, validador, formulário, corpo).

### Prova por mutação

- `hasLicense = true` (CNH sempre no corpo) → 2 fail. Tirar `isBoolean(value.canDrive)` → 1 fail. Tirar `canDrive` de
  `DRIVER_DETAIL_KEYS` → 5 fail. Cada arquivo restaurado e conferido com `cmp`.

### Gates

- `bun run test` (app): `6430 pass · 0 fail · 32 files` + hooks `327 pass · 0 fail`.
- `bun run typecheck` (raiz) exit 0 · `eslint` (cwd da app) 0 erros (16 warnings antigos) · `prettier --check` limpo.

## T9 — Ficha e criação rápida: opção "Ajudante", CNH oculta, "Pode atuar como ajudante" e "Diária própria"

Data: 2026-10-02. Branch `work/spec-235-ajudante`.

### O que mudou

- Seletor de perfil já lista `helper` (T8); rótulo "Ajudante"/"Helper" e a dica do perfil agora diz que ele não
  dirige e não precisa de CNH.
- **CNH oculta, não desabilitada**, na aba e no diálogo: número, categoria, primeira habilitação e validade
  (`DriverForm`, `DriverQuickCreateDialog`) e UF/cidade de emissão (`DriverPersonalFields`) só renderizam com
  `hasLicense = !isHelperOnlyDriver(state)`. Mesmo critério do corpo (T8): perfil `helper` na criação, ou ficha
  carregada com `canDrive` falso na edição.
- `DriverHelperFields` (novo): `Checkbox` "Pode atuar como ajudante" — não existe primitivo de switch no design
  system, e o `Checkbox` é o obrigatório (`docs/frontend/checkboxes.md`); ligado e **travado** (com a dica de
  perfil) para quem só ajuda, livre para motorista/agregado. "Diária própria (R$/dia)" aparece para quem pode
  ajudar, com a dica "Vazio usa a diária geral da empresa." (`FleetMoneyField` ganhou `hint`, como os vizinhos).
- `helperDailyRate` passa pela mesma conversão da diária do motorista: a ficha mostra `180,00`, o corpo sai
  `180.0000` (antes da T9 o decimal cru da API iria à máscara).
- `FLEET_DRIVER_PROFILE_EMPTY` → `profileEmpty` ("A ficha precisa dirigir ou atuar como ajudante…"), nos dois
  idiomas; não cai no "Não foi possível salvar" genérico.
- Lista de motoristas: selo discreto "Ajudante" (mesmo molde de `statusBadge`) quando `canDrive` é falso, e a
  coluna CNH mostra "—" para ficha sem número.
- Spec 149 T12 marcada, com a ressalva de que o painel geral "Diária do ajudante" não existe no painel.

### Contrato vermelho antes do código

`test/fleet/driver-helper-fields.contract.tsx` (importado por `fleet.contract.test.ts`): renderiza a ficha de
verdade (`renderToStaticMarkup`, i18n real, `QueryClientProvider`, ambiente falso restaurado ao fim) e confere
rótulo presente/ausente. Primeira execução: `Cannot find module DriverHelperFields.component` (0 pass · 1 fail).

### Prova por mutação (arquivos restaurados e conferidos com `cmp`)

- `hasLicense = true` na aba → 2 fail · `disabled={false}` no interruptor → 2 fail · diária sempre escondida → 3 fail
  · selo sempre escondido → 1 fail · `hasLicense = true` em `DriverPersonalFields` → 1 fail · mapa de erro
  `FLEET_DRIVER_PROFILE_EMPTY` removido → 1 fail.
- Limite conhecido: o perfil `helper` **escolhido na criação** só é provado em `DriverPersonalFields` e no corpo
  (a ficha estática não simula o clique); na aba/diálogo a prova é o render de `canDrive` falso mais o contrato de
  fiação (`hasLicense` e `DriverHelperFields` nos dois arquivos).

### Gates

- `bun run test` (app): `6443 pass · 0 fail · 32 files` + hooks `327 pass · 0 fail`.
- `bun run typecheck` (app) exit 0 · `eslint` (cwd da app) 0 erros (16 warnings antigos) · `prettier --check` limpo.
- `DriverForm.component.tsx` segue acima de 200 linhas (357; eram 345): dívida anterior, não extraída aqui porque
  vários contratos antigos leem os `label={t('…')}` desse arquivo.

## T10 — Acesso: papel "Ajudante" no convite, na tabela e nas listas fechadas

Data: 2026-10-02. Branch `work/spec-235-ajudante`.

### Todas as cópias da lista de papéis (grep `'separator'` em `src` e `test` da app)

| Cópia                                                                                             | Situação                                                                                                           |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `identity/queries/useAuthMe.query.ts` (`COMPANY_ROLES`)                                           | já tinha `helper` (248e59e77); coberta pelo teste de sincronia com a API que já existia                            |
| `identity/shared/companyUsers.constant.ts` (`COMPANY_ROLES`, convite, grupos, `buildRoleChoices`) | **ganhou `helper`**; antes não tinha contrato de sincronia                                                         |
| `identity/components/CompanyUserTable.component.tsx` (`FLEET_ROLES`, local)                       | virou `FLEET_LINKED_ROLES` exportada de `companyUsers.constant.ts` (`driver`, `aggregate`, `helper`)               |
| `shared/workspaceAccess.service.ts`                                                               | só cita `separator`/`OFFICE_ROLES` na preferência de aterrissagem; **nada a acrescentar** — acesso é por permissão |
| `frontend-driver`, `frontend-client`, `frontend-landing`                                          | não têm lista de papéis (busca por `'aggregate'`/`'company-admin'` vazia)                                          |

### O que mudou

- `helper` no convite, nos grupos (mesma lista) e em `buildRoleChoices`; rótulo "Ajudante"/"Helper" em `users.role.helper`.
- A dica do CPF do convite passa a dizer "Motorista, Agregado ou Ajudante" (e o equivalente em inglês): é a pista de que
  o papel liga a ficha de frota pelo CPF. O aviso pós-convite (`fleetLink`: `linked` / `no-driver-record`) já era genérico
  — a API devolve `no-driver-record` para `helper` (T5) e a tela o mostra pelo mesmo caminho do Motorista/Agregado.
- Na tabela, quem tem papel `helper` e ficha vinculada ganha o link para a ficha, como Motorista/Agregado.
- `test/identity/company-user-edit-dialog.contract.ts` afirmava o literal `['driver', 'aggregate']` no fonte da tabela;
  passou a afirmar o import de `FLEET_LINKED_ROLES` (mesma intenção, sem congelar a lista errada).

### Contrato (vermelho antes do código)

`test/identity/helper-role.contract.ts` (importado por `identity.contract.test.ts`): primeira execução falhou com
`Export named 'FLEET_LINKED_ROLES' not found`. Cobre: `helper` no convite e em `buildRoleChoices`; lista do convite
**igual à da API** (`COMPANY_ROLES` de `identity.schema.ts`, menos `contractor` e `automation`, que não se convidam
por aqui); `FLEET_LINKED_ROLES` igual ao da API (`fleet-linked-roles.constant.ts`); a tabela decide o link por ela;
rótulo e dica nos dois idiomas; e a conta só com o papel (`trip.read`) → nenhuma entrada de menu e aterrissagem
`no-access`.

### Prova por mutação (arquivos restaurados e conferidos com `cmp`)

`helper` fora do convite → 2 fail · `FLEET_LINKED_ROLES` sem `helper` → 1 · `helper` fora de `useAuthMe` → 1 (teste de
sincronia pré-existente) · rótulo trocado → 1 · dica sem Ajudante → 1 · tabela com lista literal → 1.

### ⚠️ Achado de produto (não decidido aqui)

O papel `helper` tem só `trip.read` (D7), e **nenhum workspace do painel abre com `trip.read`** (`trip` exige `fleet.read`
ou `trip.report-on-behalf`). Quem entra no painel só com esse papel cai em `NoWorkspaceAccess`. É coerente com "fora do
escopo: aplicativo do ajudante", mas é o que a pessoa verá — decisão de produto, registrada no contrato acima.

### Gates

- `bun run test` (app): `6450 pass · 0 fail · 32 files` + hooks `327 pass · 0 fail`.
- `bun run typecheck` (raiz) exit 0 · `eslint` (cwd da app) 0 erros (16 warnings antigos) · `prettier --check` limpo.
- Sincronia de papéis com a API: `test/frontend-contract.test.ts` › `keeps the allowlist in sync with the API
authorization policy` verde (e o contrato novo cobre a lista do convite e `FLEET_LINKED_ROLES`).

## T11 — Viagem: o seletor de motoristas exclui quem não dirige

Data: 2026-10-02. Branch `work/spec-235-ajudante`.

### Seletores de condutor achados no painel (e o que foi feito)

| Seletor                                 | Arquivo                                                            | Antes                              | Agora                                                                                                                                             |
| --------------------------------------- | ------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Criação rápida da viagem                | `trip/components/TripQuickCreateDialog.component.tsx`              | ativos                             | ativos **que dirigem** (`listActiveDrivingDrivers`); o pool de ajudantes continua partindo dos ativos                                             |
| Montagem/proposta de rota               | `trip/components/TripRouteAssemblyPanel.component.tsx`             | ativos                             | ativos que dirigem                                                                                                                                |
| Troca de tripulação                     | `trip/components/TripCrewDialog.component.tsx`                     | **todas** as fichas (até inativas) | `listDriverCandidates`: sai quem não dirige; o motorista atual fica para poder ser retirado. O filtro de status **não** foi alterado (não pedido) |
| Restauração de rascunho                 | `trip/pages/TripWorkspace.page.tsx` (`selectableDriverIds`)        | ativos                             | ativos que dirigem (senão o rascunho restauraria um ajudante puro como motorista)                                                                 |
| MDF-e avulso, condutores                | `mdfe-manifest/components/MdfeManifestCreationPanel.component.tsx` | ativos                             | ativos que dirigem (mesma regra que a API aplicou na T6b)                                                                                         |
| Filtro da lista de viagens              | `trip/components/TripFilters.component.tsx`                        | todas                              | **inalterado**: é filtro por quem está na viagem (inclui ajudantes), não escolha de condutor                                                      |
| Seletor de motorista em campo           | `TripHeaderActions` (`trip.drivers`)                               | quem está na viagem                | inalterado: não lista a frota                                                                                                                     |
| Seletores de ajudante (criação e troca) | `listHelperCandidates`                                             | ativos com `canActAsHelper`        | inalterado — provado por teste: o ajudante puro está nele e não nos motoristas; o motorista que ajuda está nos dois                               |

Predicado novo: `fleet/shared/driverCrewRole.service.ts` (`listActiveDrivingDrivers`); `readTripDriverIds` e
`listDriverCandidates` em `trip/shared/tripCrewHelpers.service.ts`.

### Erro e texto

- `TRIP_DRIVER_CANNOT_DRIVE` → `driverCannotDrive` na troca de tripulação (`crewDialog.error.*`) e no mapa de feedback da
  viagem (`feedback.driverCannotDrive`, usado pela criação/aceite), nos dois idiomas. `TRIP_CREW_HELPER_CANNOT_DRIVE`
  (403, ajudante que tenta despachar) **não** é mapeado para a mesma chave: na troca cai no genérico e no mapa da
  viagem segue sem entrada (contrato afirma os dois).
- "Nenhum motorista ativo está marcado como ajudante na ficha." (criação e troca) virou "Nenhum ajudante ativo. Cadastre um em
  Frota › Motoristas ou dê o papel Ajudante em Acesso." (pt-BR e o equivalente em inglês).

### Contrato vermelho antes do código

`test/trip/crew-drivers-can-drive.contract.ts` (importado por `trip.contract.test.ts`): primeira execução falhou com
`Cannot find module driverCrewRole.service`. Cobre filtro de condutor, fiação nos cinco pontos, o pool de ajudantes da
criação, o mapa de erro (sem confusão com o 403), textos nos dois idiomas e a lista vazia.

### Prova por mutação (arquivos restaurados e conferidos com `cmp`)

Filtro sem `canDrive` → 2 fail · candidatos da troca sem filtro → 1 · mapa da troca sem o código → 2 · mapa da viagem sem o
código → 1 · `TRIP_CREW_HELPER_CANNOT_DRIVE` mapeado para a mesma chave → 1 · pool de ajudantes passando a partir de quem
dirige → 1 · MDF-e sem o filtro → 1 · texto da lista vazia revertido → 1.

### Gates

- `bun run test` (app): `6460 pass · 0 fail · 32 files` + hooks `327 pass · 0 fail`.
- `bun run typecheck` (raiz) exit 0 · `eslint` (cwd da app) 0 erros (16 warnings antigos) · `prettier --check` limpo nos
  tocados.

## Fim da Fase 3 (T8–T11) — gates na raiz

Data: 2026-10-02. Worktree sem `.env`/`.env.test`; integração da API **não** foi rodada (a API não mudou nesta fase).

- `bun run format:check` exit 0 · `bun run lint` exit 0 (0 erros, 16 warnings antigos) · `bun run build` exit 0.
- `bun run test` (todas as apps) exit 0: API `8761 pass · 32 skip · 0 fail` (os 32 pulados são os que dependem de
  `.env.test`; com ele a Fase 2 registrou 0 skip) · worker `1558/0` · cron `101/0` · painel `6460/0` + hooks `327/0` ·
  frontend-client `89/0` · frontend-driver `1048/0` · frontend-landing `131/0`.
- Sincronia de papéis com a API: `keeps the allowlist in sync with the API authorization policy` e
  `test/identity/helper-role.contract.ts` verdes.
- Pendências para a T12: verificação visual (ficha nos três perfis, convite, seletor da viagem, 375 px, claro e escuro) e o
  painel geral "Diária do ajudante" da 149 T12, que não existe no painel.

## T13 — Documentação viva: ADR, ai-context e CLAUDE.md

Data: 2026-10-02. Branch `work/spec-235-ajudante`.

### O que mudou

- `docs/adr/0093-o-ajudante-e-um-perfil.md` (novo, 0092 é o último em origin/staging): decisão, contexto,
  consequências, alternativas descartadas. Referencia spec 235 (D1 a D8) e ADR-0065.
- `docs/ai-context/api-transportada.md`: seção "Spec 235 — O ajudante é um perfil" com arquivos-chave,
  política de reconciliação, erros, restrições de viagem e MDF-e, limite de atribuição em lote.
- `docs/ai-context/frontend-transportada.md`: seção "Spec 235 — O ajudante é um perfil" com seletor,
  CNH oculta, campos de ajudante, permissão, seletores de viagem, mapeamento de erro.
- `apps/api-transportada/CLAUDE.md`: parágrafo "O ajudante é um perfil (spec 235)" com reconciliação,
  recusas em viagem e MDF-e, permissão, limite.
- `apps/frontend-transportada/CLAUDE.md`: parágrafo "O ajudante é um perfil (spec 235)" com seletor,
  profil oculto, "Pode atuar como ajudante", permissão, workspace vazio, referência a ADR-0093.
- `specs/149-tripulacao-e-ajudantes/spec.md`: nota sob D1 "Revisada pela spec 235: ajudante também é
  perfil/papel; ver ADR-0093."

### Verificação

- Prettier: `bunx prettier --write` em todos os `*.md` tocados → limpo.
- Conteúdo: cada referência a arquivo-chave verifica nome real em `git ls-tree` ou `grep` (sem inventar
  nomes); conteúdo das seções resume o evidence.md das Fases 1–3 e resolve em pouco mais que 6 linhas
  por arquivo.

## Revisão final e verificação pós-rebase

A verificação depois do rebase em `origin/staging` achou um defeito real e a revisão (`code-reviewer`
`opus`) três ressalvas. Todas corrigidas:

- **Cadeia de snapshots quebrada.** O `snapshot.json` da migration do ajudante partia de
  `occurrence_location_stamp` (`prevIds 0447297e`) em vez de `delivered_moment_clock` (`b91168e2`), que
  entrou em staging durante o rebase: duas pontas filhas do mesmo pai e o snapshot sem as colunas do
  momento da entrega. Regerado pelo `db:generate` e copiado para a pasta da migration; `prevIds` agora
  `b91168e2`. Antes: 5 falhas no contrato da API e 2 no `db:test`. Depois: contrato `8966 pass · 0 fail`,
  `db:test` `116 pass · 0 fail`, `db:generate` `no_changes`. O probe `no_changes` convive com a cadeia
  quebrada — o sinal confiável é o contrato de snapshot.
- **CNH apagada na edição.** `toDriverBody` zerava a CNH de quem tem `canDrive = false`; a D6 manda ocultar,
  não apagar. Só a criação com perfil `helper` dispensa a CNH (`buildDriverBody({ dropsLicense })`); o
  teste que fixava o comportamento errado passou a afirmar que a CNH gravada é mantida.
- **`409 FLEET_DRIVER_PROFILE_EMPTY` em Acesso** mostrava "tente de novo". `users.errors.FLEET_DRIVER_PROFILE_EMPTY`
  em pt e en, com contrato.
- Menores: CNH duplicada deixa de esconder o banner quando o perfil vira Ajudante; comentário da migration
  sem a promessa de ganho de trava; comentários trocados de lugar em `TripQuickCreateDialog`; número de
  spec antigo no seed.
- **Registrado, não corrigido:** o papel `helper` (`trip.read`) lê `GET /delivery-charges` e as regras de
  cobrança da empresa inteira — ampliação do furo de 2026-09-18, anotada em `docs/SECURITY.md`. O recorte
  pelo vínculo é decisão do usuário.
- **Falha que não é do código:** `contractor-mail-template-repository.integration.ts:149` falha num banco
  `LC_ALL=C` (o índice `lower(name)` não dobra `Ç`) e passa em `en_US.UTF-8`; a branch não toca mail.
- **Integração:** suíte completa da API no banco descartável (902 pass · 1 skip · 3 fail antes da correção
  de snapshot: 2 eram o defeito acima, 1 era o locale `C`; o skip é `trip-occurrence-upload-confirm` por
  falta de MinIO, que a CI também não sobe).
- Frontend: `6480 pass · 0 fail` e hooks `327 pass`; typecheck e lint (0 erros) em exit 0.
