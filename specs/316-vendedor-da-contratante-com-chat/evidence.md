# Evidência — spec 316

## T1.1–T1.3 — cadastro, vínculo e carteira do vendedor (API)

- Migration `20261110191104_salespeople` (3 tabelas, rollback que recusa com dados, snapshot) — `test/database-migration/salespeople.static.contract.ts`;
  `test/database-migration.contract.test.ts` + `test/integration/migration-completeness.integration.ts` contra Postgres 16: 206 pass / 0 fail.
- Contrato do módulo — `test/salespeople.contract.test.ts` (10 pass): contato normalizado (e-mail minúsculo, E.164, chave do celular), ao menos um canal,
  `.strict()` recusa `companyId`, resposta em lista branca, carteira sem repetição e CNPJ malformado recusado, 7 rotas com `settings.manage`.
- Integração — `test/integration/salesperson.integration.ts` (8 pass, Postgres 16 descartável): auditoria sem PII, 409 de e-mail e celular, mesma
  chave em outra empresa permitida, um vendedor em duas contratantes com carteiras independentes, cliente de outra empresa recusado (422), desvincular leva a
  carteira, empresa alheia não lê nem edita, banco recusa vendedor sem canal.
- `tsc --noEmit` limpo; `eslint --max-warnings=0` limpo; prettier limpo.
