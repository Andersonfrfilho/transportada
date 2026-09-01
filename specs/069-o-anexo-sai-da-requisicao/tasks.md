# 069 — Tasks

## Fase 1 — A API para de ler

> 🤖 Modelo: `sonnet` (T001 é 🧠 — o desenho do outbox foi validado com `opus` na ADR-0053)

- [x] T001 Tabela `aggregate_attachment_outbox` + migration aditiva + `rollback.sql`
- [x] T002 Schema Drizzle na API e cópia no worker
- [x] T003 Repositório grava rascunho + evento numa transação; contrato de atomicidade
- [x] T004 Use case perde `extractFields`; contrato: nenhuma leitura na requisição
- [x] T005 `extractAttachmentFields` sai da API; `main.ts` religado

## Fase 2 — O worker lê

> 🤖 Modelo: `sonnet`

- [x] T006 Topologia `aggregate-attachment.v1` + envelope Zod versionado
- [x] T007 Relay do novo outbox, no desenho dos outros quatro
- [x] T008 Parse em `worker_thread` — módulo isolado, sem React, sem rede, sem log
- [x] T009 Consumidor: baixa objeto, chama a thread, grava `extracted_fields`; idempotente
- [x] T010 Contratos + entrada na lista explícita de testes do `package.json`

## Fase 3 — A landing envia

> 🤖 Modelo: `sonnet`

- [x] T011 Cliente de upload de anexo, com Turnstile
- [x] T012 Fila de anexos na tela: um arquivo, uma linha, com estado e erro por linha
- [x] T013 `attachmentDraftIds` no submit
- [x] T014 Contratos: leitura do navegador segue preenchendo; upload que falha não bloqueia envio

## Gates de toda task

- `bun run typecheck` e `bun run lint` na raiz
- contrato antes da implementação
- evidência em `evidence.md`
