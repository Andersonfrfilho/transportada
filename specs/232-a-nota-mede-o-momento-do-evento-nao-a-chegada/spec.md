# Spec 232 — A nota mede o momento do evento, não a chegada

## Problema

Decisão do usuário (03/10/2026): **a rede não é culpa do motorista; o que importa é o momento em que o
evento foi criado, não o momento em que chegou ao servidor.** Hoje isso vale só pela metade.

Medido no código de `origin/staging`:

1. **O corpo de `arrive`/`deliver`/`return` não carrega a hora do toque.** Só `location`, e a hora dela
   (`location.capturedAt`) é a da _leitura do GPS_ (`me-trip.schema.ts:23-30`). A hora do toque só
   viaja em `depart`/`cancel-departure` (`tappedAt`, spec 206 D3).
2. **Sem GPS, o servidor grava a hora de chegada.** O momento da entrega é `captured_at ?? recorded_at`
   (`drizzle-driver-score.repository.ts:330`; o mesmo padrão em 7 consultas). Entrega tocada às 10:00 sem
   sinal e sem posição, recebida às 14:00, vira "entregue às 14:00".
3. **A foto é julgada contra o recebimento.** `resolveTimeReference` só confia no relógio do aparelho
   até `recebimento − 24 h` (`delivery-proof-punctuality.policy.ts`, spec 159 T11 D3a). Foto tirada na
   hora e recebida mais de ~25 h depois da entrega vira `late` — a nota do motorista cai por falta de
   sinal.
4. **A foto "ausente" também.** Passadas 24 h da entrega sem foto no servidor, o motorista leva a
   penalidade de ausente até ela chegar (`driver-score.policy.ts:101`); chegando, a nota é recalculada.

## Decisões

- **D1 — O app mede o desvio do relógio.** A cada resposta bem-sucedida da API ele calcula
  `desvio = hora do servidor (cabeçalho Date) − hora do aparelho (ponto médio do pedido)` e guarda o
  mais recente. Só desvio medido vale; sem nenhum, o campo vai ausente.
- **D2 — Todo evento e toda foto nascem com a hora do toque e o desvio daquele instante.** O item da
  fila já guarda `createdAt` (e o anexo, `capturedAt`); passam a guardar também `clockOffsetMs`. No envio
  o corpo leva `tappedAt` (a hora do aparelho no toque) e `clockOffsetMs`.
- **D3 — O servidor corrige e usa a hora do evento.** `occurredAt = tappedAt + clockOffsetMs`.
  **Nenhum evento é recusado por causa do relógio**: hora corrigida no futuro (além de 2 min do
  recebimento) ou mais velha que 30 dias antes do recebimento tem a **correção descartada**, e o evento
  segue com a regra de hoje (`captured_at ?? recorded_at`). Recusar viraria um `422` que o app trata como
  "recusado de negócio" — o motorista poderia descartar a entrega por um problema de relógio. Gravada ao lado do que já existe
  (coluna nova `trip_stop_events.clock_offset_ms`; `tapped_at` segue sendo a hora crua do aparelho, spec
  206). O momento da entrega passa a ser `occurredAt ?? captured_at ?? recorded_at` — **só nas
  consultas da nota e da pontualidade** (as outras seis seguem como estão; ver "Fora de escopo").
  **A hora corrigida do evento também só vale com posição no relato** (D4b): relato sem posição não grava
  `occurred_at` nem `clock_offset_ms`, e a leitura cai em `captured_at ?? recorded_at`, como hoje.
- **D4 — A foto é julgada pela hora corrigida, quando há prova de lugar.** Havendo `clockOffsetMs`
  **e** posição na entrega, o piso de `recebimento − 24 h` não se aplica: a foto vale pela hora em que
  foi tirada, mesmo chegando dias depois (decisão do usuário: o 3G fraco que deixa passar o JSON e
  trava a foto de 1 MB não é culpa do motorista). A flag é `kind === 'corrected'` do `resolveOccurredAt`
  — **nunca** "veio o campo": uma correção descartada (futuro, velha demais) mantém o piso. Sem o campo
  (cliente antigo), nada muda.
