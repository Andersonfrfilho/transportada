# Evidência — spec 310

- `bunx bun@1.3.14 test ./test/nfe-xml-receipts.contract.test.ts` (apps/worker-transportada): 61 pass / 0 fail; tsc e eslint limpos.
- 11 × 10: o aviso conta os recibos aceitos; o resumo saía assim que parte deles terminava. Agora espera o lote (RF5). Causa por leitura de código, não medida no banco.
- O SQL de `hasBatchInFlight` tem teste de integração (`nfe-xml-receipts.integration.ts`) que só roda no CI: não há Docker nesta sessão.
