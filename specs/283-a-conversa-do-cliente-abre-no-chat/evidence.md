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

**Pendente**

- Prints em 375 px e desktop: a API da conversa do cliente ainda não está na staging (#398 e #400 abertas). Os prints
  saem quando ela estiver na staging, ou com dados locais se o deploy seguir travado.
