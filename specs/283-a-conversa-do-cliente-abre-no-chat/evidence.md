# Evidência 283 — A conversa do cliente abre no chat da ocorrência

## T1 — Contrato antes (27/10/2026)

**O que mudou**

- `specs/283-a-conversa-do-cliente-abre-no-chat/contract.md`: o contrato da API para o painel (T4/T5) — participante
  `client`, uma conversa por ocorrência e contato (o único que já existe serve, porque a nota tem um destinatário só),
  uma mensagem por entrega (`client_delivery_id`), a faixa "Canais abertos", `author.kind = "client"`, `clientDelivery`,
  a leitura só com `occurrences.resolve` (RF7) e a resposta pela citação / "vincular a esta conversa" (T3).
- `apps/api-transportada/src/occurrence-conversation/domain/client-conversation.policy.ts`: a política pura — as entregas
  que abrem a conversa e o canal de cada uma, o estado da mensagem a partir da entrega, o destino mascarado e a faixa
  de canais (quem entra, ordem, estado, `replied`, contato removido).

**Provas**

- `test/occurrence-conversation/client-conversation-policy.contract.ts` (no `occurrence-conversation.contract.test.ts`):
  17 testes — estado por entrega (`skipped`/`pending_window` não viram mensagem), número e e-mail mascarados, mesma
  pessoa com outra grafia, dois números numa conversa, WhatsApp falhou e e-mail de reserva saiu (as duas aparecem),
  e-mail devolvido é falhou, respondeu e reenvio depois da resposta, contato removido some da faixa, nada em claro.

```
bun test ./test/occurrence-conversation/client-conversation-policy.contract.ts
 17 pass
 0 fail
```

## T2 — API e migração aditiva (27/10/2026)

**O que mudou**

- Migration `20261027232931_occurrence_client_conversation` (gerada, com snapshot, e o gatilho escrito à mão):
  - `occurrence_conversations`: participante `client` (CHECK só alargada), `client_tax_id` com a forma do CPF/CNPJ
    alfanumérico, e a forma do `client` na CHECK de participante (só ocorrência de nota, sem contratante, motorista nem
    referência do portal). O único `(company_id, occurrence_kind, occurrence_id, participant)` que já existia é o "por
    ocorrência e contato" (D1): a nota tem um destinatário só.
  - `occurrence_conversation_messages`: `client_delivery_id` (único por empresa, sem FK por causa do ciclo de módulos) e
    `recipient_address`, com a CHECK de que só a enviada tem destino.
  - Gatilho `occurrence_client_conversation_sync_trigger` (`AFTER INSERT OR UPDATE OF status` na entrega da 248): toda
    entrega de alvo `client_boleto_emails`/`client_boleto_whatsapp` com destino abre (ou reaproveita) a conversa do
    cliente e grava uma mensagem por entrega, com ator (o `actor_user_id` da entrega; sem ator é automática), canal,
    destino e estado; `queued → sent | failed` acompanham a entrega só para a frente. Cobre todo caminho que grava a
    entrega (painel, app do motorista, automático da API e do worker, reserva por e-mail) sem tocar no worker. O
    corpo do e-mail vai junto; o do WhatsApp fica vazio (o painel mostra o arquivo pelo `clientDelivery`). Sem
    cliente cadastrado a conversa não nasce. O bloco tem `EXCEPTION`: falha aqui nunca derruba o envio.
  - Rollback: recusa com conversa do cliente gravada; senão tira gatilho, função, colunas e volta as CHECKs.
- `applyProviderMessageStatus` (Meta, Evolution e Resend): a mensagem do cliente não guarda o id do provedor (o aviso do
  motorista já o tem e o id é único no canal); ela é achada pela entrega — `provider_message_id` no WhatsApp, o id do
  Resend do e-mail da entrega no e-mail — e avança junto (`delivered`, `read`, `bounced`).
- `GET /v1/trip-occurrences/:id/conversations`: a conversa `client` só para quem tem `occurrences.resolve` (RF7), com
  `client` (nome, documento mascarado, faixa de canais), `clientDelivery` na enviada e `author.kind = "client"` na
  recebida. O aviso "Boleto enviado …" na conversa do motorista continua como estava.
- Por que o e-mail do cliente **não** leva `mail_message_id` na mensagem: a thread do e-mail é a da contratante, e
  `findOccurrenceConversationByThread` (worker) mandaria a resposta da contratante para a conversa do cliente.

**Provas**

- `test/integration/occurrence-client-conversation.integration.ts` (6, Postgres real): WhatsApp a dois números = uma
  conversa e duas mensagens, repetido e refechamento não duplicam; Evolution `delivered`/`read` e envio que falhou na
  faixa; e-mail na mesma conversa com o texto e o Resend avançando para `delivered`; sem `occurrences.resolve` a conversa
  não sai e sem envio ela não existe; contato removido some da faixa; sem cliente cadastrado o envio segue e a conversa
  não nasce. Nenhum número nem e-mail em claro na conversa do cliente.
