# Evidence — Spec 234

## T1 — Papel `helper` e `fleet_drivers.can_drive`

Data: 2026-10-02. Branch `work/spec-234-ajudante`.

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

Data: 2026-10-02. Branch `work/spec-234-ajudante`.

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

Data: 2026-10-02. Branch `work/spec-234-ajudante`.

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
