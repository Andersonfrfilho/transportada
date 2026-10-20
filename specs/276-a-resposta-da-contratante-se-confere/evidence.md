# Evidence — 276

## T1 — resposta sem anexo continua aguardando (20/10/2026)

Postgres 16 local (porta do `.env.test`), Bun 1.4.2.

- API, contratos: `bun test ./test/occurrence-conversation.contract.test.ts` → 735 pass, 0 fail.
- Worker, contratos (inclui a paridade da política): `bun test ./test/occurrence-conversation.contract.test.ts` → 81 pass, 0 fail.
- API, integração: `bun --env-file=../../.env.test test ./test/integration/occurrence-contractor-reply-received.integration.ts
./test/integration/occurrence-conversation-portal.integration.ts` → 21 pass, 0 fail, 85 expect.
- Worker, integração: `bun --env-file=../../.env.test test ./test/integration/occurrence-contractor-reply-received.integration.ts`
  → 11 pass, 0 fail (foto só e dois PDFs seguem em `needs_operator`).
- `tsc --noEmit` na API e no worker, `eslint` e `prettier --check` nos arquivos tocados: limpos.