- `test/database-migration/occurrence-client-conversation.assertion.ts`: aplica, rollback, reaplica.
- `test/occurrence-conversation/conversation-routes.contract.ts`: `includeClient` só com `occurrences.resolve`.
- `occurrence-contractor-reply-client-whatsapp.integration.ts`: o aviso do motorista conferido só na conversa dele.

```
bun --env-file=../../.env.test test ./test/integration/occurrence-client-conversation.integration.ts   6 pass
DRIZZLE_TEST_DATABASE_URL=… bun test ./test/database-migration.contract.test.ts                        192 pass
bun test ./test/occurrence-conversation.contract.test.ts                                               876 pass
```

## T3 — A resposta do cliente entra na conversa dele (27/10/2026)

**O que mudou**

- Webhook do Evolution (281 T6): `findReplyRecipient` devolve, junto do número da entrega citada, a conversa do cliente
  daquela entrega; `resolveEvolutionAttribution` manda a resposta de quem recebeu (`recipient_reply`) para ela. Sem a
  conversa do cliente (envio de antes da 283, ou sem cliente cadastrado), segue na conversa da mensagem citada, como
  na 281. Outro número citando o envio continua em "não atribuídas".
- "Não atribuídas": no WhatsApp, as candidatas passam a incluir as conversas do cliente (abertas pela mesma regra da
  contratante) em que o número do remetente recebeu um envio ou é contato de WhatsApp do cliente. Cada candidata ganha
  `participant` (`contractor` | `client`); na do cliente, `contractorName` leva o nome do cliente (o painel de hoje
  segue lendo). Atribuir é a rota que já existia e passa a aceitar a conversa do cliente.
- A faixa de canais casa o número pela chave do WhatsApp (`55` + DDD + oito últimos), como o resto do módulo: a resposta
  sem o nono dígito marca "respondeu" no mesmo canal. Achado pelo teste de integração desta etapa.

**Provas**

- `test/occurrence-conversation/evolution-inbound.contract.ts`: com a conversa do cliente a resposta de quem recebeu
  entra nela; outro número não; o serviço grava na conversa do cliente com o número como chegou.
- `test/integration/occurrence-client-conversation.integration.ts` (+3, Postgres real): resposta citando o envio, do
  mesmo celular sem o nono dígito, entra na conversa do cliente (`author.kind = "client"`, mascarado), conta como não
  lida, marca "respondeu" e não entra na do motorista; sem citação vai para "não atribuídas" com a conversa do cliente
  como candidata e a atribuição grava lá; número desconhecido não tem candidata.

```
bun --env-file=../../.env.test test ./test/integration/occurrence-client-conversation.integration.ts   9 pass
bun test ./test/occurrence-conversation.contract.test.ts                                               879 pass
```

## API da resposta ao cliente pelo painel (para a T5, D6, RF7)

A T5 é do painel; a rota que ela chama não existia. Entrou junto da T3, como no contrato
(§ "Responder ao cliente pelo painel"): `POST /v1/trip-occurrences/:id/conversations/client/messages`.

- O número sai do `replyTarget.id` da faixa (a primeira entrega ao número), nunca do corpo; `.strict()` recusa `number`.
- O primeiro envio do painel a um número pede `confirmNumber` (409 com o número mascarado); depois da primeira resposta o
  canal fica `confirmed: true`.
- WhatsApp desligado no tipo, Evolution sem configuração, desativado ou fora do ar: erro e nada gravado. A ordem é
  conferir, perguntar ao Evolution, gravar `queued` (idempotente pela chave em `client_message_id`) e só então enviar.
- A mensagem guarda o id do provedor: `delivered`/`read` avançam por `applyProviderMessageStatus`, e a resposta do
  cliente citando ela entra na conversa do cliente (`findReplyRecipient` olha a mensagem do painel quando não há aviso).
- Sem teto diário próprio: o envio é um a um, pelo operador, sob o limite da rota de conversa. O teto diário da 281
  segue contando só as entregas do boleto.

**Provas**

- `test/occurrence-conversation/send-client-reply.contract.ts` (novo): envio ao número do alvo, confirmação, número já
  confirmado, replay pela chave, os quatro "WhatsApp não serve" sem gravar, 404 sem dizer qual, recusa do provedor
  vira `failed` com log só de ids.
- `test/occurrence-conversation/conversation-routes.contract.ts`: 202 com o texto aparado; número, e-mail, texto
  vazio ou acima de 4000, alvo não-uuid e falta da chave são 400; sem `occurrences.resolve` é 403.
- `client-conversation-policy.contract.ts`: alvo opaco só no WhatsApp com entrega, confirmado depois da resposta do
  painel, alvo de outra conversa, de e-mail ou de contato removido não responde.
