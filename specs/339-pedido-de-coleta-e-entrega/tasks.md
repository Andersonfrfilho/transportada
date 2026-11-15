# Tasks — 339 Pedido de coleta e entrega

Regra: teste de aceite antes da implementação; task só fecha com evidência em `evidence.md`.

- [ ] **T0 — Investigar** `trip_stops` (há `kind` de coleta?), rota de parada manual, `contractor_portal`, padrão da 150
      (pedido → decisão) e modelos de e-mail; registrar achados e fechar as 3 dúvidas com o Anderson.
- [ ] **T1 — Banco**: `pickup_requests` (+ eventos de decisão), migration aditiva com rollback guardado, snapshot, linha em
      `deploy/staging-refresh/prune-source.sql`.
- [ ] **T2 — Domínio/API**: política de estados, criar/cancelar pelo portal, aceitar/recusar pelo painel, permissão
      `pickup.manage`, contratos (CA01–CA03, isolamento).
- [ ] **T3 — Cadastro do cliente na aceitação** (D4), com contrato de idempotência por documento.
- [ ] **T4 — Notificações** (D6): chaves de modelo, script de publicação, outbox, reenvio.
- [ ] **T5 — Portal do cliente**: formulário, lista e detalhe do pedido (i18n, claro/escuro, mobile).
- [ ] **T6 — Painel**: fila de pedidos, decisão, sugestão de viagem na aceitação (existente ou nova) com confirmação (CA04).
- [ ] **T7 — Pedido anônimo** (depende da 338): captcha, confirmação de contato, rate limit.
- [ ] **T8 — Prints, evidence.md, runbook e publicação em staging** (migration → API → painel → portal).
