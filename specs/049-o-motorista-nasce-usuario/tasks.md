# 049 — O motorista nasce usuário · tasks

## Fase 1 — Formulário de veículo

> 🤖 Modelo: `sonnet`

### T001 — O botão de cadastrar não quebra linha

Seleção de motorista e "Cadastrar novo motorista" na mesma fileira, com a altura de controle do
design system.

- **Arquivos:** `fleet/components/VehicleOwnerFields.component.tsx`, `fleet/styles/fleet.module.css`
- **Aceite:** `test/fleet/screen-standards.contract.ts`, `test/design-system/control-height.contract.ts`
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

### T002 — Remover os cinco campos de proprietário

Nome, CPF/CNPJ, RNTRC, UF e tipo de proprietário saem do formulário e passam a ser derivados do
motorista selecionado.

- **Arquivos:** `fleet/shared/vehicleOwner.service.ts` (novo),
  `fleet/components/VehicleOwnerFields.component.tsx`, `fleet/components/VehicleForm.component.tsx`,
  `fleet/shared/fleetForm.service.ts`, locales
- **Aceite:** `test/fleet/vehicle-owner-derived.contract.ts` (novo)
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

## Fase 2 — Motorista, usuário e papel

> 🤖 Modelo: `sonnet` (T003 e T005 são 🧠 — mexem em catálogo de papel e em migration)

### T003 🧠 — O motorista nasce usuário

`POST /fleet/drivers` passa pelo convite e abre o vínculo na empresa. O select de "usuário vinculado"
sai inteiro, com os cinco arquivos que só existiam para ele.

- **Arquivos:** `fleet/application/fleet-drivers.use-case.ts`, `fleet/application/fleet.port.ts`,
  `fleet/domain/fleet.error.ts`, `main.ts`; removidos `DriverMembershipField.component.tsx`,
  `useDriverMemberships.hook.ts`, `driverMembership.service.ts`, `useCompanyUsers.query.ts`,
  `test/fleet/driver-membership-select.contract.ts`
- **Aceite:** `test/fleet-application/drivers.contract.ts`, `test/fleet-http/drivers.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`

### T004 — E-mail e ANTT na ficha

`email`, `rntrc`, `antt_category` e `linked_legal_name` em `fleet_drivers`, com CHECK por campo.

- **Arquivos:** `drizzle/20260821170031_fleet_driver_antt_contact/` (migration + rollback),
  `database/fleet.schema.ts`, `fleet/presentation/fleet-request.schema.ts`, `fleet.mapper.ts`,
  `fleet.schema.ts`, e o formulário do lado do frontend
- **Aceite:** `test/fleet-schema/drivers.contract.ts`,
  `test/database-migration/fleet-constraints.assertion.ts`,
  `test/database-migration/static-migration.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`, `make migration-test`

### T005 🧠 — O papel entra no catálogo

`aggregate` nos dois CHECK de papel (`membership_roles`, `user_invitation_roles`), e a criação escolhe
`aggregate` ou `driver` conforme a seleção.

- **Arquivos:** `drizzle/20260821173515_identity_aggregate_role/`,
  `database/identity.schema.ts`, `identity/domain/authorization.policy.ts`,
  `fleet/domain/fleet-driver-profile.constant.ts` (novo)
- **Aceite:** `test/user-invitation-schema/schema.contract.ts`, `test/identity-schema.contract.test.ts`,
  `test/authorization.contract.test.ts`, `test/fleet/driver-profile-select.contract.ts`
- **Verificação:** `bun run --cwd apps/api-transportada test`
- **Nota:** rollback **aborta** com `RAISE EXCEPTION` se algum vínculo ou convite já usa o papel —
  apagar essas linhas tiraria acesso de quem já entrou.

## Fase 3 — O que o operador não precisa digitar

> 🤖 Modelo: `sonnet`

### T006 — Dados da empresa por API

CNPJ do vínculo consulta o cadastro público e devolve razão social.

- **Arquivos:** `fleet/shared/companyLookup.service.ts`, `fleet/hooks/useCompanyLookup.hook.ts`,
  `fleet/hooks/useGuardedRequest.hook.ts` (novos)
- **Aceite:** `test/fleet/company-lookup.contract.ts` (novo),
  `test/shared/content-security-policy.contract.ts`
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

### T007 — Zonas atendidas no cadastro

Seleção múltipla de cobertura dentro do formulário de motorista.

- **Arquivos:** `fleet/hooks/useDriverCoverage.hook.ts` (novo),
  `fleet/components/DriverCoverageFields.component.tsx`, `DriverForm.component.tsx`
- **Aceite:** `test/fleet/driver-coverage.contract.ts`
- **Verificação:** `bun run --cwd apps/frontend-transportada test`

### T008 — Semente com os dois perfis

Seis motoristas pelo use case real — três `aggregate`, três `driver` —, idempotente por documento.

- **Arquivos:** `database/local-fleet-seed.constant.ts`, `database/local-fleet-seed.service.ts`
  (novos), `package.json` (`db:seed:fleet`)
- **Aceite:** `test/fleet-application/local-fleet-seed.contract.ts` (novo)
- **Verificação:** `bun run --cwd apps/api-transportada test`

## Fase 4 — Fechamento

> 🤖 Modelo: `sonnet`

### T009 — Gates e evidência

`format:check` + `lint` + `typecheck` + as quatro suítes + `build`, com a saída em `evidence.md`.

- **Verificação:** `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run build`, e
  `bun run --cwd apps/<app> test` nas quatro apps
