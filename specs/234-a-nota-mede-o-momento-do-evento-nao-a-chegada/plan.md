# Plan — spec 234

Duas apps e uma migration aditiva. **Ordem de publicação: API primeiro, app depois** (D6).

## API (`apps/api-transportada`)

- Migration aditiva `trip_stop_events.clock_offset_ms bigint null` (+ `occurred_at`,
  `trip_delivery_proofs.clock_offset_ms`, `rollback.sql`; `make migration-test`). `bigint` porque
  `integer` estoura em ±24,8 dias. Nada destrutivo.
- `me-trip.schema.ts`: `tappedAt` e `clockOffsetMs` opcionais em `arrive`/`deliver`/`return`/ocorrência;
  `clockOffsetMs` opcional no multipart do comprovante. Hora no futuro (+2 min) ou com mais de 30 dias descarta a
  correção; nunca recusa o evento.
- Função pura `resolveOccurredAt({ tappedAt, clockOffsetMs, receivedAt })` na camada de domínio.
- `delivery-proof-punctuality.policy.ts`: `resolveTimeReference` usa a hora corrigida sem o piso de 24 h
  quando há `clockOffsetMs`; o piso fica para quem não manda (D4).
- `driver-score.policy.ts`: o prazo de "ausente" conta de `max(entrega, recebimento da entrega)` (D5).
- Leitura do momento da entrega (nota e pontualidade): `occurred_at ?? captured_at ?? recorded_at` (D3).

## App do motorista (`apps/frontend-driver`) e legado

- `clockOffset.service.ts`: mede e guarda o desvio (D1), a partir do cabeçalho `Date` das respostas do
  `request()` do cliente.
- Fila: `QueuedReport.clockOffsetMs` e `QueuedAttachment.clockOffsetMs`, gravados na criação (D2).
- `reportBody` e o multipart do anexo mandam `tappedAt` e `clockOffsetMs`.
- O legado `/minha-viagem` fica de fora: está em extinção.
- **Só nas rotas que aceitam (T1.4):** o app manda `tappedAt`/`clockOffsetMs` em `arrive`, `deliver`,
  `return`, na ocorrência **de parada** e no multipart do comprovante (`clockOffsetMs`). **Não** manda em
  `dispatch`, `depart`/`cancel-departure` (já têm `tappedAt`, sem desvio), na ocorrência de **nota**
  (`/documents/:id/occurrences`), nos uploads de ocorrência nem em `proof/receiver`: os esquemas são
  `.strict()` e dariam `400`.

## Como a flag nasce (caso de uso)

`hasCorrectedClock = resolveOccurredAt({ tappedAt: upload.capturedAt, clockOffsetMs,
receivedAt: now }).kind === 'corrected' && (sem posição na entrega || evento de entrega corrigido)`
(R1: com posição, a foto só vale corrigida se `occurred_at` do evento existe, senão `deliveredAt` é hora
crua), e o `capturedAt` passado à classificação é o corrigido. Nunca "`clockOffsetMs` presente".
A política decide o resto da posição (`classifyProofPunctuality`,
D4b — sem posição na entrega, a flag é ignorada, vale o recebimento e a entrega conta como longe). Canal
`office` não participa. `deliveryReceivedAt` do prazo de "ausente" é
`trip_stop_events.recorded_at`, que o repositório da nota já seleciona — ligação sem migration (T1.3).

## Riscos da T1.5 (migration e leitura do momento da entrega) — do architect

1. `occurredAt` da porta `recordEvent` já significa "sobrescrever `created_at`" (escritório): usar campo novo.
2. Gravar a **decisão**, não só o desvio: correção descartada pelo `resolveOccurredAt` não pode voltar a valer
   na leitura em SQL — gravar `clock_offset_ms` só quando `corrected`, ou uma coluna `occurred_at`.
3. Índice: o filtro da janela usa `coalesce(captured_at, recorded_at)` com índice de expressão; trocar a
   expressão perde o índice — índice novo, aditivo, conferido com `EXPLAIN`.
4. Uma só expressão para o momento da entrega nos quatro lugares da nota e da pontualidade, mais
   `listPendingProofs`, para a nota e a lista não discordarem na fronteira.
5. Auditoria: gravar o desvio também em `trip_delivery_proofs` para reproduzir o veredito.
6. Sem retroatividade: vereditos já gravados não são recalculados.
7. Migration: coluna nula, sem backfill, `snapshot.json`, `rollback.sql`, `make migration-test`.

## Pendência (revisão da Fase 1)

- O índice antigo `trip_stop_events_company_delivered_at_idx` (`coalesce(captured_at, recorded_at)`)
  fica só para o ROLLBACK: a API velha precisa dele. Dropar numa migration futura, depois de a API
  estabilizar. O único uso restante de `captured_at ?? recorded_at` é a leitura de `arrived` do
  relatório de campo (`drizzle-driver-field-report.repository.ts`), que o índice parcial de `delivered`
  não atende.

## Riscos

- **Esquema `.strict()` + deploy fora de ordem:** app novo contra API velha dá `400` em todo relato. Por
  isso as fases são separadas e a fase do app só começa depois de a API estar no ar (conferir o deploy).
- **Muda a nota de verdade:** a regra de pontualidade e de "ausente" muda para quem manda o desvio. A
  política é pura e coberta por contrato; a leitura da nota exige o Postgres de integração.
- **Limite antifraude** descrito na spec.
