# Evidência — Feature 314

## T1–T3 (API)

- `apps/api-transportada`: `bun test ./test/nfe-import-application.contract.test.ts ./test/nfe-http.contract.test.ts` → 55 pass, 0 fail.
  Casos novos: recusa `NFE_IMPORT_UNRELATED_CNPJ` religa a importação sem linha nova e publica o evento; recusa de outro motivo (`XML_INVALID`) → `409`; importação `pending`/`queued`/`processing` → `409`; simulação só conta; `GET /nfe-imports/:id/reprocess-preview` devolve `200` e não chama o reprocesso.
- `NODE_OPTIONS=--max-old-space-size=8192 bun run typecheck` limpo; `eslint` limpo nos diretórios tocados.

## T5 (painel)

- `apps/frontend-transportada`: `bun run test` → 1493 pass, 0 fail (inclui `reprocess-preview.contract.ts`: GET da simulação, resposta malformada recusada, bloqueio sem `invoices.import`, o clique só abre o diálogo e a mutação só roda no "Confirmar").
- `bun run typecheck` limpo; `eslint` e `prettier --check` limpos.

## Pendente

- Verificação visual do diálogo em staging (T7) e publicação.
