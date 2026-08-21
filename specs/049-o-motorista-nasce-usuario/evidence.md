# 049 — O motorista nasce usuário · evidência

Escopo do lote na árvore de trabalho, ramo `feat/regiao-do-motorista-com-valor`:

```
$ git status --porcelain apps | awk '{print $1}' | sort | uniq -c
  14 ??
   5 D
  50 M
```

As cinco remoções são o select de usuário vinculado e o que só existia para ele:

```
 D apps/frontend-transportada/src/modules/fleet/components/DriverMembershipField.component.tsx
 D apps/frontend-transportada/src/modules/fleet/hooks/useDriverMemberships.hook.ts
 D apps/frontend-transportada/src/modules/fleet/shared/driverMembership.service.ts
 D apps/frontend-transportada/src/modules/identity/queries/useCompanyUsers.query.ts
 D apps/frontend-transportada/test/fleet/driver-membership-select.contract.ts
```

## T001 — O botão de cadastrar não quebra linha

A fileira do select de motorista passou a tirar altura de `--control-height`, como todo controle da
app. O que guarda isso não é olho: `test/design-system/control-height.contract.ts` falha se algum
módulo declarar controle quadrado com medida literal em `rem`, que era exatamente a origem das três
alturas diferentes na mesma fileira.

Coberto pela suíte do frontend abaixo (`screen-standards.contract.ts` +
`control-height.contract.ts`).

## T002 — Remover os cinco campos de proprietário

`fleet/shared/vehicleOwner.service.ts` é o novo e único ponto que deriva proprietário, documento,
RNTRC, UF e `tpProp` do motorista selecionado. `test/fleet/vehicle-owner-derived.contract.ts` (novo)
é o aceite: ele fixa a derivação e o `tpProp: '0'` do agregado.

## T003 — O motorista nasce usuário

`createFleetDriversUseCase` recebe `account` (o convite) e abre o vínculo na mesma criação. O papel
sai de `fleet/domain/fleet-driver-profile.constant.ts`.

Aceite em `test/fleet-application/drivers.contract.ts` e `test/fleet-http/drivers.contract.ts`,
dentro da suíte da API abaixo.

## T004 — E-mail e ANTT na ficha

Migration `20260821170031_fleet_driver_antt_contact`, quatro colunas aditivas com CHECK por campo
(`linked_legal_name` ≤60 e só com `linked_tax_id`; `email` vazio ou ≤254 no padrão de endereço;
`rntrc` vazio ou `^0?[0-9]{8}$`; `antt_category` vazio ou `0`/`1`/`2`).

O `rollback.sql` derruba os quatro constraints e as quatro colunas, e confere a própria saída do
diário com `deleted_migrations <> 1`.

## T005 — O papel entra no catálogo

Migration `20260821173515_identity_aggregate_role` alarga os dois CHECK:

```sql
"role" in ('company-admin', 'finance', 'fiscal', 'operator', 'viewer', 'driver', 'aggregate')
```

**Correção feita durante o fechamento.** O `rollback.sql` desta migration prometia no comentário que
vínculo ou convite já gravado com o papel novo bloqueia a reversão — e o SQL logo abaixo apagava
essas linhas com dois `DELETE` sem guarda. Rollback que apaga linha não é rollback: tiraria acesso de
quem já entrou, em silêncio. Ele também não tinha transação nem a guarda de diário que a migration
irmã tem.

Reescrito para contar as duas tabelas e abortar:

```sql
IF aggregate_memberships > 0 OR aggregate_invitations > 0 THEN
  RAISE EXCEPTION
    'Cannot roll back the aggregate role: % membership rows and % invitation rows still hold it',
    aggregate_memberships, aggregate_invitations;
END IF;
```

Tudo dentro de `BEGIN; … COMMIT;`, com a guarda `deleted_migrations <> 1` no fim. Quem quiser
reverter de verdade decide antes o que fazer com essas linhas.

Duas expectativas congeladas precisaram acompanhar o catálogo:

- `test/database-migration/static-migration.contract.ts` — a lista literal de diretórios de migration
  ganhou `'20260821173515_identity_aggregate_role'` na posição cronológica. `PRESERVED_MIGRATION_HASHES`
  não foi tocado.
- `test/user-invitation-schema/schema.contract.ts:217` — `user_invitation_roles_role_check` agora
  espera `'aggregate'` no fim da lista.

### Migration e rollback em Postgres descartável

Este é o gate que prova o `rollback.sql` reescrito. Com `DRIZZLE_TEST_DATABASE_URL` apontando para o
banco descartável, os quatro testes que ficam `skip` sem banco executam:

