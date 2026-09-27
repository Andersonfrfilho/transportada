# Tasks — 217, o rascunho da viagem e a troca de tripulação

> Lê-se depois de `spec.md` e `plan.md`. **Uma task por vez, teste de aceite antes da
> implementação**, task só fecha com evidência em `evidence.md`.

## Modelo por task

| Marca | Classe   | Quando                                                                                |
| ----- | -------- | ------------------------------------------------------------------------------------- |
| 🧠    | `opus`   | máquina de estados, regressão de status, limpeza dos campos congelados, revisão final |
| —     | `sonnet` | implementação e teste comuns                                                          |
| ⚙️    | `haiku`  | mecânico: tipos opcionais, textos, tradução de código de erro                         |

## Fase 1 — O status é função do par

> 🤖 Modelo: `sonnet` (T101 e T103 são 🧠 — máquina de estados)

- [ ] **T101** 🧠 `opus` — Teste de contrato de `resolveCrewStatus` e do novo `checkDefineCrew`: par
      completo → `draft`; só motorista → `awaiting_crew`; só veículo → `awaiting_crew`; nenhum dos
      dois → `awaiting_crew`; a partir de `draft` com par completo → `unchanged`; a partir de `draft`
      com par desfeito → `applied` para `awaiting_crew`. Opus porque é a máquina de estados que
      sustenta a viagem. (RF3, D1)
- [ ] **T102** `sonnet` — Implementação do T101 em `trip-state.policy.ts`, com o tipo
      `TripCrewComposition` e a função pura `resolveCrewStatus`. (RF3, D1)
- [ ] **T103** 🧠 `opus` — Teste de contrato HTTP + integração de `PATCH /trips/:id/crew` provando o
      status derivado no banco, inclusive a regressão `draft → awaiting_crew` quando a tripulação é
      desfeita, e que `trip_drivers` e `trips.vehicle_id` ficam coerentes com o status gravado.
      (RF3, D1)
- [ ] **T104** `sonnet` — Implementação do T103: `updateCrew` no use case e no repositório param de
      gravar `transition.nextStatus` cego e passam a gravar o status derivado do par. (RF3, D1)
- [ ] **T105** `sonnet` — Teste de contrato de `allowed-actions` provando que `planRoute` **não** é
      oferecido em `awaiting_crew` e **é** oferecido em `draft`, sem nenhuma condição nova na
      política — a prova de que D1 resolve a RF6 sozinha. (RF6, D1)

## Fase 2 — A viagem nasce sem tripulação

> 🤖 Modelo: `sonnet`

- [ ] **T201** `sonnet` — Teste de contrato HTTP: `POST /trips` sem `driverIds` e sem `vehicleId`
      responde 201 com `awaiting_crew`; com só um dos dois, `awaiting_crew`; com os dois, `draft`
      (sem regressão do comportamento atual). (RF2)
- [ ] **T202** `sonnet` — Implementação do T201: `createTripSchema` (`driverIds` mín. 0, `vehicleId`
      opcional), `CreateTripInput`, e `TripUseCase.create` derivando o status por `resolveCrewStatus`
      em vez de lançar `TripVehicleNotFoundError`. (RF2)
- [ ] **T203** `sonnet` — Teste de regressão da 081: aceite de sugestão multi-veículo com
      `driverIds: []` continua criando a viagem certa, agora `awaiting_crew` quando sem veículo.
      (RF2)

## Fase 3 — O corte na separação e a rota que morre inteira

> 🤖 Modelo: `opus` na fase inteira — é a parte que mexe em estado já despachável

- [ ] **T301** 🧠 `opus` — Teste de contrato: troca permitida em `awaiting_crew`, `draft` e
      `route_planned`; recusada de `separating` em diante com `TRIP_SEPARATION_STARTED`;
      `TRIP_CREW_ALREADY_DEFINED` não é mais lançada por ninguém. (RF4, D2)
- [ ] **T302** 🧠 `opus` — Implementação do T301 em `trip-state.policy.ts`, incluindo a remoção de
      `tripCrewAlreadyDefined` e de seu último uso. (RF4, D2)
- [ ] **T303** 🧠 `opus` — **Ler `plan-trip-route.use-case.ts` e `freezeTripPlannedRoute` inteiros
      antes de escrever qualquer linha** (aviso do `plan.md`) e conferir campo a campo que a lista de
      colunas de D3 cobre tudo que o congelador escreve. Registrar a conferência em `evidence.md`: se
      sobrar campo, ele entra na limpeza. (D3)
- [ ] **T304** 🧠 `opus` — Teste de integração da regressão: trocar o **veículo** de uma viagem
      `route_planned` devolve `draft`, zera os campos congelados de `trips` e de `trip_stops`, e a
      leitura da viagem passa a devolver pedágio ausente em vez do antigo. Trocar só o **motorista**
      mantém `route_planned` com a rota de pé. Trocar pelo **mesmo** veículo não apaga nada e não
      regride. (RF5, D3)
- [ ] **T305** 🧠 `opus` — Implementação do T304, na mesma transação de `updateCrew`. (RF5, D3)
- [ ] **T306** `sonnet` — Teste de integração de ponta a ponta do ciclo: planejar rota → trocar
      veículo → replanejar pela rota da 178 → o pedágio corresponde aos eixos do veículo novo.
      (RF5, D3)

## Fase 4 — Gaps explícitos onde não há veículo

> 🤖 Modelo: `sonnet` (T401 é 🧠 — ler valoração inteira antes)
>
> Herdada da Fase 3 pendente da 216, que agora tem usuário real: a RF1 cria viagem sem veículo.

