# Evidência — spec 312

- API: `bunx tsc --noEmit` limpo; contratos de cte-profiles, cte-batch, nfe-documents, trips, whatsapp e
  database-migration verdes (inclui `profile-destination-city.contract.ts` e os dois casos HTTP de normalização/recusa).
- Frontend: `tsc --noEmit` limpo; `bun run test` 8728 pass / 0 fail; `destination-cities.contract.ts` novo.
- Pendente: migration contra Postgres descartável (`make migration-test`) e integração, rodar na CI.