```
$ make migration-test
 Container transportada-local-postgres-1  Healthy
$ bun test ./test/database-migration.contract.test.ts ./test/notification-migration.contract.test.ts \
    ./test/notification-delivery-behaviour.contract.test.ts ./test/notification-queue.contract.test.ts \
    ./test/notification-recipient.contract.test.ts ./test/integration/local-identity-seed.integration.ts

 75 pass
 0 fail
 875 expect() calls
Ran 75 tests across 6 files. [11.12s]
```

## T006 — Dados da empresa por API

`fleet/shared/companyLookup.service.ts` + `fleet/hooks/useCompanyLookup.hook.ts`, sobre
`useGuardedRequest.hook.ts` (debounce + `AbortSignal` por tecla, como os outros destinos externos do
módulo). Aceite em `test/fleet/company-lookup.contract.ts` (novo).

A origem consultada entra no `connect-src` da CSP — o contrato
`test/shared/content-security-policy.contract.ts` varre `src/**` por origem `https://` e falha se
alguma não estiver na diretiva. Ele passa na suíte do frontend abaixo, o que quer dizer que a origem
nova está declarada.

## T007 — Zonas atendidas no cadastro

`useDriverCoverage.hook.ts` (novo) alimenta `DriverCoverageFields.component.tsx` dentro do próprio
formulário. Aceite em `test/fleet/driver-coverage.contract.ts`.

## T008 — Semente com os dois perfis

`LOCAL_FLEET_DRIVER_SEEDS`: três `aggregate` (com RNTRC e categoria ANTT `0`, `1` e `2`; dois deles
com CNPJ de vínculo) e três `driver`. Documentos fictícios — ambiente descartável não recebe CPF de
pessoa real.

A semente instancia e executa o **use case real** (`createFleetDriversUseCase` sobre
`createInviteCompanyUserUseCase`), como manda a regra da casa; nada de `INSERT INTO`. Por isso cada
motorista semeado também abre usuário, e a idempotência tem de ser real: `seedLocalFleetDrivers` lista
os documentos já presentes e pula quem já existe, porque `FleetDriverFilters` é
`{nameContains?, statusEq?}` e não filtra por CPF. `PAGE_CAP = 20` é trava de laço — cursor que não
avança não pode virar semente infinita.

`runLocalFleetSeed` recusa qualquer ambiente fora de `local` e `test`, e recusa **antes** de
`parseEnvironment` — a checagem não pode depender de o ambiente estar bem configurado.

Aceite em `test/fleet-application/local-fleet-seed.contract.ts` (novo), seis testes, com um duplo
falso de use case que **lança** em `update` para fixar que a semente nunca atualiza motorista.
Entrada `db:seed:fleet` no `package.json`.

## T009 — Gates

Rodados contra a árvore final, depois da reescrita do `rollback.sql`.

```
$ bun run format:check
$ bunx prettier --check .
Checking formatting...
All matched files use Prettier code style!
exit=0
```

```
$ bun run lint
$ bunx eslint src test drizzle.config.ts eslint.config.js --max-warnings=0   # api
$ bunx eslint src test scripts eslint.config.js --max-warnings=0             # worker
$ bunx eslint src test eslint.config.js --max-warnings=0                     # cron
$ eslint .                                                                   # frontend
```

```
$ bun run typecheck
$ bunx tsc --noEmit   # api
$ bunx tsc --noEmit   # worker
$ bunx tsc --noEmit   # cron
$ tsc --noEmit        # frontend
```

As quatro suítes, cada uma na sua app (a lista de arquivos de teste é explícita no `package.json` de
cada uma, então não há suíte única):

```
$ bun run --cwd apps/api-transportada test
 2741 pass · 15 skip · 0 fail · 11219 expect() calls · 112 files · 4.55s

$ bun run --cwd apps/frontend-transportada test
 1573 pass · 0 fail · 10149 expect() calls · 18 files · 521ms

$ bun run --cwd apps/worker-transportada test
 490 pass · 0 fail · 1151 expect() calls · 59 files · 543ms

$ bun run --cwd apps/cron-transportada test
 196 pass · 0 fail · 358 expect() calls · 8 files · 240ms
```

```
$ bun run build
dist/assets/index-B73JD918.js   1,369.84 kB │ gzip: 380.92 kB
(!) Some chunks are larger than 500 kB after minification.
✓ built in 2.02s
PWA v1.3.0 · precache 12 entries (1536.37 KiB) · dist/sw.js
```

O aviso de chunk acima de 500 kB é pré-existente e não é deste lote.

## O que ainda não foi verificado

**Gate verde não é tela verificada.** Nada aqui prova o comportamento da tela de Agregado no
navegador: a frota está atrás do login, e a verificação no Chrome deste computador — os cinco campos
de proprietário ausentes, o botão na mesma fileira, a seleção de motorista povoada pela semente e o
cadastro criando usuário — depende de quem entra na sessão. Fica pendente, com a semente já pronta
para povoar a seleção.