- [ ] **T401** 🧠 `opus` — Reler `trip-valuation.query.ts` e `read-trip-valuation.use-case.ts`
      inteiros (aviso da 216: o pedágio depende de veículo lido tardiamente). Desenhar o gap
      (`noVehicle`, no molde do `noTripDriver` existente) e escrever o teste que prova: viagem sem
      veículo devolve gap nomeado em custo de veículo e em pedágio, nunca lança.
- [ ] **T402** `sonnet` — Implementação do T401.
- [ ] **T403** `sonnet` — Teste + implementação: cargo-placement devolve `unavailable`
      (`cargo-layout-availability.policy.ts`, `canRequestCargoLayout` já filtra por baú) quando a
      viagem não tem veículo, em vez de erro.
- [ ] **T404** `sonnet` — Teste de contrato de D4: trocar para veículo de baú menor faz nascer planta
      nova (outro `input_hash`), a antiga fica como histórico, as notas que não couberam aparecem em
      `trip_document_reviews`, e a troca responde 200. (D4)

## Fase 5 — Frontend do painel

> 🤖 Modelo: `sonnet` (T501 é ⚙️ `haiku`)

- [ ] **T501** ⚙️ `haiku` — `trip.types.ts`: `driverName`/`vehicleId` e campos relacionados viram
      opcionais. Mecânico, sem decisão de UI. (T017 da 216)
- [ ] **T502** `sonnet` — Telas listadas no `plan.md` da 216 (`TripTable`, `TripDetail`,
      `TripProposalRow`, `TripHeaderActions`, `FieldDeliveryWizard(Header)`, `TripRouteAssemblyDialog`,
      `TripOccurrenceTable`, `TripReviewEntry`, `FieldOccurrenceDialog`) exibem "a definir" em vez de
      vazio quando não há motorista/veículo. (RF7, T018 da 216)
- [ ] **T503** `sonnet` — `validateQuickCreate` devolve problemas por caminho: o rascunho não exige
      motorista nem veículo, o clique único continua exigindo. Teste de contrato dos dois caminhos.
      (RF1, D5)
- [ ] **T504** `sonnet` — Botão "Salvar rascunho" no diálogo de criação, chamando
      `runQuickCreateTrip` sem o passo de planejar rota (parâmetro, não função copiada). Teste de
      contrato provando a ordem das requisições e a ausência do `plan-route`. (RF1, D5)
- [ ] **T505** `sonnet` — Tela de definir/trocar motorista e veículo no detalhe, consumindo
      `PATCH /trips/:id/crew`, oferecida conforme `allowed-actions`. (T019 da 216)
- [ ] **T506** `sonnet` — Selo de tripulação pendente na listagem de viagens `awaiting_crew`.
      (RF7, T020 da 216)

## Fase 6 — PWA do motorista

> 🤖 Modelo: `sonnet` (T603 é ⚙️ `haiku`)

- [ ] **T601** `sonnet` — Teste de contrato do serviço que compara o snapshot local com a resposta
      nova de `GET /me/trips/current`: viagem que estava no snapshot, não veio na resposta e não está
      concluída/cancelada → estado "não é mais sua". Viagem concluída → nada de aviso (é o caso
      normal). (RF8, D6)
- [ ] **T602** `sonnet` — Aviso na tela do `frontend-driver`, no molde de
      `DriverForeignPendingNotice`, consumindo o T601. Um texto só serve para reatribuição e para
      viagem devolvida a `draft`. (RF8, D6)
- [ ] **T603** ⚙️ `haiku` — `rejectionCauseLabel.service.ts` ganha texto de produto para
      `TRIP_NOT_OF_DRIVER` e `TRIP_STOP_NOT_REACHABLE`. Teste de contrato provando que nenhum dos
      dois cai no fallback do código cru. (RF8, D7)
- [ ] **T604** `sonnet` — Teste de integração do lado motorista: motorista removido da tripulação
      recebe 403/404 nas rotas `/me/*` conforme o caminho, e a viagem sai de
      `GET /me/trips/current`. Prova também que viagem devolvida a `draft` sai da lista, porque
      `draft` não está em `CURRENT_DRIVER_TRIP_STATUSES`. (RF8, D6)

## Fase 7 — Fechamento

> 🤖 Modelo: `opus`

- [ ] **T701** `sonnet` — Revisão de design e usabilidade das telas novas (botão de rascunho, tela de
      tripulação, selo, aviso do motorista), fechando com print de cada uma.
- [ ] **T702** 🧠 `opus` — Revisão final: `make check` + `make migration-test` verdes; os dois
      comandos de teste da API rodados separadamente (contrato **e** `test:integration` com
      `--env-file=../../.env.test`, porque um não cobre o outro); contratos de regressão da 081, 148,
      153, 178, MDF-e, valoração e cargo-placement passando; `evidence.md` consolidado com o modelo
      usado em cada task.

## Prompt de execução

```text
/oh-my-claudecode:autopilot Execute a spec specs/217-o-rascunho-da-viagem-e-a-troca-de-tripulacao/
(leia spec.md, plan.md e tasks.md antes de começar). Uma task por vez, na ordem do tasks.md.
Modelos: Fase 1 → executor model=sonnet (T101 e T103 🧠 → opus) · Fase 2 → executor model=sonnet ·
Fase 3 inteira → opus · Fase 4 → executor model=sonnet (T401 🧠 → opus) · Fase 5 → executor
model=sonnet (T501 model=haiku) · Fase 6 → executor model=sonnet (T603 model=haiku) ·
T701 → designer · T702 → opus (ou code-reviewer model=opus).
Cada task fecha com typecheck + testes + commit isolado, evidência em evidence.md. Teste novo entra
na lista explícita do package.json da app, senão não roda.
Pare e pergunte antes de: deploy, migration destrutiva, e antes de implementar a T305 se a
conferência da T303 achar campo congelado fora da lista de D3.
```