- `evolution-inbound.contract.ts`: citando a resposta do painel, do número que recebeu, entra na conversa do cliente;
  outro número não.
- `test/integration/occurrence-client-conversation.integration.ts` (+2, Postgres real): o fluxo inteiro com confirmação,
  replay, `recipientMasked`, `confirmed` e sem número em claro; a resposta citando a mensagem do painel entra na
  conversa do cliente e o lido avança pelo provedor.

```
bun --env-file=../../.env.test test ./test/integration/occurrence-client-conversation.integration.ts   11 pass
bun test ./test/occurrence-conversation.contract.test.ts                                               894 pass
```

## T4 — painel (coluna, faixa e aba do Cliente)

Prints dos componentes reais (`ClientConversationPanel`, `ClientConversationStrip`, `ConversationColumn`, CSS e textos do
produto) montados num harness descartável, com o formato de resposta do contrato T1 (`contract.md`). Não passam pela API.

- `prints/t4-coluna-desktop-1400-dark.png` — ≥ 80 rem: terceira coluna à direita.
- `prints/t4-faixa-1100-dark.png` — 64–80 rem: faixa recolhida abaixo das duas colunas, canais à vista.
- `prints/t4-aba-celular-375-light.png` — modo abas e celular: aba "Cliente" com contador.

Gates: `tsc --noEmit`, `bun run test` do frontend (8613 + 1424 passam), eslint e prettier nos arquivos tocados.

A largura da terceira coluna é 80 rem (e não 90, como a primeira versão da spec): o contrato de responsividade só admite
os pontos 40, 64 e 80 rem.

## T5 — responder ao cliente pelo painel

- Campo "Responder por" (números de WhatsApp da faixa, quem respondeu por último primeiro) e mensagem de 1 a 4000
  caracteres; o número nunca vai no corpo, só o `replyTargetId`; `Idempotency-Key` por mensagem escrita, mantida ao
  confirmar o número.
- Primeiro envio a um número pede confirmação do número mascarado (D6); o 409
  `OCCURRENCE_CLIENT_REPLY_CONFIRMATION_REQUIRED` abre o mesmo passo. WhatsApp desligado ou fora do ar
  (`evolution.ready`, 409 `OCCURRENCE_CLIENT_WHATSAPP_OFF`, 503 `WHATSAPP_EVOLUTION_UNAVAILABLE`) desliga o campo e aponta
  o envio por e-mail. Só quem pode enviar ao cliente (`occurrences.resolve`) vê o campo.
- `prints/t5-confirmar-numero-dark.png` — o passo de confirmação do número (componente real em harness descartável).
- Prova: `test/occurrence-conversation/client-reply.contract.ts` (chamada à API, códigos, rascunho, alvos).

Dependência: a rota real vem da T3 (contrato em `contract.md`, PR #398).

## T6 — CLAUDE.md, teste de log e prints (28/10/2026)

**O que mudou**

- `apps/frontend-transportada/CLAUDE.md`: seção "A conversa do cliente abre no chat da ocorrência (spec 283)" com o
  que o painel faz (aba Cliente, campo de resposta só com `occurrences.resolve`, destino mascarado, layout de três colunas,
  log sem dado do cliente).
- `apps/api-transportada/test/occurrence-conversation/client-log-privacy.contract.ts` (ligado em
  `occurrence-conversation.contract.test.ts`): lê as chamadas de log de `src/occurrence-conversation/` e reprova qualquer
  uma que passe `phone`, `email`, `address`, `recipient(s)`, `to`, `destination`, `body` ou `text` cru. Campos mascarados
  (`addressMasked`) passam.

**Provas**

```
bun test ./test/occurrence-conversation/client-log-privacy.contract.ts
 3 pass
 0 fail
```

**Prints (fechados depois, com dados sintéticos)**

- A staging não tinha conta de teste (o Keycloak de staging foi recriado) e o Docker não está disponível aqui, então
  os prints saíram de um build local do painel, com as rotas da API mockadas e dados sintéticos
  (`Mercado Sintético Ltda`, telefone e e-mail já mascarados).
- O login é o `VITE_SMOKE_AUTH_BYPASS` que o build já aceita; nada disso entra no código do app.
- `apps/frontend-transportada/test/spec-283-client-conversation-prints.smoke.spec.ts`: fora do smoke da CI, como os outros prints.
- Arquivos em `/mnt/project-files/previews/conversa-cliente-t6/`:
  - `conversa-cliente-375.png`: a aba Cliente em 375 px, com o canal do WhatsApp (respondeu) e o e-mail (entregue),
    "Responder por" e o composer.
  - `conversa-cliente-desktop-1440.png`: as três colunas em 1440 px; a coluna Cliente à direita.
- Na captura de desktop aparece o aviso "Não foi possível carregar o retorno da contratante": é o mock da rota de
  retorno da contratante, que não entra neste print.
