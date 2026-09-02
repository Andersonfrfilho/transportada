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

- [ ] **T002** — 🧠 Provar o caminho de escrita: teste de integração do importador com uma NF-e
      que traz `<entrega>`, afirmando que a linha `role = 'delivery'` e o endereço dela chegam a
      `nfe_participants` e `nfe_addresses`. **Bloqueia toda a Fase A.**
      **Por que 🧠 e por que primeiro:** o caminho nunca rodou contra nota real (T001).
      Converter os sete leitores antes disso é ligá-los a uma linha que talvez nunca seja
      escrita — e o defeito resultante seria idêntico ao de hoje: silencioso.
      **Fixture:** nota real do lote `ID1010506` com bloco `<entrega>` injetado; o parser já foi
      medido devolvendo o endereço completo, com município e CEP divergentes.

---

## Fase A — O seam

> 🤖 Modelo: `sonnet`

- [ ] **T003** — Contrato do seam: `delivery` completo vence; `delivery` ausente cai para
      `recipient`; `delivery` sem número/CEP/município cai para `recipient`; a origem sai no
      resultado. **Falha antes de existir implementação.** (RF1, RF2, RF4 · CA1, CA2, CA3, CA10)
- [ ] **T004** — Implementar `physical-destination.join.ts` na API. (RF1, RF3)
- [ ] **T005** — Contrato de fronteira: varredura por texto de fonte afirmando que
      `nfse-invoice-selection.query.ts`, `cte-batch-selection.query.ts`,
      `drizzle-freight.repository.ts`, `contractor-delivery.query.ts` e
      `drizzle-nfe-document.repository.ts` **não** importam o seam. (RF8 · CA7)
- [ ] **T006** — Contrato de log: nenhum campo de endereço no que o seam e seus chamadores
      registram. (RNF1 · CA9)

---

## Fase B — MDF-e, o que sai no XML

> 🤖 Modelo: `sonnet` (T007 é 🧠 — validar com `opus`)

- [ ] **T007** — Contrato: `cMunDescarga` de nota com `<entrega>` divergente é o município do
      `<entrega>`. (RF6 · CA5)
- [ ] **T008** — 🧠 Trocar `DISCHARGE_ROLE` por o seam em `mdfe-candidate-document.query.ts`, com
      contrato negativo de isolamento. (RNF2 · CA8)
      **Por que 🧠:** é o único consumidor cujo erro atravessa a fronteira da SEFAZ.

---

## Fase C — O roteiro

> 🤖 Modelo: `sonnet`

- [ ] **T009** — Contrato: parada agrupada pelo endereço de entrega; nota sem `<entrega>` mantém
      a parada de hoje; duas notas do mesmo cliente, uma com e outra sem, viram duas paradas.
      (P1 · CA1, CA2)
- [ ] **T010** — Converter `nfe-destination-address.support.ts`, com contrato negativo de
      isolamento. (RNF2 · CA8)
- [ ] **T011** — Contrato: `delivery_address_overrides` vence `<entrega>`. (P4 · CA4)
- [ ] **T012** — Converter `drizzle-delivery-address-override.repository.ts`.
- [ ] **T013** — Converter `drizzle-route-optimization.repository.ts` (worker) + a cópia por
      valor do seam, com contrato que compara os dois arquivos linha a linha — o mesmo padrão de
      `pool-address-key.ts`.

---

## Fase D — Geocodificação e cliente de entrega

> 🤖 Modelo: `sonnet`

- [ ] **T014** — Contrato: a chave enfileirada pela população adiantada é a do endereço
      resolvido. (P3 · CA6)
- [ ] **T015** — Converter `drizzle-pending-address.repository.ts` (spec 069).
- [ ] **T016** — Converter `unscheduled-stop.query.ts` e `drizzle-delivery-charge.repository.ts`,
      com contrato negativo de isolamento em cada. (RNF2 · CA8)

---

## Fase E — Fecho

> 🤖 Modelo: `haiku`

- [ ] **T017** — `EXPLAIN` da listagem de notas antes/depois, colado em `evidence.md`. (RNF3)
- [ ] **T018** — `make check` verde, `make worker-integration` verde, evidência completa, e a
      seção de `<entrega>` acrescentada ao `CLAUDE.md`.
