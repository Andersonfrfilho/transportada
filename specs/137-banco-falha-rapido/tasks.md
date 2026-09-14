# Spec 137 — Tarefas

> 🤖 Modelo: `opus` 🧠 (T1–T2 — reprodução e mecanismo) · `sonnet` (T3–T6)

- [x] **T1** 🧠 Reproduzir numa instância própria e isolar a leitura que pendura (`loadTripOccupancy`,
      `prepare: true`), com Bun SQL cru como controle
- [x] **T2** 🧠 Medir os três comportamentos do Bun que decidem o desenho: `idleTimeout`, `cancel()` na
      fila e em execução, `statement_timeout` pelo `connection`
- [x] **T3** Contratos antes do código: `test/database-availability.contract.test.ts` (lista `test`) e
      `test/integration/database-availability.integration.ts` (lista `test:integration`)
- [x] **T4** `createDatabaseProvider` (pool explícito, `prepare: false`, guarda por consulta), 503
      `DATABASE_UNAVAILABLE`, escopo do pedido, janela da prontidão
- [x] **T5** Env no schema e no `.env.example`; `main.ts` e as duas integrações que montam `ApiEnvironment`
- [x] **T6** Docs, `CLAUDE.md`; gates (`bun run --cwd apps/api-transportada test`, `bun run typecheck`,
      `make check`)
