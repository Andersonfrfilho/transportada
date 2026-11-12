# Evidência — spec 312

- API: `bunx tsc --noEmit` limpo; contratos de cte-profiles, cte-batch, nfe-documents, trips, whatsapp e
  database-migration verdes (inclui `profile-destination-city.contract.ts` e os dois casos HTTP de normalização/recusa).
- Frontend: `tsc --noEmit` limpo; `bun run test` 8728 pass / 0 fail; `destination-cities.contract.ts` novo.
- Pendente: migration contra Postgres descartável (`make migration-test`) e integração, rodar na CI.

## Adendo — matcher compartilhado

- Simulação do script da UNICA em staging: o primeiro perfil entrou e o segundo caiu em
  `cte_emission_profile_matchers_company_tax_id_role_unique`. Daí o adendo da spec.
- Contratos: `canShareMatcher` e o schema sem a unicidade; migration na lista da `static-migration`.
- Lacuna conhecida: a consulta do guarda em `assertMatchersDoNotCollide` não tem teste de integração com Postgres.
