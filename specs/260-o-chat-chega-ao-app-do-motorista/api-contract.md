# Contrato da API da conversa por assunto (T2.1 → T2.4, T2.4b, T2.5)

> Desenho do `architect` (opus) para a [ADR-0101](../../docs/adr/0101-a-conversa-tem-assunto-e-protocolo.md), conferido contra o
> código. **Regra do dono: tudo aditivo — as rotas e respostas atuais da conversa de ocorrência ficam idênticas.**
> A API não tem OpenAPI (`apps/api-transportada/CLAUDE.md:71`): este arquivo + contrato sobre a tabela de rotas
>
> - `docs/ai-context/api-transportada.md` fazem esse papel.

## Rotas do motorista (`/me`, novas)

Mesmo `resolveDriver` (`403 DRIVER_NOT_REGISTERED`), `no-store` em toda resposta, `companyId` do contexto, envelope
`{ data }` / `{ error: { code, message } }`.

| Método e caminho                                                                                                           | Política      | Limite                                                    | Sucesso                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /me/trips/current/conversations?cursor=`                                                                              | `trip.read`   | —                                                         | `200 { data: Summary[], pagination: { nextCursor: string \| null } }`    |
| `POST /me/trips/current/conversations/open` body `{ subjectType: 'document'\|'trip', subjectId: uuid }` (`.strict()`)      | `trip.report` | **novo** `driver-conversation-open`: 20 / 300 s, Postgres | `201 { data: Summary }`; `200` se já existia                             |
| `GET …/conversations/:subjectType/:subjectId/messages?before=<messageId>&limit=` (padrão 50, máx. 100)                     | `trip.read`   | —                                                         | `200 { data: Message[] }` crescente; assunto visível sem conversa → `[]` |
| `POST …/:subjectType/:subjectId/messages` (`Idempotency-Key` obrigatório; body `{ body, attachmentIds? }` = `replySchema`) | `trip.report` | **mesmo** `DRIVER_CONVERSATION_SEND_RATE_LIMIT`           | `201 { data: Message }`; repetição `200 { data: Message }`               |
| `POST …/:subjectType/:subjectId/messages/read`                                                                             | `trip.read`   | —                                                         | `204`                                                                    |
| `POST …/:subjectType/:subjectId/uploads`                                                                                   | `trip.report` | **mesmo** `DRIVER_CONVERSATION_UPLOAD_RATE_LIMIT`         | `201 { data }` (forma de hoje)                                           |

`subjectType` ∈ `occurrence | document | trip`. Para `occurrence`, as rotas novas usam **as mesmas operações de idempotência**
(`occurrence-conversation.app.reply` / `.app.send`) e os mesmos campos de impressão digital das antigas — uma mensagem que entrou
na fila offline pela rota antiga e é reenviada pela nova é devolvida como já enviada, sem duplicar. `document` e `trip` usam as
operações novas `conversation.app.reply` / `conversation.app.send`. O `idempotency_records` segue guardando só
`{ conversationId, messageId }`; a rota nova **relê** a mensagem pelo id e devolve o objeto completo (primeira vez e repetição).
Os limites compartilham o balde com as rotas antigas: alternar de rota não dobra a cota.

## Forma do resumo (`Summary`)

```ts
{
  subjectType: 'occurrence' | 'document' | 'trip',
  subjectId: string,            // occurrence_id | trip_document_id | trip_id
  subjectLabel: string,         // servidor: "Avaria · parada 3", "NF 4521 · Casa Verde", "Viagem de 09/10"
  tripId: string | null,
  protocol: string,             // "261009-K7M2"
  status: 'open' | 'closed',    // efetivo: gravado OU nota liberada OU viagem terminal
  lastMessageAt: string | null,
  lastMessagePreview?: string,  // left(body_text, 140); omitido se vazio
  lastMessageDirection?: 'inbound' | 'outbound',
  unreadCount: number,          // outbound com status distinto de 'read' (mesma regra de hoje)
  awaitingDriver: boolean,      // última mensagem é 'outbound' e status 'open'
  channels: Array<'app' | 'whatsapp' | 'email' | 'portal'>,   // canais distintos das mensagens, ordem estável; [] se não há mensagem
  iconName?: string             // só occurrence com ícone no tipo (spec 255)
}
```

`Message` = a forma de hoje (`id, direction, authorName, bodyText, createdAt, status, attachments`) **mais** `clientMessageId: string | null`
e `channel`. `direction` é sempre na perspectiva da empresa (`inbound` = do motorista).

## Consulta da lista (sem N+1)

Filtro: `participant = 'driver'` e (`driver_user_id = eu` **ou** (`subject_type <> 'occurrence'` e eu sou o principal de `trip_id`)) e
(`trip_id is null` **ou** eu estou na tripulação de `trip_id`). Última mensagem por `LEFT JOIN LATERAL (… ORDER BY created_at DESC,
id DESC LIMIT 1)`. Agregados (`unread`, `channels`) numa subconsulta agrupada. Ordem `coalesce(last_message_at, created_at) DESC, id DESC`,
cursor por chave (`encodeKeysetCursor`/`decodeKeysetCursor` existentes), página de 50. `iconName`, rótulos e estado efetivo por **no
máximo 4 buscas em lote** (`inArray`): (a) `trip_stop_occurrences` → `company_occurrence_types` (`icon_name`, nome do tipo, parada);
(b) `trip_document_occurrences` → tipo → `trip_documents`; (c) `trip_documents` + `nfe_documents` para `document`; (d) `trips` para
`trip`. Baixar a lista é entregar (`applyDriverStatus`), mas só para as conversas da página. A lista antiga não muda.

## BOLA, retarget e encerramento (ADR-0101 §3–4)

Conversa de nota/viagem visível ao motorista se: está na tripulação de `trip_id` **e** (é o `driver_user_id` da conversa **ou** é o
principal da viagem agora). Fora disso `404 CONVERSATION_NOT_FOUND` — o mesmo para empresa errada, assunto inexistente e viagem
alheia. Envio do escritório → alvo é o principal agora (`retarget: true`); resposta/`open` do motorista → `retarget` só se ele é o
principal; membro da tripulação que não é o destinatário nem o principal → `409 OCCURRENCE_CONVERSATION_DRIVER_CHANGED` (já existe).
Encerramento gravado só pelo escritório (nota/viagem); derivado na leitura: `document` com `trip_documents.released_at IS NOT NULL`;
`document` e `trip` com `trips.status in ('completed','cancelled')`. Escrever em conversa efetivamente encerrada → `409
CONVERSATION_CLOSED`. A ocorrência continua sempre `open`.

## Erros (códigos estáveis; classes novas em `occurrence-conversation.error.ts`)

| Status | Código                                                       | Quando                                                                                                        |
| ------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| 400    | o inválido genérico de `parseBody`/`parseUuidPathIdentifier` | `subjectType` fora do vocabulário, id que não é UUID, chave de idempotência inválida, `open` com `occurrence` |
| 403    | `DRIVER_NOT_REGISTERED`                                      | já existe                                                                                                     |
| 404    | **`CONVERSATION_NOT_FOUND`** (novo)                          | assunto não visível/inexistente/de outra empresa/viagem alheia — também para `occurrence` nas rotas novas     |
| 409    | **`CONVERSATION_CLOSED`** (novo)                             | resposta, envio de arquivo, envio do escritório ou `open` do motorista em conversa encerrada                  |
| 409    | `OCCURRENCE_CONVERSATION_DRIVER_CHANGED`                     | já existe                                                                                                     |
| 409    | `OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED`             | já existe                                                                                                     |
| 429    | —                                                            | limite de requisições                                                                                         |

## Rótulos no servidor (`conversation-subject-label.policy.ts`, pura e testada)

`subjectLabel` (lista) pode levar o nome curto do destinatário (o motorista já o vê na viagem). `noticeLabel` (sino) **sem nome nenhum**
("NF 4521", "Avaria · parada 3", "Viagem de 09/10"), como em `occurrence-label.policy.ts:5-8`. Datas em `America/Sao_Paulo`.

## Rotas do escritório (T2.4b — a Fase 3 depende delas)

`GET /trips/:tripId/conversations` (`fleet.read`), `POST /trips/:tripId/conversations/open`, `GET|POST
/trips/:tripId/conversations/:subjectType/:subjectId/messages`, `…/uploads`, `POST …/close`. Leitura pela rota existente
`POST /occurrence-conversations/:id/read`. Escrita em nota e viagem: `trip.manage` (quem despacha fala com o motorista); a ocorrência
continua com `occurrences.resolve`. Nota e viagem são só canal `app` na v1 (o envio grava `channel = 'app'`).

**Como ficou (T2.4b).** Tudo parte da viagem do caminho; o assunto que não é dela (outra viagem, outra empresa, id inexistente) é o
mesmo `404 CONVERSATION_NOT_FOUND`. `subjectType` aceita só `document | trip` — `occurrence` é `400` (a ocorrência não abre nem encerra por
estas rotas).

| Método e caminho                                        | Política      | Limite                                                               | Sucesso                                                       |
| ------------------------------------------------------- | ------------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `GET /trips/:tripId/conversations`                      | `fleet.read`  | —                                                                    | `200 { data: OfficeSummary[] }` (sem paginação, teto de 500)  |
| `POST /trips/:tripId/conversations/open`                | `trip.manage` | **novo** `office-subject-conversation-state`: 60 / 300 s, Postgres   | `201 { data: OfficeSummary }`; `200` se já existia            |
| `GET …/:subjectType/:subjectId/messages?before=&limit=` | `fleet.read`  | —                                                                    | `200 { data: Message[] }` crescente; sem conversa → `[]`      |
| `POST …/:subjectType/:subjectId/messages`               | `trip.manage` | **mesmo** `OCCURRENCE_CONVERSATION_RATE_LIMIT` (balde compartilhado) | `201 { data: Message }`; repetição da chave `200`             |
| `POST …/:subjectType/:subjectId/messages/read`          | `fleet.read`  | —                                                                    | `204` (marca lidas, por usuário, as mensagens do motorista)   |
| `POST …/:subjectType/:subjectId/uploads`                | `trip.manage` | **mesmo** `OCCURRENCE_CONVERSATION_UPLOAD_RATE_LIMIT`                | `201 { data }`; exige conversa aberta antes (`404` se não há) |
| `POST …/:subjectType/:subjectId/close`                  | `trip.manage` | `office-subject-conversation-state`                                  | `200 { data: OfficeSummary }`; idempotente                    |

- `OfficeSummary` = o `Summary` do motorista com `driverName` (nome curto do destinatário, ou `null`) e `unreadCount` do ponto de vista
  do escritório: mensagens `inbound` depois da última que **o usuário** marcou como lida (`occurrence_conversation_reads`).
- **Abrir também reabre** a que o escritório encerrou, se o assunto continua válido; nota liberada ou viagem terminal é `409
CONVERSATION_CLOSED`. Não existe rota `reopen`.
- Abrir e enviar levam a conversa ao motorista **principal de agora** (`retarget`); sem principal com vínculo ativo, `409
CONVERSATION_NO_DRIVER` (código novo). Enviar também cria a conversa se ainda não existe; pedir arquivo, não.
- Envio: idempotência na operação `conversation.app.send`, com impressão digital `[empresa, autor, tipo, id, corpo, anexos]` — a mesma chave de
  outro operador ou com outro corpo é `409 OCCURRENCE_CONVERSATION_IDEMPOTENCY_KEY_REUSED`; a repetição responde mesmo se a conversa
  encerrou depois. O aviso sai uma vez, depois da transação, pelo gateway de hoje com o rótulo do assunto (ponto de extensão da T2.5:
  `office-subject-notifier.adapter.ts`).
- Marcar lida usa rota nova por assunto (a antiga `POST /occurrence-conversations/:id/read` não confere a viagem e exigiria o id da
  conversa na resposta); ela chama o mesmo escritor de leitura, sem alterá-lo.

## Aviso do sino (T2.5)

`occurrence`: a mesma chave `trip.conversation-message`, mesmo template e marcador `occurrenceLabel`; o `payload` ganha campos extras
`subjectType: 'occurrence'`, `subjectId`, `subjectLabel` (o `noticeLabel`), `protocol`; `dedupeKey` não muda. `document`/`trip`: chave
**nova** `trip.subject-conversation-message` (canal `INBOX`, marcador `subjectLabel`, texto "A operação mandou uma mensagem ·
{{subjectLabel}}. Abra Conversas no app para ler e responder."), `payload { subjectType, subjectId, subjectLabel, protocol }`, nunca o
corpo; entrada em `NOTIFICATION_CATALOG` e `notification-preview.constant.ts`. O seed só cria template que **não existe**
(`notification-template-seed.service.ts:51-60`): por isso a chave nova, e o texto da ocorrência (D7) fica como decisão do dono (T2.5b).

### Como ficou (T2.5)

O `createDriverConversationNotifier` roteia pelo `subjectType` (porta com `subjectType`, `subjectId` e `protocol` opcionais; sem eles é a chamada
antiga, byte a byte). `occurrence` segue em `trip.conversation-message` com `payload { occurrenceLabel, subjectType, subjectId, subjectLabel,
protocol }` (o `occurrenceLabel` e os demais campos do envelope — categoria, template, `dedupeKey`, destinatário — não mudaram; preso por constantes
em `test/occurrence-conversation/driver-conversation-notifier.contract.ts`). `document`/`trip` vão por `trip.subject-conversation-message`
(`dedupeKey` = `<chave>:<id da mensagem>`, como a da ocorrência), `payload { subjectType, subjectId, subjectLabel, protocol }`. O `protocol` da
ocorrência vem de `findOrCreateDriverConversation`, que passou a devolvê-lo (lido na mesma transação do envio). Falha da fila continua só
registrada. O catálogo e o preview ganharam a chave e o marcador `subjectLabel`; o seed a cria sozinho (só cria o que não existe). O guard de
catálogo é relativo (conta chaves × entradas), então não precisou de ajuste; o texto da ocorrência segue o do seed (T2.5b, decisão do dono).

## Estados de entrega das mensagens do motorista (T5.4)

Só nas rotas novas de mensagens (`GET` e `POST …/messages`); as rotas antigas da 183 e as respostas do portal, WhatsApp e e-mail não mudam.
Na `Message` `inbound` (do próprio motorista, gravada com `status` nulo) o campo `status` passa a ser **derivado**: `'delivered'` (dois ticks
cinza — a empresa a registrou) ou `'read'` (dois ticks azuis — algum usuário do **escritório**, diferente do motorista da conversa, tem em
`occurrence_conversation_reads` uma `last_read_message_id` cuja mensagem tem `created_at >=` o da mensagem; compara-se por data, nunca por
uuid). A mensagem `outbound` segue com o status que já tem. Sem coluna nem migration: uma consulta em lote por página
(`readOfficeReadHorizon`, o `max(created_at)` das mensagens lidas por usuários que não são o motorista). O `POST` devolve `'delivered'`.
Política pura: `domain/driver-own-message-status.policy.ts`.
