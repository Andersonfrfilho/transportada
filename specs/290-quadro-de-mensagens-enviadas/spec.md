# Spec 290 — Quadro de mensagens enviadas

**Origem (Anderson, 01/11/2026):** "add ao painel quantas mensagens estão sendo enviadas e por categoria: se é ocorrência, que tipo de
ocorrência, ou outras coisas", "e-mails também". Escopo da v1 escolhido por ele: **tudo que a plataforma envia**.

Leitura de `specs/` feita antes (`ls specs | grep -i -E 'mensag|notific|painel|operac'`): a 286/287 contam entregas por canal só para o
boleto; nenhuma spec agrega o envio. O painel de Operações (`OperationsDashboard.page.tsx`) mostra jobs e auditoria, não mensagens.

## Fontes (sem tabela nova, sem dupla contagem)

| Categoria      | Fonte                                                                   | Canal                               | Subcategoria                                                                                                                                             |
| -------------- | ----------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `occurrence`   | `occurrence_conversation_messages` com `direction = 'outbound'`         | `channel` (whatsapp, email, portal) | tipo da ocorrência (`company_occurrence_types.name`, via `occurrence_id` + `occurrence_kind`) e `participant` (contractor, driver, client, client_email) |
| `notification` | `notification.deliveries` (+ `notification.notifications.template_key`) | `channel`                           | `template_key`                                                                                                                                           |
| `access`       | `password_reset_delivery_outbox`, `invitation_delivery_outbox`          | email                               | `password_reset`, `invitation`                                                                                                                           |

⚠️ **O boleto ao cliente não entra pela tabela de entregas** (`occurrence_contractor_reply_deliveries`): cada entrega que sai grava a
mensagem na conversa do cliente (`client_delivery_id`), então a fonte `occurrence` já a conta. Somar as duas contaria o boleto duas vezes.

## Requisitos

- **RF1** `GET /operations/sent-messages?from=&to=` devolve contagens por categoria → canal → subcategoria e o total por status
  (enviada, entregue, lida, falhou), no recorte da empresa autenticada (`companyId` nunca vem do payload).
- **RF2** Janela padrão 24 h; `from`/`to` aceitam até 90 dias. Sem dado de mensagem, só contagem (nenhum telefone, e-mail ou texto).
- **RF3** Permissão própria de leitura (`operations.read`, a do painel de Operações).
- **RF4** Card no painel de Operações: total no período, quebra por canal e por categoria, e a lista das subcategorias com mais volume.
- **RF5** Uma fonte que falhar não derruba o quadro: a categoria vem marcada como indisponível.

## Fora do escopo

Custo por mensagem, métrica por usuário, série diária (gráfico); entram depois se o volume pedir.
