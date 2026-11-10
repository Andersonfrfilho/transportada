# Evidência — spec 315

- Consumidor: `linked-contractor-issuer.contract.ts` (10 casos: raiz igual entra; sem contratante, outra raiz, inativo, não resolvido e CPF recusam; filial barrada pela 313; evento). Vermelho antes da implementação (módulo inexistente), verde depois.
- WhatsApp: `whatsapp-xml-inbound.contract.ts` (recibo carrega o contratante do contato; membro sem contratante) e `whatsapp-cycle.contract.ts` (worker repassa à importação).
- Worker `bun run test`: 3145 pass / 0 fail. API `bun run test`: 14701 pass / 35 skip / 0 fail.
- `bun run typecheck` na raiz: limpo. Lint (`--max-warnings=0`) api e worker: limpo. Prettier nos arquivos alterados: limpo.
- Migration `20261110011749_nfe_xml_receipt_restricted_contractor` (aditiva, com `rollback.sql`), registrada em `static-migration.contract.ts` (52 pass).
- Integração com Postgres descartável (banco `t315_it` criado e apagado no container local; migrations aplicadas por `db:migrate`): worker `nfe-xml-receipts.integration.ts` 14 pass; API `nfe-xml-receipts.integration.ts` 4 pass (inclui contato em dois contratantes = autoriza sem ligar a nenhum).
- Não verificado: `make migration-test` (rollback em Postgres descartável) e `getPendingImport` (status do contratante) contra banco — não há integração dessa consulta.
