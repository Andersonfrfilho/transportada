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

## T4 — painel (coluna, faixa e aba do Cliente)

Prints dos componentes reais (`ClientConversationPanel`, `ClientConversationStrip`, `ConversationColumn`, CSS e textos do
produto) montados num harness descartável, com o formato de resposta do contrato T1 (`contract.md`). Não passam pela API.

- `prints/t4-coluna-desktop-1400-dark.png` — ≥ 80 rem: terceira coluna à direita.
- `prints/t4-faixa-1100-dark.png` — 64–80 rem: faixa recolhida abaixo das duas colunas, canais à vista.
- `prints/t4-aba-celular-375-light.png` — modo abas e celular: aba "Cliente" com contador.

Gates: `tsc --noEmit`, `bun run test` do frontend (8613 + 1424 passam), eslint e prettier nos arquivos tocados.

A largura da terceira coluna é 80 rem (e não 90, como a primeira versão da spec): o contrato de responsividade só admite
os pontos 40, 64 e 80 rem.
