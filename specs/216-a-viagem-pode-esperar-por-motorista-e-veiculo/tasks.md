# Tasks — 216, a viagem pode esperar por motorista e veículo

> Lê-se depois de `spec.md` e `plan.md`. **Uma task por vez, teste de aceite antes da
> implementação**, task só fecha com evidência em `evidence.md`.

## Modelo por task

| Marca | Classe   | Quando                                                         |
| ----- | -------- | -------------------------------------------------------------- |
| 🧠    | `opus`   | migration, máquina de estados, gate de despacho, revisão final |
| —     | `sonnet` | implementação e teste comuns                                   |
| ⚙️    | `haiku`  | mecânico: renome de tipo, changeset, documentação              |

## Fase 1 — Veículo deixa de ser obrigatório no domínio

- [ ] **T001** 🧠 `opus` — Migration aditiva: `trips.vehicle_id` vira nullable, com `rollback.sql`
      ao lado (regra do repo: toda migration nasce com rollback). Teste em
      `test/database-migration/` provando que a coluna aceita `null` e que dado existente não muda.
      (RF1)
- [ ] **T002** `sonnet` — Teste de contrato: `resolveTripVehicle({ vehicle: null })` devolve estado
      explícito de "sem veículo" em vez de lançar `TripVehicleNotFoundError`; `resolveTripVehicle`
      com veículo presente continua validando `role`/`status` como hoje. (RF4)
- [ ] **T003** `sonnet` — Implementação do T002 em `trip.policy.ts`. (RF4)

## Fase 2 — Criação decide `awaiting_crew` vs `draft`

- [ ] **T004** 🧠 `opus` — Teste de contrato do novo status: `TRIP_STATUS_ORDER` ganha
      `awaiting_crew` antes de `draft`; `checkTripTransition` aceita `awaiting_crew → draft` e
      `awaiting_crew → cancelled`, recusa qualquer outra transição a partir de `awaiting_crew`
      (inclusive `plan-route`, `dispatch`). É Opus porque mexe na máquina de estados que sustenta
      toda a viagem. (RF2)
- [ ] **T005** `sonnet` — Implementação do T004 em `trip-state.policy.ts`. (RF2)
- [ ] **T006** `sonnet` — Teste de contrato HTTP: `POST /trips` sem `driverIds`/sem `vehicleId`
      responde 201 com `status: 'awaiting_crew'`; com só motorista, ou só veículo, também
      `awaiting_crew`; com os dois, `draft` (comportamento atual, sem regressão). (RF3)
- [ ] **T007** `sonnet` — Implementação do T006: `createTripSchema` (`driverIds` mín. 0,
      `vehicleId` opcional), `CreateTripInput`, `TripUseCase.create` decidindo o status pelo par.
      (RF3)
- [ ] **T008** `sonnet` — Teste de regressão explícito da spec 081: aceite de sugestão
      multi-veículo com `driverIds: []` continua criando a viagem certa (`awaiting_crew` quando sem
      veículo também, `draft` quando o veículo do par está presente). Prova que a mudança não
      quebrou o caminho já em produção.

## Fase 3 — Gaps explícitos nos cálculos

- [ ] **T009** 🧠 `opus` — Reler `trip-valuation.query.ts` e `read-trip-valuation.use-case.ts`
      inteiros antes de mexer (aviso do `plan.md`: pedágio já depende de veículo lido tardiamente).
      Desenhar o formato do gap (`VALUATION_GAPS.noVehicle`, no molde de `noTripDriver` já
      existente) e escrever o teste de contrato que prova: viagem sem veículo devolve gap nomeado
      em custo do veículo e em pedágio, nunca lança. (RF7)
- [ ] **T010** `sonnet` — Implementação do T009. (RF7)
- [ ] **T011** `sonnet` — Teste de contrato: cargo-placement (`trip-cargo-layout-input.support.ts`,
      `loadTripOccupancy`) devolve `unavailable` (reaproveitando `cargo-layout-availability.policy.ts`)
      quando a viagem não tem veículo, em vez de erro. (RF7)
- [ ] **T012** `sonnet` — Implementação do T011. (RF7)

## Fase 4 — Despacho nunca sai sem crew completo

