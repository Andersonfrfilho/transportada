# Evidência — spec 310

- `bunx bun@1.3.14 test ./test/nfe-xml-receipts.contract.test.ts` (apps/worker-transportada): 60 pass / 0 fail; tsc e eslint limpos.
- 11 × 10: o aviso conta recibos aceitos no lote; o resumo só soma os recibos cuja importação já terminou. Hipótese: o 11º recibo ainda processava (ou foi recusado) e teria resumo próprio. Não confirmado com dados; conferir `nfe_xml_receipts` do remetente em staging.
