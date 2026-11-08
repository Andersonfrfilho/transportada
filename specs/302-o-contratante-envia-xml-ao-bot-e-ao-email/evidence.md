# Evidência — 302

- API, Postgres 16 real: `test/integration/nfe-xml-receipts.integration.ts` 3 pass / 0 fail (contato com tipo + ativo + aceite autoriza; sem tipo, sem aceite, inativo e outra empresa não).
- Worker, Postgres 16 real: `test/integration/nfe-xml-receipts.integration.ts` 11 pass / 0 fail (inclui contato de contratante por e-mail).
- Migration aplicada; rollback recusa com contatos que têm o tipo e, sem eles, desfaz e remove o registro; reaplicada.
