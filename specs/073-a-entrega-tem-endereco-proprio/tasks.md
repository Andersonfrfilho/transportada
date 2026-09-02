# Tasks — 073 A entrega tem endereço próprio

Uma task por vez. Teste de contrato **antes** da implementação. Task só fecha com evidência em
`evidence.md`.

---

## Fase 0 — Medir antes de decidir

> 🤖 Modelo: `haiku`

- [ ] **T001** — Contar, em staging e em produção, quantas notas têm participante `delivery`, e
      em quantas delas a chave de parada do `delivery` **difere** da do `recipient`.
      **Verificação:** consulta agregada (nunca linha a linha — é PII), número colado em
      `evidence.md`.
      **Aceite:** D2 confirmada ou revisada por escrito antes de qualquer código.

---

## Fase A — O seam

> 🤖 Modelo: `sonnet`

- [ ] **T002** — Contrato do seam: `delivery` completo vence; `delivery` ausente cai para
      `recipient`; `delivery` sem número/CEP/município cai para `recipient`; a origem sai no
      resultado. **Falha antes de existir implementação.** (RF1, RF2, RF4 · CA1, CA2, CA3, CA10)
- [ ] **T003** — Implementar `physical-destination.join.ts` na API. (RF1, RF3)
- [ ] **T004** — Contrato de fronteira: varredura por texto de fonte afirmando que
      `nfse-invoice-selection.query.ts`, `cte-batch-selection.query.ts`,
      `drizzle-freight.repository.ts`, `contractor-delivery.query.ts` e
      `drizzle-nfe-document.repository.ts` **não** importam o seam. (RF8 · CA7)
- [ ] **T005** — Contrato de log: nenhum campo de endereço no que o seam e seus chamadores
      registram. (RNF1 · CA9)

---

## Fase B — MDF-e, o que sai no XML

> 🤖 Modelo: `sonnet` (T007 é 🧠 — validar com `opus`)

- [ ] **T006** — Contrato: `cMunDescarga` de nota com `<entrega>` divergente é o município do
      `<entrega>`. (RF6 · CA5)
- [ ] **T007** — 🧠 Trocar `DISCHARGE_ROLE` por o seam em `mdfe-candidate-document.query.ts`, com
      contrato negativo de isolamento. (RNF2 · CA8)
      **Por que 🧠:** é o único consumidor cujo erro atravessa a fronteira da SEFAZ.

---

## Fase C — O roteiro

> 🤖 Modelo: `sonnet`

- [ ] **T008** — Contrato: parada agrupada pelo endereço de entrega; nota sem `<entrega>` mantém
      a parada de hoje; duas notas do mesmo cliente, uma com e outra sem, viram duas paradas.
      (P1 · CA1, CA2)
- [ ] **T009** — Converter `nfe-destination-address.support.ts`, com contrato negativo de
      isolamento. (RNF2 · CA8)
- [ ] **T010** — Contrato: `delivery_address_overrides` vence `<entrega>`. (P4 · CA4)
- [ ] **T011** — Converter `drizzle-delivery-address-override.repository.ts`.
- [ ] **T012** — Converter `drizzle-route-optimization.repository.ts` (worker) + a cópia por
      valor do seam, com contrato que compara os dois arquivos linha a linha — o mesmo padrão de
      `pool-address-key.ts`.

---

## Fase D — Geocodificação e cliente de entrega

> 🤖 Modelo: `sonnet`

- [ ] **T013** — Contrato: a chave enfileirada pela população adiantada é a do endereço
      resolvido. (P3 · CA6)
- [ ] **T014** — Converter `drizzle-pending-address.repository.ts` (spec 069).
- [ ] **T015** — Converter `unscheduled-stop.query.ts` e `drizzle-delivery-charge.repository.ts`,
      com contrato negativo de isolamento em cada. (RNF2 · CA8)

---

## Fase E — Fecho

> 🤖 Modelo: `haiku`

- [ ] **T016** — `EXPLAIN` da listagem de notas antes/depois, colado em `evidence.md`. (RNF3)
- [ ] **T017** — `make check` verde, `make worker-integration` verde, evidência completa, e a
      seção de `<entrega>` acrescentada ao `CLAUDE.md`.
