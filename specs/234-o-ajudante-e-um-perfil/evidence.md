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
