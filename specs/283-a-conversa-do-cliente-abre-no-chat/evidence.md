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
