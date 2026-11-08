# Evidência — spec 308

## T1 — Spike: o 1:1 como "grupo de um só" (lido em `origin/staging` `06f6b8e`)

**Conclusão: D1 se sustenta sem migração.** Nenhuma tabela usada pelo fluxo do pedido exige `@g.us`; o
`CHECK` de regex está só na ficha do grupo (`fleet_driver_whatsapp_groups`), que o 1:1 não usa. O que precisa
mudar é a **entrada** (`receive` do `groupInbound`), não o fluxo. T2 entra com `groupJid = <from>@s.whatsapp.net`
e `driverId` achado pelo telefone.

### O que aceita JID individual como está

| Peça                                               | Onde                                                                                 | Por quê funciona                                                                                                                                                |
| -------------------------------------------------- | ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sessão do pedido (`groupSessions`)                 | `whatsapp_group_requests.group_jid` (`whatsapp-group-request.schema.ts`)             | `text` sem `CHECK`; índice único parcial `(company_id, group_jid) where open` vale para qualquer texto. `owner_number ~ '^[0-9]{8,20}$'` casa com `event.from`. |
| Mensagens do pedido                                | `whatsapp_group_request_messages`                                                    | Chave por `provider_message_id`; `via in ('mention','owner_reply')` — o 1:1 usa os mesmos valores (sem migração).                                               |
| Respostas (`groupReplies`)                         | `evolution-group-reply.gateway.ts` → `evolution-document-sender.gateway.ts`          | `channel.sendText(number)` passa por `resolveEvolutionDestination` do SDK 0.3.0: o que não é `@g.us` vira só dígitos. `sendDocument` idem (`sendMedia`).        |
| Turno (uma mensagem por turno)                     | `turnReplies` chave `${companyId}\|${groupJid}`                                      | Texto opaco.                                                                                                                                                    |
| Vencimento do pedido                               | `whatsapp-group-request-expiry.watcher.ts`                                           | Avisa pelo `group_jid` gravado no pedido.                                                                                                                       |
| Boleto de volta / "pedir boleto de novo"           | `whatsapp-group-boleto-return.support.ts`, `whatsapp-group-boleto-resend.adapter.ts` | Leem `request.group_jid`; o aviso volta ao 1:1 onde o pedido abriu.                                                                                             |
| Foto/localização (293 T15)                         | `readGroupMedia`, `downloadEvolutionMedia`, `createGroupProofIntake`                 | Leitura do corpo cru por `key.id`, sem olhar o chat; download pela mensagem inteira (`rawMessage`). `openAnswerRequest` grava com o `groupJid` recebido.        |
| Áudio (292 T9)                                     | `readGroupAudio`, `WhatsAppBotAudio` (conversa `group:<jid>`)                        | Chave opaca; download igual ao da foto.                                                                                                                         |
| "É o motorista?"                                   | `whatsapp-group-delivery.adapter.ts` `isGroupDriver`                                 | Compara `fleet_drivers.phone` com o remetente (`sameBrazilianPhone`): no 1:1 o remetente é o próprio motorista.                                                 |
| XML (301/306/307)                                  | `receive-whatsapp-xml-document.service.ts`                                           | Já trata `chat === 'user'` (remetente = `event.from`, sem marcação) e vem antes de tudo no webhook. **D2.1 já está pronto.**                                    |
| Transcrição para a conversa da ocorrência (292 T7) | `syncWhatsAppGroupRequestTranscripts`                                                | Varre pedidos pelo id, não pelo grupo.                                                                                                                          |

### O que exige grupo cadastrado (e o ajuste, todos na entrada)

1. **`findGroupDriver`** (lista de permissão por `fleet_driver_whatsapp_groups`, onde `group_jid` tem `CHECK ~ '@g\.us$'`,
   `fleet.schema.ts:776`, e o Zod `WHATSAPP_GROUP_JID_PATTERN` da ficha). **Não gravar o 1:1 lá.** No 1:1 o `driverId`
   vem do telefone: `brazilianPhoneCandidates` + regra de `decideCrewPhoneMatch` (número exato decide; com/sem o 9 só
   se for de uma ficha só), filtrando `fleet_drivers.status = 'active'`. `fleet_drivers.phone` **não é único**: dois
   motoristas no mesmo número → não reconhecido (cai no painel, D2.5), nunca palpite.
2. **Remetente**: o SDK devolve `participant = ''` fora de grupo. Sem ajuste, `receive` responde `unknown_sender`. No 1:1
   o remetente é `event.from`.
3. **Marcação**: `decideGroupMessage` só admite com marcação ou dono de pedido aberto. No 1:1 toda mensagem é
   endereçada (via `mention` sem pedido aberto, `owner_reply` com pedido do mesmo número).
4. **Identidade (`lidDirectory`)**: chama `GET /group/participants?groupJid=…`. Com JID individual o Evolution falha →
   `identity_unavailable`. Caminhos que a chamam: remetente só com `@lid`, `@lid` marcados, e **áudio que cita uma
   mensagem do bot por `@lid`** (`receiveAudio`, `quotedParticipant`). No 1:1 nenhum é necessário: pular a identidade
   (o `botNumber` continua servindo só para descartar `own_number`).
