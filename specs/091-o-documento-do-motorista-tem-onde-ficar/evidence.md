# 091 — Evidência

Comandos rodados nesta branch (`work/spec-091`), com a infra local de teste de pé. Sem criptografia
de aplicação (ADR-0039 revogada em 2026-11-05).

## Fase 2 — Tabela e rotas

| Task | Evidência |
| ---- | --------- |
| T007 | `test/fleet-schema/tenant-safety.contract.ts` (FK composta `company_id`+`driver_id` e `company_id`+`stored_object_id`; nenhuma FK simples sem tenant) e `test/fleet-schema/fleet-driver-attachments.contract.ts` (colunas, único parcial, CHECKs). Schema em `src/database/fleet-driver-attachment.schema.ts`. `bun test ./test/fleet-schema.contract.test.ts` → 95 pass, 0 fail. |
