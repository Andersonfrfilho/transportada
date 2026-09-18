# Spec 158 — Evidências

## Origem

Achado da T9 da spec 156 (`specs/156-o-escritorio-da-baixa-pelo-motorista/evidence.md`, "Achado
fora do escopo"): o aceite 2 da 156 pede a linha do tempo com autoria do início de rota, e nenhuma
leitura da API expõe `trip_stop_events`/`trip_document_events`; o início de rota do motorista nem é
gravado. Decisões do usuário em 2026-09-18: linha do tempo completa (spec nova), tabela
`trip_status_events` (D1) e canal `backoffice` (D2).

## T1

ADR-0068 (`docs/adr/0068-historico-de-status-da-viagem-e-canal-backoffice.md`), escrita com o
inventário de um Explore sobre `origin/staging` e validada pelo `architect` (Opus): **aprovada com
emendas**, todas aplicadas na ADR e na spec antes do commit.

### Inventário

- 14 `update(trips)` em `apps/api-transportada/src/trips/infrastructure/`; **9 pontos em 8 métodos**
  mudam `status`, 5 não. Worker, cron, scripts e triggers não escrevem em `trips`. Todas as escritas
  têm ator humano (tabela na ADR, "Inventário").
- `trip_document_events`: só `drizzle-trip-document.repository.ts:190` e
  `drizzle-trip-document-batch.repository.ts:150` gravam, chamados pela web (`trip.manage`) e pelo
  WhatsApp do operador; o papel de motorista só tem `trip.read`/`trip.report`
  (`authorization.policy.ts:214`) e nunca chega a esses repositórios. Nenhum escritor preenche
  `channel`: toda linha está `driver_app` pelo default.

### Consulta a produção: dispensada

A linha vinda do WhatsApp do operador não se distingue da web (mesmo ator humano, `note` nula, sem
`audit_logs`; só heurística em `meta_whatsapp.messages`, que falha no lote). A saída (b) do D3 é exata
sem número nenhum: em `trip_document_events`, `driver_app` = canal não registrado. Nada foi consultado.

### Emendas do architect (aplicadas)

1. `FOR NO KEY UPDATE` logo antes do `UPDATE trips`, não `FOR UPDATE` no início da transação: evita
   deadlock com o `FOR KEY SHARE` do `insert` em `trip_dispatch_snapshots` e mantém a ordem notas →
   viagem. Nos `recalculateTripStatus`, a trava vem antes da leitura do tally.
2. Os ports recebem `actorUserId`, `channel` e `onBehalfOfDriverId` (hoje sem ator: `close`,
   `cancelTrip`, `PlanTripRouteInput`/`TripRoutePlanner`, `markTripInTransit`,
   `completeTripIfSettled`).
3. Sem FK de membership do ator: com `ON DELETE RESTRICT`, `removeMembership` falharia para quem já
   mexeu numa viagem, depois de já ter desvinculado o WhatsApp e desabilitado o Keycloak.
4. `from_status NOT NULL` (sem evento de criação); `recorded_at NOT NULL DEFAULT now()`.
5. Rollback recusa com qualquer linha em `trip_status_events` ou qualquer `backoffice`.
6. Contagens corrigidas; `whatsapp` passa a cobrir o operador e a frase traz o nome do ator.
7. Transição ilegal registrável e `close` `cancelled → completed` → T11; `updated_at` do start-route
   registrado.
8. Spec: D1, D3, D6 (critério de `recordedAt`: `office` e > 60 s), D7, D8 (ordem), casos extremos,
   T5, T7, T11 e prompt de execução emendados.

### Spec 156

`specs/156-o-escritorio-da-baixa-pelo-motorista/evidence.md` ganhou a nota de que o aceite 2 fecha
por esta spec.
