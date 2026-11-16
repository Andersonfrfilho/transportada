# Evidência — Feature 326

- API: `bun --env-file=../../.env.test test ./test/freight-quote.contract.test.ts` → 30 pass. `schema-snapshot` e `static-migration` → 55 pass.
  `tsc` e `eslint` limpos nos arquivos novos. O `tsc` da API acusa só `@adatechnology/push-provider` ausente neste ambiente (pré-existente).
  Não rodei a integração com banco nem `make migration-test` neste ambiente (sem Postgres): ficam para a CI.
- Painel: `bun run test` → 8.905 pass; `bun run test:hooks` → 1.493 pass; `tsc` e `eslint` limpos.
- Prints: `prints/orcamento-{light,dark}-{desktop,mobile}.png`, com a API dublada.
- Fonte do piso: https://anttlegis.antt.gov.br (Res. 6.084/2026, Anexo II). Os coeficientes foram transcritos da página oficial; conferir
  por amostragem antes de produção.
