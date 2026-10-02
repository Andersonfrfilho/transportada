# Plan — Spec 234

## Abordagem

Adicionar `helper` como terceiro perfil sem criar tabela nem coluna de perfil: o perfil continua sendo o
papel da pessoa, e duas colunas da ficha (`can_drive`, `can_act_as_helper`) carregam o que a política de
viagem precisa. Papel e colunas são reconciliados no servidor (D4), nunca pelo cliente.

## Mapa de arquivos

### API (`apps/api-transportada`)

| Assunto               | Arquivo                                                                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Papel e CHECKs        | `src/database/identity.schema.ts`, `src/database/user-invitation.schema.ts`                                          |
| Coluna `can_drive`    | `src/database/fleet.schema.ts` + migration em `drizzle/` com `rollback.sql`                                          |
| Perfis da frota       | `src/fleet/domain/fleet-driver-profile.constant.ts`                                                                  |
| Corpo da requisição   | `src/fleet/presentation/fleet-request.schema.ts` (CNH condicional ao perfil)                                         |
| Criação da ficha      | `src/fleet/application/fleet-drivers.use-case.ts` (perfil → colunas)                                                 |
| Leitura               | `fleet.port.ts`, `fleet.mapper.ts`, `fleet.routes.ts`, `fleet.schema.ts` (`canDrive`)                                |
| Permissão do papel    | `src/identity/domain/authorization.policy.ts`                                                                        |
| Convite e reconciliar | `invite-company-user.use-case.ts`, `replace-company-user-roles.use-case.ts`, `assign-company-user-roles.use-case.ts` |
| Política de viagem    | `src/trips/domain/trip.policy.ts`, `trip.error.ts`, `drizzle-trip.repository.ts`                                     |
| Proposta              | `src/routing/infrastructure/drizzle-multi-vehicle-suggestion.repository.ts`                                          |
| Semente               | `src/database/local-fleet-seed.constant.ts`                                                                          |

### Painel (`apps/frontend-transportada`)

| Assunto            | Arquivo                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Tipos e constantes | `modules/fleet/shared/fleet.types.ts`, `fleet.constant.ts`, `fleetForm.service.ts`, `fleetResponse.validation.ts`               |
| Ficha              | `modules/fleet/components/DriverForm.component.tsx`, `DriverPersonalFields.component.tsx`                                       |
| Criação rápida     | `modules/fleet/components/DriverQuickCreateDialog.component.tsx`                                                                |
| Acesso             | `modules/identity/shared/companyUsers.constant.ts`, `components/CompanyUserTable.component.tsx`, `locales/identity.locale.json` |
| Viagem             | `modules/trip/pages/TripWorkspace.page.tsx`, `modules/trip/shared/tripCrewHelpers.service.ts`, `locales/trip.locale.json`       |

O `realm/` não cita nomes de papel de empresa (verificado por busca), então não entra no escopo.

## Riscos

- **Divergência papel × colunas** (D4): mitigada por teste de integração que muda papéis e confere as
  colunas, e por prova por mutação na reconciliação.
- **`test.each` e lista explícita de testes:** contrato novo só roda se estiver no `package.json` da app.
- **Rebase:** conferir spec/ADR/migration em `origin/staging` antes do push (numeração colide entre
  sessões) e `db:generate` = `no_changes`.
