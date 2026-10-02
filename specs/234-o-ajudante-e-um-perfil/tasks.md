# Tasks — Spec 234

Uma task por vez, na ordem. Contrato vermelho **antes** do código; teste novo entra no `package.json`
da app. Cada task fecha com typecheck, testes da app, commit isolado e evidência em `evidence.md`.

## Fase 1 — Modelo de dados e política

> 🤖 Modelo: `opus` 🧠 (validar a migration com `architect` antes de gerar)

- [x] **T1** 🧠 Papel `helper` e `fleet_drivers.can_drive`: `COMPANY_ROLES`, CHECKs de
      `membership_roles` e `user_invitation_roles`, coluna e CHECK da D2, `rollback.sql`.
      Aceite: `make migration-test` verde e `db:generate` = `no_changes`.
- [x] **T2** 🧠 `resolveTripCrew` recusa `can_drive = false` (D5): `TripDriverCannotDriveError`
      (`409 TRIP_DRIVER_CANNOT_DRIVE`), `TripDriverCandidate.canDrive`, leitura no repositório da viagem.
      Aceite: contrato vermelho → verde, incluindo ajudante-puro como condutor.
- [x] **T3** 🧠 Reconciliação papel → colunas (D4 revisada) em `replaceRoles` — política pura nova em
      `identity/domain`, só quando a diferença toca `driver`/`aggregate`/`helper`, papéis antigos lidos
      dentro da transação, ficha travada com `FOR UPDATE`, `version + 1`, recusa
      `409 FLEET_DRIVER_PROFILE_EMPTY` (em `fleet.error.ts`) sem alteração parcial. `assign` e papéis
      de grupo ficam fora (limite registrado). Aceite: integração com troca de papéis, ficha de outra
      empresa intocada, troca sem relação com frota não mexe na ficha, prova por mutação.

## Fase 2 — API

> 🤖 Modelo: `sonnet`

- [ ] **T4** `FLEET_DRIVER_PROFILES` com `helper`; corpo de `POST/PATCH /fleet/drivers` dispensa CNH
      para ele; o use case traduz perfil em colunas (D2); `canDrive` na leitura (port, mapper, rota,
      schema de resposta). A ficha nasce com as colunas do perfil no `create` (criar ficha e convite não
      compartilham transação hoje); desligar `can_act_as_helper` num ajudante puro recebe
      `409 FLEET_DRIVER_PROFILE_EMPTY`, nunca 500.
- [ ] **T5** `helper` em `ROLE_PERMISSIONS` (`trip.read`, D7) e em `FLEET_LINKED_ROLES` (D8); contrato
      de que não alcança `trip.report` nem frota.
- [ ] **T6** Proposta de viagem e consulta de motoristas filtram `can_drive`; ajudantes seguem por
      `can_act_as_helper` (`drizzle-multi-vehicle-suggestion.repository.ts`); gêmeo de
      `findIneligibleHelperIds` para `can_drive` (409, ids em `details`).
- [ ] **T6b** MDF-e avulso (`POST /mdfe-manifests`) recusa `can_drive = false` como condutor, com o
      mesmo erro da viagem (`mdfe-manifest-crew.service.ts`, `drizzle-mdfe-manifest.repository.ts`).
- [ ] **T7** Semente local: um ajudante-puro e um motorista que também ajuda, pelo use case real.

## Fase 3 — Painel

> 🤖 Modelo: `sonnet`

- [ ] **T8** Tipos, constantes, validação de resposta e `fleetForm.service` com `helper` e `canDrive`.
- [ ] **T9** Ficha e criação rápida: opção "Ajudante", CNH oculta, switch "Pode atuar como ajudante" e
      "Diária própria" (fecha a T12 da 149), textos em `fleet.locale.json`.
- [ ] **T10** Acesso: papel "Ajudante" no convite, na tabela, em `companyUsers.constant.ts` e na lista
      fechada de `useAuthMe.query.ts` (:162) e `workspaceAccess.service.ts`; sobe antes ou junto da API.
- [ ] **T11** Viagem: o seletor de motoristas exclui quem não dirige; o de ajudantes inclui quem pode
      ajudar; o texto de lista vazia aponta onde marcar (`trip.locale.json`).

## Fase 4 — Fechamento

> 🤖 Modelo: `sonnet` (T12) · `haiku` (T13)

- [ ] **T12** 🧠 Revisão de design e usabilidade: prints da ficha (três perfis), do convite em Acesso e
      do seletor da viagem, 375 px, claro e escuro; com o usuário aprovando antes de ir a staging.
- [ ] **T13** Documentação viva: ADR de "ajudante é perfil" (próximo número livre em `origin/staging`),
      `docs/ai-context/api-transportada.md`, `frontend-transportada.md` e os `CLAUDE.md` das duas apps;
      nota na spec 149 apontando que a D1 foi revisada aqui.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/234-o-ajudante-e-um-perfil/ (leia spec.md, plan.md e
tasks.md antes de começar). Uma task por vez, na ordem do tasks.md, em branch work/spec-234-ajudante
a partir de origin/staging.
Modelos: Fase 1 → T1, T2 e T3 🧠 opus (validar a migration e a reconciliação com architect antes de
implementar) · Fases 2 e 3 → executor model=sonnet · T12 🧠 opus · T13 executor model=haiku ·
revisão final → code-reviewer model=opus.
Cada task fecha com contrato vermelho antes, bun run typecheck, testes da app (contrato e integração da
API, cada um pelo seu comando, com --env-file=../../.env.test), teste novo no package.json, commit
isolado e evidência em evidence.md; make check e make migration-test ao fim de cada fase.
Antes do push: git fetch, rebase em origin/staging, bun install --frozen-lockfile, typecheck, e
conferir numeração de spec/ADR/migration.
Pare e pergunte antes de: deploy, push para staging, migration destrutiva, mudar D2/D4/D5, e qualquer
[NEEDS CLARIFICATION].
```
