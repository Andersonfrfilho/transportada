# Evidence — spec 341

## T1–T4

- `bun --env-file=../../.env.test test ./test/integration-api.contract.test.ts` — 11 pass: chave de 256 bits e hash estável; Bearer mal formado recusado; criação não vaza a chave nem o hash na trilha; chave ausente/desconhecida/revogada dão o mesmo 401; sem capacidade 403; revogar de outra empresa 404; pedido nasce anônimo e ligado à chave; repetir a `Idempotency-Key` devolve o mesmo; janela no passado 422; outra chave lê/cancela → 404; cancelar duas vezes 409; as quatro rotas declaram balde por IP e por chave no Postgres; cotação devolve só `total`, `currency`, `validUntil`; vista do pedido tem exatamente as dez chaves previstas.
- `test/rate-limited-routes.contract.test.ts` — lista de arquivos com teto no Postgres inclui `integration-api/presentation/integration-api.routes.ts`.
- `tsc --noEmit` limpo (exceto o `@adatechnology/push-provider` ausente, pré-existente).
