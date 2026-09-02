# Tasks — 073 A entrega tem endereço próprio

Uma task por vez. Teste de contrato **antes** da implementação. Task só fecha com evidência em
`evidence.md`.

---

## Fase 0 — Medir antes de decidir

> 🤖 Modelo: `haiku` (T002 é 🧠)

- [x] **T001** — Contar, em produção, quantas notas têm participante `delivery` e em quantas a
      chave diverge da do `recipient`. **Feito em 2026-09-01: 1628 notas, zero `delivery`.** O
      papel está no importador desde 2026-07-28, antes de todas elas — zero é ausência de
      `<entrega>` nas notas, não código faltando. Números e método em `evidence.md`.

- [x] **T002** — 🧠 Provar o caminho de escrita: teste de integração do importador com uma NF-e
      que traz `<entrega>`, afirmando que a linha `role = 'delivery'` e o endereço dela chegam a
      `nfe_participants` e `nfe_addresses`. **Bloqueia toda a Fase A.**
      **Por que 🧠 e por que primeiro:** o caminho nunca rodou contra nota real (T001).
      Converter os sete leitores antes disso é ligá-los a uma linha que talvez nunca seja
      escrita — e o defeito resultante seria idêntico ao de hoje: silencioso.
      **Fixture:** nota real do lote `ID1010506` com bloco `<entrega>` injetado; o parser já foi
      medido devolvendo o endereço completo, com município e CEP divergentes.
      **Feito:** `persists the delivery party and its own address, apart from the recipient`
      em `nfe-import-repository.integration.test.ts`. `make worker-integration` 65 pass / 0 fail
      (baseline 64). Achou de quebra um `afterAll` que não apagava `nfe_addresses` — corrigido.
      D2 se sustenta; a Fase A está desbloqueada.

---

## Fase A — O seam

> 🤖 Modelo: `sonnet`

- [x] **T003** — Contrato do seam: `delivery` completo vence; `delivery` ausente cai para
      `recipient`; `delivery` sem número/CEP/município cai para `recipient`; a origem sai no
      resultado. **Falha antes de existir implementação.** (RF1, RF2, RF4 · CA1, CA2, CA3, CA10)
- [x] **T004** — Implementar `physical-destination.join.ts` na API. (RF1, RF3)
- [x] **T005** — Contrato de fronteira: varredura por texto de fonte afirmando que
      `nfse-invoice-selection.query.ts`, `cte-batch-selection.query.ts`,
      `drizzle-freight.repository.ts`, `contractor-delivery.query.ts` e
      `drizzle-nfe-document.repository.ts` **não** importam o seam. (RF8 · CA7)
- [x] **T006** — Contrato de log: nenhum campo de endereço no que o seam e seus chamadores
      registram. (RNF1 · CA9)

---

## Fase B — MDF-e, o que sai no XML

> 🤖 Modelo: `sonnet` (T007 é 🧠 — validar com `opus`)

- [x] **T007** — Contrato: `cMunDescarga` de nota com `<entrega>` divergente é o município do
      `<entrega>`. (RF6 · CA5)
- [x] **T008** — 🧠 Trocar `DISCHARGE_ROLE` por o seam em `mdfe-candidate-document.query.ts`, com
      contrato negativo de isolamento. (RNF2 · CA8)
      **Por que 🧠:** é o único consumidor cujo erro atravessa a fronteira da SEFAZ.

---

## Fase C — O roteiro

> 🤖 Modelo: `sonnet`

- [x] **T009** — Contrato: parada agrupada pelo endereço de entrega; nota sem `<entrega>` mantém
      a parada de hoje; duas notas do mesmo cliente, uma com e outra sem, viram duas paradas.
      (P1 · CA1, CA2)
- [x] **T010** — Converter `nfe-destination-address.support.ts`, com contrato negativo de
      isolamento. (RNF2 · CA8)
- [x] **T011** — Contrato: `delivery_address_overrides` vence `<entrega>`. (P4 · CA4)
- [x] **T012** — Converter `drizzle-delivery-address-override.repository.ts`.
- [x] **T013** — Converter `drizzle-route-optimization.repository.ts` (worker) + a cópia por
      valor do seam, com contrato que compara os dois arquivos linha a linha — o mesmo padrão de
      `pool-address-key.ts`.

---

## Fase D — Geocodificação e cliente de entrega

> 🤖 Modelo: `sonnet`

- [x] **T014** — Contrato: a chave enfileirada pela população adiantada é a do endereço
      resolvido. (P3 · CA6)
- [x] **T015** — Converter `drizzle-pending-address.repository.ts` (spec 069).
- [x] **T016** — ~~Converter~~ **não converter** `unscheduled-stop.query.ts` e
      `drizzle-delivery-charge.repository.ts`: medido na execução, **nenhum dos dois lê
      `nfe_addresses`** — eles resolvem o _cliente_ pelo CNPJ, não o _lugar_. Foram para a lista de
      fronteira do CA7, com contrato afirmando que seguem sem ler endereço. Convertê-los desligaria
      em silêncio a consulta que impede o despacho por agendamento pendente.

---

## Fase E — Fecho

> 🤖 Modelo: `haiku`

- [x] **T017** — ~~`EXPLAIN` da listagem de notas~~: a listagem está na lista de exclusão e nunca
      foi tocada. Medida em produção a consulta que de fato alargou: **12,54 ms → 11,66 ms**,
      buffers 9882 → 9879, sem mudança de forma do plano.
- [x] **T018** — `make check` verde, `make worker-integration` verde, evidência completa, e a
      seção de `<entrega>` acrescentada ao `CLAUDE.md`.
