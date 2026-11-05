# Tasks — spec 297

Uma task por vez. Teste de contrato **antes** da implementação. Arquivo de teste novo entra na lista
literal do `package.json` da app, ou não roda.

⛔ **Não liberado para implementar.** Espera as respostas das dúvidas 1–7 do `spec.md`. As fases
abaixo são o desenho provisório e podem mudar com elas.

## Fase 0 — Sondar o que existe

> 🤖 Modelo: `sonnet` — leitura e registro em `evidence.md`; nada de código

- [ ] **T0.1** 🧠 Mapear onde "parada" é assumida como entrega: `trip-allowed-actions`, `trip-close`,
      `trip-occupancy`, `cargo-layout-*`, `/me/trips/current`, app do motorista, relatório da viagem.
- [ ] **T0.2** Verificar como o app antigo do motorista reage a uma parada de tipo desconhecido.
- [ ] **T0.3** Confirmar com Anderson o que `pickup_indicator` do CT-e significa para ele.

## Fase 1 — Modelo de dados e regra pura

> 🤖 Modelo: `opus` (T1.1 🧠), depois `sonnet`

- [ ] **T1.1** 🧠 `trip-pickup.policy.ts` (puro): precedência coleta→entrega, estados do item,
      ocupação por trecho, regra de encerramento. Contratos antes.
- [ ] **T1.2** Migration aditiva: `trip_stops.kind`, `trip_documents.pickup_stop_id`,
      `trip_pickup_items`; `rollback.sql`; contrato de isolamento de tenant.
- [ ] **T1.3** Schema Drizzle + `CHECK`s + índices.

## Fase 2 — API do escritório

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Adicionar/remover parada de coleta e itens esperados (rotas, permissão `fleet.manage`).
- [ ] **T2.2** Validação de precedência no plano e na reordenação; erro com a coleta faltante.
- [ ] **T2.3** `allowed-actions` e `trip-close` conhecendo coleta; evento de mudança.

## Fase 3 — Campo (app e API do motorista)

> 🤖 Modelo: `sonnet`

- [ ] **T3.1** `pickup_completed` em `trip_stop_events` com carimbo de local; conferência de volumes.
- [ ] **T3.2** Tela de coleta no app do motorista; compatibilidade com app antigo (T0.2).
- [ ] **T3.3** Ocorrência de coleta: `flow: pickup` no catálogo, coluna de efeito na carga, semeadura
      dos tipos iniciais, registro no app e no WhatsApp; contrato antes.
- [ ] **T3.4** Caso de ocorrência de coleta no escritório: reagendar, cancelar, seguir sem a carga.

## Fase 4 — Painel do escritório

> 🤖 Modelo: `sonnet`

- [ ] **T4.1** Roteiro com selo "Coleta", formulário de coleta, esperado × coletado.
- [ ] **T4.2** Ocupação do baú por trecho e aviso de pico.

## Fase 5 — Rota e WhatsApp

> 🤖 Modelo: `opus` (T5.1 🧠), depois `sonnet`

- [ ] **T5.1** 🧠 Restrição de precedência (par coleta→entrega) no solver do worker + contrato de
      paridade API ↔ worker.
- [ ] **T5.2** "Coletei" no grupo do WhatsApp (specs 292/293) e notificação "carga coletada" (286).

## Fase 6 — Documentação viva

> 🤖 Modelo: `haiku`

- [ ] **T6.1** Atualizar `CLAUDE.md` da API, do painel e do app do motorista; ADR curta da decisão
      "coleta é um tipo de parada".
