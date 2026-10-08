# Evidência — Spec 254

- **T1.1** — veredito do `architect` (opus): **APROVADO**, só log, sem tabela/migration. Cinco ajustes
  incorporados ao `plan.md`/`spec.md`/`tasks.md` (drenagem para em vez de pular, origem no agendador, fila portada
  e não copiada, log por lista permitida, regras do coletor). T3.3 subiu de `haiku` para `sonnet`.
- **T1.2** — `cd apps/api-transportada && bun --env-file=../../.env.test test ./test/me-client-diagnostics.contract.test.ts` → 0 pass / 9 fail, vermelho esperado: `Cannot find module '../src/trips/presentation/me-client-diagnostics.routes.js'` (rota inexistente). `bun run typecheck` na raiz verde. Sem OpenAPI nesta API (nenhum gerador/arquivo `openapi*`), então o caso "rota no documento" não existe; o teto C5 é conferido pela declaração `rateLimit` da rota (6/60 s), porque o `createTestRouter` sempre permite e o 429 + `Retry-After` do roteador já é do `test/rate-limit/router.contract.ts`.
