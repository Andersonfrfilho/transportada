# Tasks — spec 289

- [x] T1 Contrato do pacer (vaga passada, sem configuração, vaga futura, além do limite, limite exato) — API e worker.
- [x] T2 Gateway do Evolution (API e worker) espera o pacer antes de enviar; vaga recusada vira `failed` sem chamar o provedor.
- [x] T3 Migration `next_send_at` + padrão do teto 300 + rollback; tela com 300 de padrão.
- [x] T4 Reserva atômica medida em Postgres 16 com 4 reservas concorrentes.
