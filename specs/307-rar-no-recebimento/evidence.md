# Evidência — spec 307

- `bun test ./test/nfe-xml-receipts.contract.test.ts ./test/nfe-import-archive-expander.contract.test.ts` → 70 pass / 0 fail (Bun 1.4.4); recibos 57 pass (Bun 1.3.14). `tsc` e `eslint` limpos.
- Lacuna conhecida: sem binário `rar` aqui, os testes usam RAR4 armazenado montado à mão. RAR5 e arquivos comprimidos dependem do teste em staging (T3).
