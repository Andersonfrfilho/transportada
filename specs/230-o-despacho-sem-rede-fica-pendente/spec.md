# Spec 230 — O despacho sem rede fica pendente

## Problema

Despachar a viagem ("Despachar viagem") era a única escrita do motorista que **não** passava pela
fila: chamada direta, só com rede. Sem sinal o toque falhava com um alerta e a viagem seguia
`route_planned`, com todas as ações de campo trancadas (a API recusa escritas fora de
`dispatched`/`in_transit`). O motorista que sai da garagem sem sinal ficava parado.

Decisão do usuário (03/10/2026): **"despachar precisa enviar, mas se não tiver rede, deixe como
pendência de envio, e quando identificar rede envia automaticamente ou manualmente."**

Na spec 226 eu havia recomendado não enfileirar o despacho (o motorista sairia achando que despachou
enquanto o escritório ainda vê a viagem parada). O usuário decidiu o contrário; esta spec responde ao
risco com o aviso explícito de que o despacho **ainda não chegou ao servidor** (D2).

## Decisões

- **D1 — O despacho é um item da fila.** Novo tipo `dispatch` (`{ idempotencyKey, kind, tripId }`),
  `POST /me/trips/current/dispatch` com `{ tripId }`. Sobe sozinho quando o sinal volta (as mesmas
  gatilhos de drenagem) ou por "Enviar agora" / "Enviar todos agora". Servidor fora do ar espera
  (spec 226); recusa de negócio (409, 403) é rejeitada. O servidor já trata o despacho repetido como
  `unchanged` (ADR-0058 §2), então reenviar é seguro. A chamada direta (`dispatchTrip`) sai.
- **D2 — A tela diz que está pendente.** Com o despacho na fila o botão some e entra: "Início da viagem
  aguardando envio — sobe quando o sinal voltar. Você já pode registrar as paradas." O selo e o banner
  de "aguardando envio" também contam.
- **D3 — O despacho na fila destrava as ações de campo.** A fila é em ordem: o despacho sobe antes de
  tudo que o motorista registrar depois dele. Sem isso o despacho pendente não serviria para nada —
  o motorista continuaria parado sem sinal. O risco (despacho recusado, e o que veio depois também)
  fica visível: cada item é recusado com a causa na tela de pendências.
- **D4 — Recusado volta ao botão.** Despacho `rejected` não conta como "na fila": o botão "Despachar
  viagem" reaparece, as ações de campo trancam de novo e o alerta "Não foi possível iniciar o trajeto"
  aparece.
- **D5 — Sem posição.** Como antes, o despacho não leva posição; a spec 196 trata disso.

## Fora de escopo

- Legado `/minha-viagem`: segue com o despacho direto (está em extinção).
- Se o despacho pendente for recusado e houver itens de campo atrás dele, eles serão recusados um a
  um pelo servidor; não há "cancelamento em cascata".
- Um relâmpago do botão "Despachar viagem" entre o item sair da fila e o snapshot novo chegar. O
  despacho repetido é `unchanged` no servidor, então tocar nele é inofensivo.

## Critérios de aceite

- **CA1** Sem sinal, "Despachar viagem" deixa um item "Iniciar viagem" na fila, com o aviso na tela, e
  as ações de campo liberam.
- **CA2** Com o sinal de volta o despacho sobe antes do que veio depois, e o aviso some.
- **CA3** Com sinal o despacho sobe na hora e o botão some.
- **CA4** Despacho recusado (409) mostra o alerta e devolve o botão.
