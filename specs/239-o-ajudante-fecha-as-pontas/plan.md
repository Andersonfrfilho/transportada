# Plan — Spec 239

## Mapa de arquivos

### API (`apps/api-transportada/src`)

| Assunto               | Arquivo                                                                                                                                                                                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Política da cobrança  | `delivery-clients/presentation/delivery-charge.routes.ts` (`CHARGE_READ_POLICY`, :40; usos :146, :225)                                                                                                                             |
| Contratos de cobrança | `test/delivery-clients/charges.contract.ts`, `manual-charge-types.contract.ts`                                                                                                                                                     |
| Contrato do helper    | `test/helper-role.contract.test.ts` (:120-121 pinam as duas rotas como alcançáveis — passam a 403)                                                                                                                                 |
| Papel na tripulação   | `trips/presentation/me-trip.routes.ts` (`serializeTrip` :262-275), `trips/application/find-current-driver-trip.use-case.ts` (:196-217), `trips/infrastructure/drizzle-current-driver-trip.repository.ts` (`findCrewRole` :142-160) |
| Segurança             | `docs/SECURITY.md` (entrada de 2026-09-18 e a ampliação da 235)                                                                                                                                                                    |

### Painel (`apps/frontend-transportada/src`)

| Assunto      | Arquivo                                                                                                                                                                                                                            |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diária geral | novo cliente/hook/painel em `modules/fleet/` no molde de `EnergySettingsPanel.component.tsx` e `useEnergySettings.hook.ts`; montagem em `pages/FleetWorkspace.page.tsx` (aba `drivers`, ~:420); locales `fleet.locale.json`/`.en`  |
| Sem acesso   | `modules/identity/components/NoWorkspaceAccess.component.tsx`, `main.tsx` (:589-591), `modules/identity/locales/identity.locale.json` (:651-656), `modules/shared/workspaceAccess.service.ts` (`resolveLandingWorkspace` :125-157) |
| A3           | `modules/identity/hooks/useUserAdministration.hook.ts` (:94-104, :117-130, :135-152, :183, :190)                                                                                                                                   |
| A6           | `modules/identity/components/CompanyUserTable.component.tsx` (:356-383), `styles/userAdministration.module.css` (:218-228, :622-625)                                                                                               |
| A7           | `modules/fleet/components/DriverForm.component.tsx` (:129, :314), `DriverQuickCreateDialog.component.tsx` (:150), locales                                                                                                          |

### App do motorista (`apps/frontend-driver/src`)

Cliente de `/me/trips/current` (tipo da viagem ganha `crewRole`), a tela da viagem e o cartão da parada
(botões de ação), e o contrato de componente no padrão de `test/driver-trip/`. O app hoje não conhece o
papel na tripulação (nenhuma menção a `helper`).

## Riscos

- **D1 troca uma permissão:** conferir pelo contrato quem lia a cobrança antes; o workspace `extra-charges`
  exige `billing.create` ou `trip.financials`, e `trip.financials` cobre company-admin, finance e operator.
- **App do motorista é PWA com fila offline:** a ação de ajudante nunca pode entrar na fila; o
  comportamento da fila para 403 (`offlineQueue.service.ts:88-231`) não foi exercitado — confirmar antes.
- **Listas explícitas de teste** em cada `package.json` e `settingsTabsOf('fleet')` nos três contratos de
  aba (não muda, porque D2 não registra painel).
- Numeração: conferir spec/ADR/migration em `origin/staging` antes do push; esta spec não tem migration.
