# Evidências — spec 289

- Contratos: `bun test ./test/whatsapp.contract.test.ts ./test/database-migration.contract.test.ts` na API (331 pass, 0 fail) e
  `bun test ./test/whatsapp-send-pacer.contract.test.ts` no worker (5 pass).
- `tsc --noEmit` limpo na API e no worker.
- Reserva atômica, Postgres 16 descartável, 4 reservas concorrentes seguidas de uma quinta: vagas a 0 s, 15 s, 30 s, 45 s e 60 s
  de distância, sem repetição.
- Não medido: envio real pelo Evolution (depende do chip reserva de Anderson).
