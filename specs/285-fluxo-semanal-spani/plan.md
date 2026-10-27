# Plano técnico

## Contexto e premissas

Reusar o que existe: upload e expansão de zip (`NfeUploadPanel`, `nfe-import-archive-expander.gateway.ts`),
emissão de CT-e em lote, faturas (`billing`), NFS-e (`nfse-invoices`, notas de Ribeirão entram por
vínculo externo, spec 250), email por Resend e modelos do módulo de notificação (specs 271/272/274).
O fluxo é novo apenas como orquestração com confirmações.

## Arquitetura e arquivos afetados

- Nova área `weekly-flows` na API: automação (configuração), execução (instância por email recebido) e
  passos com estado `pending → confirmed → done | failed`.
- Leitor de planilha da semana (parser Excel) e cruzamento com `nfe_documents` por número da nota.
- Montagem das partes de XML (≤ 100) e do email de resposta a todos.
- Frontend: telas de confirmação por passo e página de automações (design system existente).
- Receber email da caixa da empresa: etapa 5, spec própria (domínio e inbound no Resend).

## Contratos/API/eventos

Rotas por passo (`POST /weekly-flows/:id/steps/:step/confirm`), idempotentes por `Idempotency-Key`;
listagem e detalhe do fluxo; CRUD de automações. Passos pesados vão ao worker por fila.

## Dados, migration e rollback

Tabelas aditivas: automações, execuções, passos, confirmações. Migration com rollback ao lado.

## Segurança e tenant

`companyId` do contexto; permissões por passo; contratos negativos cross-tenant; destinatários só os do
email original.

## Idempotência e concorrência

Chave por (execução, passo); lock otimista no estado do passo; reenvio de parte por `partNumber`.

## Observabilidade

Log por `traceId` com contagens (nunca XML); auditoria de cada confirmação; falhas visíveis na tela.

## Estratégia de testes

Contrato antes da implementação em cada etapa; fixtures sintéticas do lote (sem dado de cliente);
integração com banco para estado dos passos; smoke das telas.

## Riscos

Tamanho dos anexos no email; regra da NFS-e de Ribeirão (emissão externa, spec 250); receber email
(etapa 5) depende de domínio e provedor.
