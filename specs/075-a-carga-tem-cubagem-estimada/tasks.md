# Tasks — 075 A carga tem cubagem estimada

Uma task por vez. Contrato **antes** da implementação. Evidência em `evidence.md`.

---

## Fase 0 — A dúvida que bloqueia

> 🤖 Modelo: `haiku`

- [x] **T001** — Fechado em 2026-09-02: **0,05 m³ por volume** (D5). ⚠️ Medido no mesmo dia: um
      dia normal (180 notas, 3.143 volumes) dá 157 m³ contra 38 m³ de frota — 4,1×. Por nota o
      número é sólido; o total do dia sugere várias viagens por veículo ou carga subcontratada.
      Não bloqueia: a ocupação é por viagem, não por dia. Ver a ressalva na D5.

---

## Fase A — A cubagem da nota

> 🤖 Modelo: `sonnet`

- [x] **T002** — Contrato de `resolveCargoVolume`: `quantidade × fator` com origem `estimated`;
      sem `qVol` ⇒ `null`; fator ausente ⇒ `null`; **nunca zero**; espécie sem linha cai no padrão.
      Falha antes de existir. (RF2 · CA1, CA2, CA3)
- [x] **T003** — Implementar a política, espelhando `cargo-weight.policy.ts` (escala, `divideHalfUp`,
      `formatScaledDecimal`).
- [x] **T004** — Migration de `company_cargo_volume_factors` com CHECK recusando zero e negativo,
      mais `rollback.sql` ao lado.
- [x] **T005** — Repositório e rotas de leitura/escrita do fator (`settings.manage`, escopo
      `company`), com contrato negativo de isolamento. (RNF1 · CA8)

---

## Fase B — A capacidade do veículo

> 🤖 Modelo: `sonnet` (T007 é 🧠 — validar com `opus`)

- [x] **T006** — Contrato de `resolveVehicleCapacity`: ficha vence referência; ficha zerada cai na
      referência; sem os dois ⇒ ausência. (RF3 · CA4)
- [x] **T007** — 🧠 Migration de `vehicle_volume_references` com chave `(vehicle_type, body_type)`,
      **sem `company_id`**, semeada com a tabela do cliente.
      **Por que 🧠:** é a decisão D2 virando schema. Carreta é o **implemento** (`body_type` 03/04),
      não o cavalo, e implemento tem `vehicle_type` vazio. Errar a chave aqui custa migration com
      dados depois. Teste obrigatório: cavalo + carreta acoplados, medindo qual linha responde.
- [x] **T008** — ⚠️ **A task estava errada e virou outra.** `VEHICLE_TYPES` é cópia entre **duas**
      apps (o worker não a tem), e a referência de cubagem é dado de servidor que o frontend não
      carrega — não há paridade entre apps aqui. O contrato que faltava é o de **cobertura do
      catálogo**: as cinco exceções nomeadas por extenso, conferidas contra a semente da migration.
      (RNF2 · CA7)

---

## Fase C — A ocupação na viagem

> 🤖 Modelo: `sonnet`

- [ ] **T009** — Contrato: soma das notas ÷ capacidade; **uma nota estimada torna o total
      estimado**; denominador ausente não vira 100%; acima de 100% é exibido como está.
      (RF4 · CA5)
- [ ] **T010** — Implementar no domínio de viagem e expor na consulta de detalhe.
- [ ] **T011** — Contrato **de tela**: o número nunca aparece sem a marca de estimativa ao lado.
      Este defeito é de interface e não aparece em teste de domínio. (CA6)

---

## Fase D — O desenho do veículo

> 🤖 Modelo: `sonnet`

- [ ] **T012** — Ícone por tipo em `components/ui/icon`, um por tipo do catálogo, seguindo
      `docs/frontend/icons.md`. (RF5 · CA9)
- [ ] **T013** — Usar na ficha da frota e no seletor de veículo, com `aria-hidden` ao lado do
      rótulo.

---

## Fase E — Fecho

> 🤖 Modelo: `haiku`

- [ ] **T014** — `make check` e `make migration-test` verdes, evidência completa, `CLAUDE.md` com a
      seção de cubagem estimada.