- **D4b — Sem posição na entrega, o relógio não vale.** Entrega registrada sem posição (GPS desligado)
  com o app alegando relógio corrigido: a correção é ignorada, a foto é julgada pelo **horário de envio**
  (recebimento) e a entrega conta como "longe" (uma penalidade por entrega, a mesma de sempre). Decisão
  do usuário: "tira ponto pelo GPS desligado e considera o horário que enviou". Fecha o furo de forjar
  `clockOffsetMs: 0` numa entrega sem prova de lugar.
- **D5 — O prazo de "ausente" conta da chegada da entrega.** `horas desde a entrega` passa a ser contada a
  partir de `max(momento da entrega, quando o servidor recebeu a entrega)`: se a própria entrega chegou
  tarde, o motorista estava sem sinal, e a foto vem logo atrás dela na mesma drenagem.
- **D6 — Compatível para trás.** Os campos são opcionais; cliente antigo segue valendo com a regra de
  hoje. Os esquemas do servidor são `.strict()`, então **o servidor sobe antes do app**: app novo contra
  servidor velho receberia `400` em todo relato.

## O que esta decisão NÃO protege (limite honesto)

Medir o desvio corrige o relógio **errado**; não impede adulterar o relógio **depois** do último contato,
e o campo `clockOffsetMs` também pode ser **forjado** no corpo (o PWA se forja pelo devtools: basta mandar
`0`). O que sobra contra isso: a hora corrigida nunca pode ser futura (+2 min) nem ter mais de 30 dias; a
foto precisa estar no raio da entrega **e** a entrega precisa ter posição (D4b); e o cliente que não manda
o desvio segue com o piso antigo. Duas consequências aceitas pelo usuário: a penalidade de "foto ausente"
passa a ser temporária e reversível (a foto que chega fora do prazo, com prova de lugar, vira pontual), e
sai o incentivo de mandar a foto no prazo. Achado fora do escopo, a registrar em `SECURITY.md`: o
`location.capturedAt` da entrega não tem limite — uma posição com 100 dias tira a entrega da janela de 90
dias da nota. Fica registrado em `SECURITY.md`.

## Fora de escopo

- As outras seis consultas que leem `captured_at ?? recorded_at` (listagens, relatórios, ordenação do
  escritório): seguem com a hora de hoje até serem pedidas. Mudar o "momento da entrega" em todo o
  produto é uma decisão maior (CT-e, MDF-e, SLA).
- Ocorrência de nota e `proof/receiver` NÃO ganham os campos; só arrive/deliver/return, ocorrência de
  parada e o multipart do comprovante (os esquemas são `.strict()`).
- Desvio medido por NTP/serviço de hora externo: o cabeçalho `Date` da própria API basta e não adiciona
  dependência.

## Critérios de aceite

- **CA1** Foto tirada na hora da entrega e recebida 30 h depois, com `clockOffsetMs`, é `on_time`.
- **CA2** A mesma foto sem `clockOffsetMs` (cliente antigo) continua `late`.
- **CA3** Entrega tocada às 10:00 **com posição** e recebida às 14:00, com `tappedAt`/`clockOffsetMs`, é
  gravada e lida como entregue às 10:00; **sem posição** (GPS desligado) vale o horário de envio (D4b).
- **CA4** A penalidade de "ausente" só começa 24 h depois de o servidor receber a entrega.
- **CA6** Entrega sem posição, com o app alegando relógio corrigido: a foto é julgada pelo horário de
  envio e a entrega conta como "longe".
- **CA5** Hora corrigida no futuro (ou velha demais) tem a correção descartada, sem recusar o evento; app
  e servidor antigos seguem funcionando juntos.
