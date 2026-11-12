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

## Envio por e-mail em partes: o que a leitura do código mostrou (28/10)

- A API nunca envia e-mail: grava `contractor_mail_messages` + `contractor_mail_outbox` (`recordMailDelivery`) e o worker entrega pelo Resend. O envio das partes reaproveita esse caminho, uma mensagem por parte.
- Limites do canal (`conversation-attachment.policy.ts`): 5 anexos por mensagem, 10 MB por arquivo, 25 MB no total, e `application/xml` **não** é tipo permitido. Decisão: cada parte vai como **um `.zip`** com até 100 XMLs de CT-e (`parte-01-de-04.zip`), mais a fatura e o PDF da NFS-e: 3 anexos. Exige liberar `application/zip` na política e montar o zip no servidor.
- XML do CT-e: `cte_fiscal_documents.xml_object_id` (só `authorized`, sem cancelamento). Não há função "XML por id"; escrever uma, no mesmo molde de `cte-export-selection.query.ts`. NFS-e: `nfse_fiscal_documents.pdf_object_id` (pode ser nulo: o passo bloqueia e avisa).
- Tabela de Ribeirão no corpo: nova variável de HTML do sistema (como `tabelaItens`) com modelo próprio em Notificações; proibido layout de e-mail em código.
- Responder a todos: o canal só tem `To` + cc de usuários da empresa. Os destinatários da automação vão em `To`/`Cc` da mensagem; "responder a todos" depende do Reply-To da caixa da empresa (etapa 5).
- Pendente de achar: onde o PDF da fatura é armazenado/gerado (`billing.schema.ts`).
- Idempotência: uma chave por (execução, parte); reenviar uma parte reaproveita a chave e não duplica.
