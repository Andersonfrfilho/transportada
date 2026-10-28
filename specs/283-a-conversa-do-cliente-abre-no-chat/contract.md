# Contrato 283 — A conversa do cliente (T1)

Contrato da API para o painel (T4/T5), escrito antes da implementação (T2/T3). Política pura e testes:
`apps/api-transportada/src/occurrence-conversation/domain/client-conversation.policy.ts` e
`apps/api-transportada/test/occurrence-conversation/client-conversation-policy.contract.ts`.

## Modelo (T2, migração aditiva)

- `occurrence_conversations.participant` ganha **`client`** (D2), ao lado de `contractor` e `driver`.
- Coluna nova `occurrence_conversations.client_tax_id` (CPF/CNPJ do cliente da entrega). Forma do `client`:
  `client_tax_id` preenchido; `contractor_id`, `driver_user_id` e `public_ref` nulos; só ocorrência de nota
  (`occurrence_kind = 'document'`).
- **Uma conversa por ocorrência e contato (D1).** O contato é o destinatário da nota (`tax_id`); a nota tem um só, então o
  único que já existe `(company_id, occurrence_kind, occurrence_id, participant)` é por ocorrência e contato. Nenhum
  único novo, nenhum único trocado.
- Colunas novas em `occurrence_conversation_messages`:
  - `client_delivery_id`: a entrega da 248 (`occurrence_contractor_reply_deliveries.id`) que a mensagem conta. Único
    por empresa: **uma mensagem por envio** (RF2). Sem FK (ciclo de módulos), como `occurrence_id`.
  - `recipient_address`: o destino como saiu (E.164 ou e-mail). Só no banco; resposta e log levam a forma mascarada.
- **Nasce no primeiro envio (D3, RF1).** Toda entrega de alvo `client_boleto_emails` ou `client_boleto_whatsapp` com
  destino cria (ou reaproveita) a conversa e grava a mensagem enviada, em qualquer caminho de envio (painel, app do
  motorista, automático, reserva por e-mail). `skipped` e `pending_window` não viram mensagem.
- **Estados de entrega (RF5).** `queued → sent | failed` acompanham a entrega; `delivered`, `read` (e `bounced` no
  e-mail) vêm do provedor pelo mesmo trilho de status da 183 (`applyProviderMessageStatus`), só avançando.
- O aviso "Boleto enviado …" na conversa do motorista (279 T6b, 281 T5) **continua** como está.

## Leitura — `GET /v1/trip-occurrences/:id/conversations`

A resposta de hoje, com o terceiro item em `conversations` **só para quem tem `occurrences.resolve`** (RF7: quem pode
enviar ao cliente). Sem envio, não há item `client` e nada muda na tela (D3). O painel de hoje já descarta participante
que não conhece, então a API pode ir antes do painel.

```jsonc
{
  "data": {
    "contractorPortal": { "available": true },
    "conversations": [
      { "participant": "contractor", "...": "como hoje" },
      { "participant": "driver", "...": "como hoje" },
      {
        "id": "uuid",
        "participant": "client",
        "status": "open",
        "unreadCount": 1, // recebidas depois da última que ESTE usuário viu
        "client": {
          "name": "Supermercado Bom Preço", // do cadastro do cliente; null se não houver
          "taxIdMasked": "12.•••.•••/0001-90",
          "channels": [
            // D4: faixa "Canais abertos", na ordem da primeira atividade
            {
              "channel": "whatsapp", // "whatsapp" | "email"
              "addressMasked": "+55 ••••1234",
              "state": "replied", // queued | sent | delivered | read | replied | failed
              "lastActivityAt": "2026-10-27T10:10:00.000Z",
            },
            {
              "channel": "email",
              "addressMasked": "fi•••@mercado.com.br",
              "state": "sent",
              "lastActivityAt": "…",
            },
          ],
        },
        "messages": [
          {
            "id": "uuid",
            "direction": "outbound",
            "channel": "whatsapp",
            "bodyText": "", // o texto que saiu quando a API o tem (e-mail); WhatsApp: vazio
            "status": "read",
            "statusTimes": { "queued": "…", "sent": "…", "read": "…" },
            "createdAt": "…",
            "attachments": [],
            "author": { "kind": "automatic" }, // ou { kind: "operation", name, userId } — como hoje
            "clientDelivery": {
              "deliveryId": "uuid",
              "actorKind": "office", // office | driver | system
              "actorName": "Ana", // null no Sistema
              "recipientMasked": "+55 ••••1234",
              "documentName": "boleto-nf-1234.pdf", // o anexo enviado; null se não houver
            },
          },
          {
            "id": "uuid",
            "direction": "inbound",
            "channel": "whatsapp",
            "bodyText": "Recebi, obrigado",
            "status": null,
            "statusTimes": {},
            "createdAt": "…",
            "attachments": [],
            "author": { "kind": "client", "addressMasked": "+55 ••••1234" },
          },
        ],
      },
    ],
  },
}
```

- `author.kind = "client"` é novo e só aparece em mensagem recebida na conversa do cliente.
- `clientDelivery` só aparece na mensagem enviada da conversa do cliente.
- Marcar como lida é a rota que já existe (`POST /v1/occurrence-conversations/:conversationId/read`).

## Resposta do cliente (T3)

- **Resposta do WhatsApp citando o envio (RF3, D5).** O webhook do Evolution (281 T6) casa a citação com a entrega
  (`provider_message_id`) e o número de quem respondeu com o número a que ela foi entregue: a mensagem entra **na
  conversa do cliente** (antes ia para a conversa do motorista), com o número que respondeu (`author.kind = "client"`).
- **Sem citação ou de número desconhecido** continua em "não atribuídas". A fila passa a oferecer a conversa do cliente
  como candidata ("vincular a esta conversa"): `GET /v1/occurrence-conversations/unassigned` traz, em cada candidata,
  `participant: "contractor" | "client"`; na do cliente, `contractorName` leva o nome do cliente (o painel de hoje segue
  lendo). Atribuir é a rota que já existe (`POST /v1/occurrence-conversations/unassigned/:id/assign`, corpo
  `{ conversationId }`), e aceita a conversa do cliente.
- E-mail do cliente não responde (fora do escopo): a conversa mostra só o enviado e o estado.

## O que não muda

- A conversa da contratante e a do motorista, seus únicos e suas rotas.
- O motorista e a contratante nunca leem a conversa do cliente (só o painel).
- Log sem número nem e-mail em claro (RF7); a resposta da API só leva a forma mascarada.
