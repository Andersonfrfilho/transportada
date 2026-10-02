# Plan — spec 232

Duas apps e uma migration aditiva. **Ordem de publicação: API primeiro, app depois** (D6).

## API (`apps/api-transportada`)

- Migration aditiva `trip_stop_events.clock_offset_ms integer null` (+ `rollback.sql`; `make
migration-test`). Nada destrutivo.
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

## Riscos

- **Esquema `.strict()` + deploy fora de ordem:** app novo contra API velha dá `400` em todo relato. Por
  isso as fases são separadas e a fase do app só começa depois de a API estar no ar (conferir o deploy).
- **Muda a nota de verdade:** a regra de pontualidade e de "ausente" muda para quem manda o desvio. A
  política é pura e coberta por contrato; a leitura da nota exige o Postgres de integração.
- **Limite antifraude** descrito na spec.
