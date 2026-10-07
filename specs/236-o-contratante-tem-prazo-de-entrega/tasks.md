# Tarefas — 236

> Sem dúvidas abertas. A 237 Fase 2 (perfil e chegada) **já está publicada**; o que falta é a **238 T1.4**
> (calendário publicado para o `loadRules`/rotas). T1.2–T1.4 dependem da 238 T1.2/T1.3 publicadas.

## Fase 1 — API: política e leitura

> 🤖 Modelo: `sonnet` (T1.1 é 🧠 — validar com `opus` antes)

- [x] **T1.1** 🧠 `delivery-deadline.policy.ts` (+ borda `delivery-deadline-input.service.ts`): contrato em
      tabela **antes** (CA1), vermelho pelo motivo certo, depois a política; mutação (CA4). Evidência em
      `evidence.md` § T1.1.
- [x] **T1.2** Leitura por nota no detalhe da viagem (`deliveryDeadline`); depende da 238 T1.2/T1.3 publicadas.
      Evidência em `evidence.md` § T1.2.
      Quatro partes, nesta ordem:
  - [x] **T1.2a** `loadRules` em série: extrair as quatro leituras para `business-calendar-rules.query.ts` com o
        executor (`loadBusinessCalendarRules(executor, params)`) e incluir no contrato
        `test/transaction-serial-queries.contract.test.ts`.
  - [x] **T1.2b** Guarda tolerante do campo novo no painel, **publicada antes da API** (cliente antigo ignora
        o campo; cliente novo aceita ausente).
  - [x] **T1.2c** Leitura em `drizzle-trip.repository.ts` ~1307–1383: join de `cargo_arrival_documents` /
        `cargo_arrivals` pelo `nfe_document_id`; cidade do destino físico do `stopAddresses`
        (`listStopAddresses` ~1529) com o desvio manual por cima (uma consulta `selectDistinctOn
trip_document_id` em `delivery_address_overrides`); entrega (`selectDistinctOn` em `trip_stop_events`
        `kind = 'delivered'` com `deliveredMomentSql`); calendário **uma vez por viagem**. Contrato de contagem
        de consultas: **+0** sem chegada, **exatamente +6** com candidatas (1 ou 200 notas, 1 ou 40 cidades).
        `BusinessCalendarError` vira `not_applicable` com `warn` só com ids. Campo só no
        `TripDocumentDetail`, nunca no `TripDocument`.
  - [x] **T1.2d** Integração contra Postgres (CA2) e contrato de contagem de consultas (CA5).
  - [x] **T1.2e** Correções da revisão `opus` da Fase 1: entrega só pelo evento (sem o plano B de
        `trip_documents.delivered_at`), cobertura sem o ano de hoje quando nada está pendente, constantes únicas
        (§16), `toCivilDate` com formatador guardado, as cinco leituras novas no contrato de consultas em série,
        lacunas de teste (dois contratantes, prazo copiado nulo, desvio mais recente, painel), `warn` coalescido
        (1 por viagem e código a cada 5 min). Evidência em `evidence.md` § T1.2e.
- [x] **T1.3** Não-regressão (CA6): `computeDriverScore`, `missingAfterHours` e CT-e intactos. O contrato estático de isolamento já existe (T1.1); a prova de comportamento sobre a leitura nova é `test/integration/delivery-deadline-driver-independence.integration.ts` (mesma nota entregue tarde com e sem prazo: mesma nota, pontualidade e foto ausente). Números em `evidence.md` § T1.3.
- [ ] **T1.4** (depende da 238 T1.2/T1.3 publicadas) Revisão final da fase com `code-reviewer` em `opus` (passada separada); publicar em staging
      só com tudo verde (fetch + rebase limpo + `bun install --frozen-lockfile` + typecheck) e **confirmar o
      deploy** antes da Fase 2.
      ⚠️ **Regra de promoção para produção:** a 236 só sobe **junto com, ou depois de,** as migrations da 237
      Fase 2 e da 238 — a consulta das notas lê `cargo_arrivals`/`cargo_arrival_documents` e as tabelas do
      calendário mesmo quando o relógio não está ligado, e `origin/main` não as tem: uma promoção por
      cherry-pick sozinha derruba todo `GET /trips/:id` com 500. O `preDeployCommand` precisa ter rodado as
      migrations **antes** da API nova receber tráfego.
      **Lacunas conhecidas (decisões, não esquecimentos):** (1) nota vinculada por cálculo de frete
      (`trip_documents.nfe_document_id` nulo) nunca recebe prazo — o prazo nasce da chegada, que é por NF-e;
      (2) uma regra de calendário ruim derruba o prazo de **todas** as cidades da viagem, não só a da regra
      (o calendário é construído com as regras de todas as cidades para manter a guarda `TOO_MANY_RULES`); sai
      `null` com `warn`, e o detalhe nunca cai.

## Fase 2 — Painel: selo e filtro

> 🤖 Modelo: `sonnet`

- [x] **T2.1** Contrato **antes**: o selo (estados, textos pt-BR/en) e o filtro "vencidas/vencem hoje". Evidência em `evidence.md` § Fase 2.
- [x] **T2.2** Selo na nota da viagem e filtro na lista, no padrão dos selos existentes; smoke Playwright (fora da CI, `spec-236-prazo-prints.smoke.spec.ts`). Filtro **no cliente, na lista de notas do detalhe** (decisão do architect); filtro na lista de viagens fica **adiado** (decisão aberta com o usuário).
- [x] **T2.3** Prova por mutação e evidência em `evidence.md`.
- [ ] **T2.4** **Revisão de design e usabilidade** (web.md §15): vizinhos, contraste nos dois temas,
      375/768/1280 px, **print enviado ao usuário e aprovado antes de publicar**.
- [ ] **T2.5** Publicar em staging depois do print aprovado e confirmar o deploy.
