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
- **D4 — A foto é julgada pela hora corrigida.** Havendo `clockOffsetMs`, o piso de `recebimento − 24 h`
  não se aplica: a foto vale pela hora em que foi tirada. Sem o campo (cliente antigo), o piso continua —
  nada muda para quem não manda.
- **D5 — O prazo de "ausente" conta da chegada da entrega.** `horas desde a entrega` passa a ser contada a
  partir de `max(momento da entrega, quando o servidor recebeu a entrega)`: se a própria entrega chegou
  tarde, o motorista estava sem sinal, e a foto vem logo atrás dela na mesma drenagem.
- **D6 — Compatível para trás.** Os campos são opcionais; cliente antigo segue valendo com a regra de
  hoje. Os esquemas do servidor são `.strict()`, então **o servidor sobe antes do app**: app novo contra
  servidor velho receberia `400` em todo relato.

## O que esta decisão NÃO protege (limite honesto)

Medir o desvio corrige o relógio **errado** (aparelho com hora trocada antes do último contato com o
servidor) e é uma prova melhor que "confiar sempre". Não impede adulterar o relógio **depois** do último
contato, offline: aí a hora corrigida é só a hora adulterada. O que continua valendo contra isso: a foto
precisa estar no local da entrega (`away`), a hora corrigida nunca pode ser futura nem anterior à
entrega, e o piso antigo segue para o cliente que não manda o desvio. Fica registrado em `SECURITY.md`.

## Fora de escopo

- As outras seis consultas que leem `captured_at ?? recorded_at` (listagens, relatórios, ordenação do
  escritório): seguem com a hora de hoje até serem pedidas. Mudar o "momento da entrega" em todo o
  produto é uma decisão maior (CT-e, MDF-e, SLA).
- Ocorrência e `proof/receiver` ganham os campos no corpo, mas só a entrega e a foto os usam nesta spec.
- Desvio medido por NTP/serviço de hora externo: o cabeçalho `Date` da própria API basta e não adiciona
  dependência.

## Critérios de aceite

- **CA1** Foto tirada na hora da entrega e recebida 30 h depois, com `clockOffsetMs`, é `on_time`.
- **CA2** A mesma foto sem `clockOffsetMs` (cliente antigo) continua `late`.
- **CA3** Entrega tocada às 10:00 sem posição e recebida às 14:00, com `tappedAt`/`clockOffsetMs`, é
  gravada como entregue às 10:00 (corrigida).
- **CA4** A penalidade de "ausente" só começa 24 h depois de o servidor receber a entrega.
- **CA5** Hora corrigida no futuro (ou velha demais) tem a correção descartada, sem recusar o evento; app
  e servidor antigos seguem funcionando juntos.