5. **Frase de chamada do áudio**: sem marcação nem pedido, o áudio do grupo só é ouvido com a frase ("atendimento
   Fernandes"). No 1:1 o áudio do motorista vai direto à transcrição com confirmação (como `quotesBot`).
6. **Marca na resposta**: `groupReplies.send({ mentionNumber })` abre o texto com `@<número>` e manda `mentioned`.
   No 1:1 isso aparece como texto solto: a entrada direta não passa `mentionNumber` (o `reply` do áudio idem).
7. **Limite por número**: o `groupInbound` não tem limitador. D3 pede o mesmo balde do Evolution
   (`occurrence-conversation-evolution:<empresa>:<phoneKey>`): consumir antes de entrar no fluxo.

### Desenho sugerido para a T2 (sem copiar o fluxo)

Um `receiveDirect` no `EvolutionGroupInbound` (ou um modo `direct` no mesmo `receive`) que recebe `driverId`,
`sender = event.from`, `groupJid = ${event.from}@s.whatsapp.net`, pula 1–6 acima e chama os **mesmos**
`handle`/`handleMedia`/`bot.receive`. No webhook, o ramo `chat === 'user'` decide, nesta ordem: XML (já antes) →
citação que casa `via: 'reply'` na atribuição da 281 → motorista por telefone → (T4) importador → `receiveMessage`.
A citação precisa de uma leitura sem gravar (`loadAttributionContext` + `resolveEvolutionAttribution`) para não
gravar a mensagem duas vezes.

### Riscos e lacunas encontradas (fora do que a T2 resolve sozinha)

- **Importador que não é motorista (D2.4/RF4):** `whatsapp_group_requests.driver_id` é `NOT NULL` com FK para
  `fleet_drivers`. Quem só tem papel de XML **não pode abrir sessão do pedido**. A T4 deve responder o menu/orientação
  sem sessão (resposta direta pelo `groupReplies`), não reaproveitar o pedido.
- **Duas sessões do mesmo motorista:** o pedido é único por `(empresa, group_jid)`, então o motorista pode ter um
  pedido aberto no grupo e outro no 1:1 ao mesmo tempo. O estado da entrega em preparo e a localização lembrada são
  por motorista (`forgetLocation({ driverId })`). Sugestão para a T2: aceitar (cada conversa responde onde foi
  perguntada) e cobrir com contrato; se causar confusão no teste de staging, fechar o pedido da outra conversa ao abrir.
- **Lembrete de parada (299) e "pergunta aberta":** `driver-open-question.adapter.ts` e
  `drizzle-driver-reminder-channel.resolver.ts` só olham o grupo cadastrado e a sessão da **Meta** como "direto". Um
  pedido aberto no 1:1 do Evolution não segura o lembrete, e a atividade no 1:1 não faz o lembrete ir ao 1:1. Proposta:
  incluir `<telefone>@s.whatsapp.net` nas duas leituras (T5 ou task nova); o envio proativo pelo 1:1 do Evolution
  ainda não existe (o `direct` do lembrete é o canal da Meta).
- **1:1 só com `@lid`:** quando o Evolution manda `remoteJid …@lid` sem `remoteJidAlt`/`senderPn`, o SDK devolve
  `chat: 'lid'` e `from: ''`; hoje isso já é ignorado (nem painel, nem XML). Não dá para reconhecer sem número. Medir
  no teste de staging (T5): a T2 pode contar `chat` no log `whatsapp_evolution.webhook.received` (só o tipo, sem
  número).
- **Sem mudança para o cliente/contato:** a atribuição da 281 só usa `single_open` para contato da contratante
  (`sender.driverUserId === null`); motorista sem citação já ia para "não atribuídas". Desviar o motorista para o bot
  não tira nada que hoje chegasse a uma conversa.

### Verificação

Leitura de código; nada foi executado contra staging ou produção (o spike não precisou de dado de ambiente).
Arquivos lidos: `whatsapp-evolution-webhook.use-case.ts`, `evolution-group-inbound.service.ts`,
`evolution-group-identity.service.ts`, `evolution-group-message.policy.ts`, `evolution-group-reply.gateway.ts`,
`evolution-document-sender.gateway.ts`, `evolution-media-download.gateway.ts`, `whatsapp-group-request.schema.ts`,
`fleet.schema.ts`, `whatsapp-group-request-expiry.watcher.ts`, `whatsapp-group-boleto-return.support.ts`,
`whatsapp-group-delivery.adapter.ts`, `whatsapp-group-sender.adapter.ts`, `receive-whatsapp-xml-document.service.ts`,
`drizzle-whatsapp-xml-receipt.repository.ts`, `evolution-conversation-inbound.service.ts`,
`evolution-attribution.policy.ts`, `driver-open-question.adapter.ts`, `drizzle-driver-reminder-channel.resolver.ts`,
`main.ts` (`createEvolutionWebhook`) e o `dist` do `@adatechnology/evolution-whatsapp-provider` 0.3.0
(`senderOf`, `resolveEvolutionDestination`).