- [ ] **T013** 🧠 `opus` — Teste de contrato: `tryAutoDispatchTrip` não desperta para viagem sem
      motorista e veículo completos; `dispatch-trip.use-case.ts` (despacho manual) recusa com erro
      de negócio nomeado (409, código estável), nunca 500. É Opus porque é o gate de segurança que
      impede viagem sair sem tripulação — falha aqui é operacionalmente grave. (RF6, D4)
- [ ] **T014** `sonnet` — Implementação do T013. (RF6)

## Fase 5 — Definir crew pós-criação

- [ ] **T015** `sonnet` — Teste de contrato HTTP da rota nova (nome confirmado no design da Fase 2
      do `plan.md`, candidato `PATCH /trips/:id/crew`): só aceita viagem `awaiting_crew` (outro
      status → 409); com motorista e veículo, transiciona para `draft`; com só um dos dois, mantém
      `awaiting_crew`; reaproveita as mesmas validações de duplicidade/disponibilidade da criação.
      (RF5, D5)
- [ ] **T016** `sonnet` — Implementação do T015: rota, schema Zod, caso de uso, repositório.
      (RF5)

## Fase 6 — Frontend

- [ ] **T017** ⚙️ `haiku` — `trip.types.ts`: `driverName`/`vehicleId` (e campos relacionados)
      viram opcionais. Changeset mecânico — sem decisão de UI aqui. (RF8)
- [ ] **T018** `sonnet` — Ajuste pontual nas telas listadas no `plan.md` (`TripTable`, `TripDetail`,
      `TripProposalRow`, `TripHeaderActions`, `FieldDeliveryWizard(Header)`,
      `TripRouteAssemblyDialog`, `TripOccurrenceTable`, `TripReviewEntry`, `FieldOccurrenceDialog`)
      para exibir "a definir" em vez de string vazia/`undefined` cru quando `driverName`/`vehicleId`
      estão ausentes. (RF8)
- [ ] **T019** `sonnet` — Tela/fluxo de definir motorista e veículo numa viagem `awaiting_crew`
      (consome a rota da Fase 5). (RF5, CREW-02)
- [ ] **T020** `sonnet` — Selo "tripulação pendente" na listagem de viagens para `awaiting_crew`.
      (RF10, CREW-07)

## Fase 7 — Botões de atualizar (independente das Fases 1–5)

- [ ] **T021** `sonnet` — Confirmar no código qual client de dados o módulo `trip` usa para as
      listagens de motoristas/veículos/notas (pergunta 2 do `plan.md`) antes de implementar.
- [ ] **T022** `sonnet` — Botão de atualizar (ícone + tooltip) na listagem de motoristas da tela de
      detalhe da viagem — refetch da query existente, sem escrita. (RF9, CREW-04)
- [ ] **T023** `sonnet` — Mesma coisa para a listagem de veículos. (RF9, CREW-05)
- [ ] **T024** `sonnet` — Mesma coisa para a listagem de notas (NF-e) — antes, verificar se já existe
      mecanismo equivalente de refetch para não duplicar (plan.md, P2 da spec). (RF9, CREW-06)
- [ ] **T025** ⚙️ `haiku` — Teste de contrato que prova que os três botões não escrevem nada
      (contagem de linhas antes/depois do clique, molde da spec 164). (D6, Success Criteria)

## Fase 8 — Fechamento

- [ ] **T026** 🧠 `opus` — Revisão final: `make check` + `make migration-test` verdes; contratos de
      regressão da spec 081, MDF-e, valuation e cargo-placement passando; `evidence.md` consolidado
      com o modelo exato usado em cada task.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/216-a-viagem-pode-esperar-por-motorista-e-veiculo/
(leia spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fases 1/2/4 (T001,T004,T009,T013) 🧠 → opus · restante das Fases 1-5 → executor
model=sonnet · Fase 6/7 → executor model=sonnet (T017 e T025 model=haiku) · revisão final (T026)
→ opus (ou code-reviewer model=opus).
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md.
Pare e pergunte antes de: deploy, migration destrutiva, qualquer [NEEDS CLARIFICATION] — em
especial as três perguntas abertas no plan.md § "Perguntas que ficam para o design".
```
