# Tarefas — 236

> Sem dúvidas abertas. A 237 Fase 2 (perfil e chegada) **já está publicada**; o que falta é a **238 T1.4**
> (calendário publicado para o `loadRules`/rotas). T1.2–T1.4 dependem da 238 T1.2/T1.3 publicadas.

## Fase 1 — API: política e leitura

> 🤖 Modelo: `sonnet` (T1.1 é 🧠 — validar com `opus` antes)

- [x] **T1.1** 🧠 `delivery-deadline.policy.ts` (+ borda `delivery-deadline-input.service.ts`): contrato em
      tabela **antes** (CA1), vermelho pelo motivo certo, depois a política; mutação (CA4). Evidência em
      `evidence.md` § T1.1.
- [ ] **T1.2** Leitura por nota no detalhe da viagem (`deliveryDeadline`); depende da 238 T1.2/T1.3 publicadas.
      Quatro partes, nesta ordem:
  - [ ] **T1.2a** `loadRules` em série: extrair as quatro leituras para `business-calendar-rules.query.ts` com o
        executor (`loadBusinessCalendarRules(executor, params)`) e incluir no contrato
        `test/transaction-serial-queries.contract.test.ts`.
  - [ ] **T1.2b** Guarda tolerante do campo novo no painel, **publicada antes da API** (cliente antigo ignora
        o campo; cliente novo aceita ausente).
  - [ ] **T1.2c** Leitura em `drizzle-trip.repository.ts` ~1307–1383: join de `cargo_arrival_documents` /
        `cargo_arrivals` pelo `nfe_document_id`; cidade do destino físico do `stopAddresses`
        (`listStopAddresses` ~1529) com o desvio manual por cima (uma consulta `selectDistinctOn
trip_document_id` em `delivery_address_overrides`); entrega (`selectDistinctOn` em `trip_stop_events`
        `kind = 'delivered'` com `deliveredMomentSql`); calendário **uma vez por viagem**. Contrato de contagem
        de consultas: **+0** sem chegada, **exatamente +6** com candidatas (1 ou 200 notas, 1 ou 40 cidades).
        `BusinessCalendarError` vira `not_applicable` com `warn` só com ids. Campo só no
        `TripDocumentDetail`, nunca no `TripDocument`.
  - [ ] **T1.2d** Integração contra Postgres (CA2) e contrato de contagem de consultas (CA5).
- [ ] **T1.3** Não-regressão (CA6): `computeDriverScore`, `missingAfterHours` e CT-e intactos. O contrato estático de isolamento já existe (T1.1); falta a prova de comportamento sobre a leitura nova. Depende da 238 T1.2/T1.3 publicadas.
- [ ] **T1.4** (depende da 238 T1.2/T1.3 publicadas) Revisão final da fase com `code-reviewer` em `opus` (passada separada); publicar em staging
      só com tudo verde (fetch + rebase limpo + `bun install --frozen-lockfile` + typecheck) e **confirmar o
      deploy** antes da Fase 2.

## Fase 2 — Painel: selo e filtro

> 🤖 Modelo: `sonnet`

- [ ] **T2.1** Contrato **antes**: o selo (estados, textos pt-BR/en) e o filtro "vencidas/vencem hoje".
- [ ] **T2.2** Selo na nota da viagem e filtro na lista, no padrão dos selos existentes; smoke Playwright.
- [ ] **T2.3** Prova por mutação e evidência em `evidence.md`.
- [ ] **T2.4** **Revisão de design e usabilidade** (web.md §15): vizinhos, contraste nos dois temas,
      375/768/1280 px, **print enviado ao usuário e aprovado antes de publicar**.
- [ ] **T2.5** Publicar em staging depois do print aprovado e confirmar o deploy.
