# Tasks

Fase 0 — decisões

> 🤖 Modelo: `opus` 🧠 (as duas fecham escopo; nada abaixo começa antes)

- [x] T001 🧠 ~~"caixa a caixa ou paletizado?"~~ — **respondido 2026-09-05: caixa a caixa, a embalagem de papelão dos produtos.** D2/D3 confirmados — spec.md § Dúvidas
- [x] T002 🧠 ~~ADR~~ **aceita**: `docs/adr/0062-a-medida-da-caixa-mora-em-transportada.md` recomenda tabela própria e **não** mexer no pacote.

Fase 1 — o desenho, que não depende de cadastro

> 🤖 Modelo: `sonnet`

- [ ] T010 Contrato: com nada medido, mudar o volume de reserva não muda fatia nenhuma — `test/trip/cargo-layout-rows.contract.ts` — vermelho antes da T011
- [ ] T011 `resolveCargoLayout` devolve fileiras, com quebra na mesma cor — `trips/domain/cargo-layout.policy.ts` — T010 verde
- [ ] T012 [P] Painel desenha fileiras e a silhueta do tipo do veículo — `TripCargoPanel.component.tsx` — contrato de frontend
- [ ] T013 `POST /trips/cargo-preview` nos moldes de `valuation-preview` — `trips/presentation/trip.routes.ts` — contrato de rota
- [ ] T014 O painel entra na tela Nova viagem, alimentado pela prévia — `TripQuickCreateDialog.component.tsx` — contrato de tela

Fase 2 — a porta

> 🤖 Modelo: `sonnet`

- [ ] T020 Migration `fleet_vehicles.loading_access`, semeado do `body_type` — `drizzle/` + `rollback.sql` — `make migration-test`
- [ ] T021 [P] Campo "por onde carrega" na ficha do veículo — `fleet/` — contrato de frontend
- [ ] T022 A ordem de carregamento lê o acesso: `rear` mantém LIFO, `rear_and_side` marca a lateral — `cargo-layout.policy.ts` — contrato

Fase 3 — o cadastro que se popula sozinho

> 🤖 Modelo: `sonnet` (T030 é 🧠 se a ADR mandar mexer no pacote)

- [ ] T030 🧠 Medidas e peso no `catalog-contracts`/`catalog-module`, conforme a ADR — pacote — versão publicada
- [ ] T031 Migration `nfe_package_boxes` + contrato de isolamento por tenant — `drizzle/` — `make migration-test`
- [ ] T032 A importação cria a linha da caixa, sem medida, idempotente — `nfe-documents/application/` — contrato de importação
- [ ] T033 [P] Backfill relê os XMLs arquivados, no molde de `nfe-party-contact-backfill` — `worker-transportada/` — integração
- [ ] T034 Peso da caixa derivado de nota de item único (9% das notas, 18 de 663 caixas) — `cargo-volume.policy.ts` — contrato
- [ ] T035 Fila de medição: pendentes por volume, acumulado, cobertura no topo e aviso da cauda — `nfe-workspace/components/` — contrato de tela
- [ ] T036 Permissão `cargo.measure` no catálogo e nos três papéis — migration + `authorization.policy.ts` — `test/separator-role.contract.test.ts`
- [ ] T037 Redução GTIN-14 → GTIN-13 e busca por código ou texto — `shared/gtin.service.ts` — contrato com os 90% medidos
- [ ] T038 Tela de medição mobile-first com leitor de código e volta ao leitor após gravar — `nfe-workspace/` + `PUT /nfe-package-boxes/:id` — contrato de tela

Fase 4 — a ocupação absoluta

> 🤖 Modelo: `sonnet`

- [ ] T040 `resolveCargoVolume` soma por item, com reserva mediano e origem — `cargo-volume.policy.ts` — contrato das três origens
- [ ] T041 Ocupação e alerta de concentração de peso no painel, sempre com a origem ao lado — `TripCargoPanel.component.tsx` — contrato
- [ ] T042 `evidence.md` com a cobertura medida antes e depois — `specs/085-*/evidence.md` — `make check` verde

`[P]` significa que a tarefa pode executar em paralelo sem editar os mesmos
arquivos. Marque como concluída apenas após registrar evidência.
