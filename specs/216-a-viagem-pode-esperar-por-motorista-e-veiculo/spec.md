# Feature 216 — A viagem pode esperar por motorista e veículo

> Registrada em 2026-09-26, a partir do incidente de produção do mesmo dia: a aprovação de agregado
> ficou impedida por horas (`fleet_drivers_pix_key_check`, corrigido e publicado — PR #104), e ficou
> claro que, enquanto isso, **nenhuma viagem que dependesse daquele agregado podia nem ser criada** —
> hoje motorista e veículo são "tudo ou nada" no `POST /trips`.
>
> **Numeração.** Conferida em 2026-09-26 contra `origin/staging` (`git ls-tree origin/staging:specs`):
> a última é a 215. Esta é a **216**.

## Specs do mesmo assunto

- **081 — A viagem sugerida nasce com motorista.** Já decidiu, e já está em produção, que **crew
  vazio é válido no domínio**: o diálogo de aceite de sugestão multi-veículo chama os casos de uso
  de criação com `driverIds: []` quando o par veículo↔motorista não é conhecido ("distribuir carga
  antes de saber quem dirige é o uso normal de quem monta a escala na véspera"). Conferido no código:
  `resolveTripCrewForCreation`/`resolveTripCrew` (`trip-crew.service.ts`, `trip.policy.ts`) não têm
  nenhuma trava contra lista vazia — a única trava hoje é o schema HTTP da criação manual
  (`trip-request.schema.ts:34`, `driverIds.min(1)`). Esta spec **não recria** essa decisão; ela
  **estende** o mesmo caminho já provado para a criação manual, e resolve a metade que a 081 deixou
  de fora: **veículo continua obrigatório em todo caminho hoje** (`resolveTripVehicle` lança
  `TripVehicleNotFoundError` para `vehicle: null`, sem exceção).
- **178 — Trocar a rota no rascunho.** Mesmo status (`draft`) e mesmo espírito (editar antes do
  roteiro fechar) — a implementar confere se alguma trava dela pressupõe crew já montada antes de
  aceitar edição de rota, para não colidir.

## Problema e resultado

`createTripSchema` exige `driverIds` (mínimo 1) e `vehicleId` no `POST /trips`; `trips.vehicle_id` é
`NOT NULL` no banco. Isso significa que **a viagem só existe depois que motorista e veículo já estão
prontos** — e o inverso não é verdade: candidatura de agregado pendente, motorista com documento em
análise, veículo ainda sem placa cadastrada, ou qualquer atraso de cadastro **bloqueia a viagem
inteira**, mesmo quando rota, notas e cliente já estão decididos.

O resultado desta feature é a viagem poder nascer em **`awaiting_crew`**, um status novo que entra
**antes** do `draft` atual (que continua significando "montada, falta planejar rota" — não é
redefinido), e ganhar motorista/veículo depois, pela tela da própria viagem — sem re-digitar rota,
cliente ou notas já vinculadas.

Junto, a tela da viagem ganha três botões de **atualizar** (ícone com tooltip: "Motoristas",
"Veículos", "Notas (NF-e)") — cada um só recarrega a listagem correspondente a partir do servidor.
**Não gravam nada** e **não recalculam** custo, pedágio ou cubagem: resolvem o caso raso de "acabei
de aprovar o motorista/cadastrar o veículo/emitir a nota e a tela ainda mostra o estado antigo",
sem esperar um refresh de página inteira.

## Fora do escopo

| Item                                                                                                                | Motivo                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sincronização automática (webhook/poll) do cadastro para dentro da viagem                                           | Decisão do dono do produto (2026-09-26): só manual, por botão — evita recálculo silencioso de custo/pedágio no meio da operação.                                                                                                                                                                                                                                                                            |
| Botão de atualizar **grava** o dado congelado da viagem (`trip_drivers.driverName`/`driverTaxId`, dados do veículo) | Decisão do dono do produto (2026-09-26): os três botões só recarregam a listagem em tela (refetch), não regravam o congelado da viagem. Corrigir o congelado é ação de definir/trocar motorista e veículo, não de "sincronizar".                                                                                                                                                                            |
| Trocar motorista/veículo de uma viagem **já `route_planned` ou depois**                                             | Revisão do dono do produto no mesmo dia: a troca antes de `route_planned` (viagem `draft`) entrou no escopo desta spec (`PATCH /trips/:id/crew`, D5) — nada foi congelado ainda naquele ponto. Depois de `route_planned`, `trips.planned_toll` já foi congelado a partir do veículo antigo (`freezeTripPlannedRoute`), e a troca continua bloqueada até uma spec própria decidir como recongelar o pedágio. |
| Sugestão automática de motorista/veículo pelo solver                                                                | Já decidido fora de escopo pela 081; o par continua decisão humana.                                                                                                                                                                                                                                                                                                                                         |
| Tripulação de mais de um motorista nascendo já na criação                                                           | A 081 já limita a um motorista por veículo nesse caminho; o segundo entra pela tela da viagem, como hoje.                                                                                                                                                                                                                                                                                                   |
| Emitir MDF-e/CT-e de viagem sem crew completo                                                                       | Já impossível hoje (`MdfeManifestCrewRequiredError`) e continua assim — não muda.                                                                                                                                                                                                                                                                                                                           |
| Reabrir viagem já despachada para definir/trocar crew                                                               | `dispatched` é porta de não-retorno (ADR-0043/ADR-0068); definir crew só vale em `awaiting_crew`.                                                                                                                                                                                                                                                                                                           |

## Decisões

### D1 — O status novo é `awaiting_crew`, e entra antes de `draft`

`TRIP_STATUS_ORDER` ganha uma entrada antes de `'draft'`. `draft` continua significando "crew
montada, falta planejar rota" — nenhuma regra existente em `checkTripTransition`/
`checkTripDocumentTransition` é redefinida. `checkPlanRoute` e as demais transições continuam
partindo de `draft` como hoje; `awaiting_crew` só sabe transicionar para `draft` (ao completar
motorista + veículo) ou `cancelled`.

### D2 — Veículo passa a ser opcional na criação; motorista já era (spec 081)

`trips.vehicle_id` vira nullable (migration aditiva). `resolveTripVehicle` aceita `vehicle: null`
sem lançar `TripVehicleNotFoundError` — devolve `null` em vez de um `TripVehicleCandidate`. Todo
consumidor de `trips.vehicleId`/`vehicle` que hoje assume presença passa a tratar ausência como gap
explícito (D3), nunca como erro solto.

### D3 — Ausência de crew é gap explícito em todo cálculo, nunca `null` silencioso ou exceção

Onde hoje existe leitura incondicional de `vehicleId`/`vehicle` (cargo-placement, pedágio/valuation),
a ausência devolve o mesmo tipo de estado "não calculável ainda" que essas telas já usam para outras
lacunas (ex.: `cargo-layout-availability.policy.ts` já tem o conceito de layout `unavailable`;
`buildTripDriverCost` já devolve parcela `missing`/gap quando `crew.length === 0`). Nenhum caminho
novo pode lançar exceção não tratada por causa de `vehicleId: null` — a spec 216 só estende gaps que
o sistema já sabe expressar.

### D4 — Despacho automático ganha gate de crew completo

Hoje `resolveDispatchReadiness`/`tryAutoDispatchTrip` não verificam motorista/veículo — a garantia
vinha só da criação. Com criação permitindo `awaiting_crew`, esse gate precisa nascer aqui: viagem
sem motorista **e** veículo definidos não é elegível a `tryAutoDispatchTrip`, e despacho manual
(`dispatch-trip.use-case.ts`) recusa com erro de negócio nomeado (não 500, não silêncio).

### D5 — Definir crew pela primeira vez, e trocar enquanto `draft`, são a mesma rota

Nasce `PATCH /trips/:id/crew`, recebendo `driverIds`/`vehicleId` (mesma validação de duplicidade e
disponibilidade já usada na criação, via `resolveTripCrewForCreation`/
`resolveTripVehicleForCreation`). Duas viagens de entrada:

- **`awaiting_crew`**: ao ter pelo menos um motorista **e** um veículo, transiciona para `draft`.
  Definir parcialmente (só motorista, ou só veículo) é permitido e **mantém** `awaiting_crew` — a
  viagem só avança quando os dois estão completos, o mesmo mínimo que `createTripSchema` já exige
  hoje para uma viagem `draft`.
- **`draft`** (revisão do dono do produto, mesmo dia): a mesma rota também **troca** motorista e/ou
  veículo já definidos, sem mudar de status (`unchanged`) — antes de `route_planned`, nada
  calculado a partir do veículo (pedágio) foi congelado ainda, então a troca não deixa número velho
  para trás. **A partir de `route_planned` a troca continua bloqueada** (`TRIP_CREW_ALREADY_DEFINED`):
  `freezeTripPlannedRoute` já gravou `trips.planned_toll` com o eixo do veículo antigo, e só um
  replanejamento de rota corrige isso — automatizar esse recongelamento é decisão de uma spec
  própria, não desta.

### D6 — Os três botões de "atualizar" são leitura, não escrita

Cada botão (motoristas, veículos, notas) refaz a consulta daquela lista específica, exatamente como
ela é buscada hoje (mesmo endpoint de leitura, sem parâmetro novo) — a novidade é só a affordance na
UI para refazer o fetch sem recarregar a página inteira. Nenhum dos três toca `trip_drivers`,
`trips.vehicle_id` nem o congelado de qualquer nota.

## Histórias priorizadas

### P1 — A viagem nasce sem motorista nem veículo, quando falta algum dos dois ⭐ MVP

**Given** um operador monta rota, cliente e notas de uma viagem, mas o motorista/agregado ainda não
foi aprovado (ou o veículo ainda não tem cadastro)
**When** ele confirma a criação sem informar `driverIds`/`vehicleId`
**Then** a viagem é criada em `awaiting_crew`, com rota e notas já vinculadas, sem exigir crew.

**Independent Test**: `POST /trips` sem `driverIds`/`vehicleId` responde 201 com
`status: 'awaiting_crew'`; a viagem aparece na listagem com indicação visual de tripulação pendente.

### P1 — Definir motorista e veículo depois, na viagem em `awaiting_crew`

**Given** uma viagem em `awaiting_crew`
**When** o operador define motorista e veículo pela tela de detalhe da viagem
**Then** a viagem passa a `draft`, com `trip_drivers`/`trips.vehicle_id` preenchidos exatamente como
uma viagem criada hoje com crew completo — sem precisar re-informar rota, cliente ou notas.

**Independent Test**: `PATCH /trips/:id/crew` numa viagem `awaiting_crew`, informando os dois,
responde com `status: 'draft'`; informando só um dos dois, responde mantendo `awaiting_crew`.

### P1 — Viagem sem crew completo nunca despacha sozinha

**Given** uma viagem em `awaiting_crew` (ou `draft` com crew incompleto, se isso for possível pelo
fluxo — a verificar no design)
**When** o gatilho automático de despacho ou o despacho manual são acionados
**Then** o sistema recusa com erro de negócio nomeado, nunca despacha sem motorista/veículo.

**Independent Test**: chamar `dispatch` numa viagem sem crew completo responde 409 com código
estável; o gatilho automático não desperta.

### P2 — Botão de atualizar a listagem de motoristas

**Given** a tela de detalhe de uma viagem
**When** o operador clica no ícone de atualizar ao lado da lista de motoristas
**Then** a lista é recarregada do servidor, sem recarregar a página, sem gravar nada.

**Independent Test**: aprovar um motorista em outra aba, clicar em atualizar, ver o motorista
aparecer disponível na lista sem F5.

### P2 — Botão de atualizar a listagem de veículos

Mesma forma da história anterior, para a listagem de veículos disponíveis para a viagem.

### P2 — Botão de atualizar a listagem de notas (NF-e) da viagem

Mesma forma, para a listagem de notas fiscais vinculadas à viagem — a verificar no design se hoje já
existe algum mecanismo de refetch equivalente, para não duplicar.

### P3 — A listagem de viagens sinaliza tripulação pendente

**Given** uma viagem em `awaiting_crew`
**When** o operador olha a listagem de viagens
**Then** um selo/indicação visual mostra que falta definir motorista e/ou veículo — sem inventar
nome de motorista nem placa.

## Edge cases

- WHEN o operador tenta despachar (manual ou automático) uma viagem sem motorista e veículo
  completos THEN o sistema recusa com erro nomeado, nunca 500, nunca despacho parcial.
- WHEN o operador define só motorista OU só veículo numa viagem `awaiting_crew` THEN a viagem
  permanece `awaiting_crew` — não existe estado intermediário "meio draft".
- WHEN o operador clica em atualizar uma listagem e a chamada falha (rede, 500) THEN a lista
  anterior continua visível, com aviso de que a atualização falhou — nunca esvazia a tela.
- WHEN uma viagem `awaiting_crew` é cancelada THEN a transição para `cancelled` funciona
  normalmente, sem exigir crew antes de cancelar.
- WHEN o cálculo de custo/pedágio/cubagem é solicitado (preview) para uma viagem sem veículo
  THEN a resposta expõe gap explícito ("sem veículo definido"), nunca erro solto nem número
  fabricado.

## Requisitos funcionais

- **RF1** `trips.vehicle_id` vira nullable (migration aditiva, com rollback).
- **RF2** Novo valor `awaiting_crew` em `trips.status`, posicionado antes de `draft` em
  `TRIP_STATUS_ORDER`; `checkTripTransition` ganha as transições `awaiting_crew → draft` e
  `awaiting_crew → cancelled`.
- **RF3** `createTripSchema`/`CreateTripInput` aceitam `driverIds` vazio (já suportado no domínio,
  spec 081) e `vehicleId` ausente; `TripUseCase.create` decide `awaiting_crew` vs `draft` pela
  presença de motorista **e** veículo.
- **RF4** `resolveTripVehicle`/`resolveTripVehicleForCreation` aceitam ausência de veículo sem
  lançar erro, devolvendo estado explícito de "sem veículo".
- **RF5** Rota nova de definir crew (`PATCH /trips/:id/crew` ou nome equivalente a decidir no
  design), só aceita em `awaiting_crew`, reaproveita `resolveTripCrewForCreation`/
  `resolveTripVehicleForCreation`, transiciona para `draft` quando completo.
- **RF6** Gate de crew completo em `tryAutoDispatchTrip`/`dispatch-trip.use-case.ts` (D4).
- **RF7** Todo ponto que lê `trips.vehicleId`/`vehicle` sem checar null (cargo-layout-input,
  valuation/pedágio) passa a tratar ausência como gap explícito (D3) — mapear a lista completa no
  `plan.md`.
- **RF8** Frontend: `trip.types.ts` marca `driverName`/`vehicleId` como opcionais; telas afetadas
  (listagem, detalhe, timeline, wizard de campo — lista levantada nesta sessão) exibem estado "a
  definir" em vez de string vazia ou `undefined` cru.
- **RF9** Três botões de atualizar (ícone + tooltip) na tela de detalhe da viagem: motoristas,
  veículos, notas (NF-e) — cada um refaz o fetch da própria listagem, sem escrita (D6).
- **RF10** Selo/indicação de "tripulação pendente" na listagem de viagens para `status:
awaiting_crew` (P3).

## Requirement Traceability

| Requirement ID | Story                                               | Phase  | Status  |
| -------------- | --------------------------------------------------- | ------ | ------- |
| CREW-01        | P1: A viagem nasce sem motorista nem veículo        | Design | Pending |
| CREW-02        | P1: Definir motorista e veículo depois              | Design | Pending |
| CREW-03        | P1: Viagem sem crew completo nunca despacha sozinha | Design | Pending |
| CREW-04        | P2: Botão de atualizar motoristas                   | -      | Pending |
| CREW-05        | P2: Botão de atualizar veículos                     | -      | Pending |
| CREW-06        | P2: Botão de atualizar notas (NF-e)                 | -      | Pending |
| CREW-07        | P3: Selo de tripulação pendente na listagem         | -      | Pending |

**Coverage:** 7 total, 0 mapped to tasks yet, 7 unmapped ⚠️ (tasks.md/design.md ainda não escritos)

## Success Criteria

- [ ] Viagem pode ser criada sem motorista/veículo quando algum dos dois não está pronto, sem perder
      rota/notas já montadas.
- [ ] Zero regressão nos fluxos que já assumem crew completo (081, MDF-e, valuation, cargo-placement)
      — cobertos por teste de contrato explícito para o caminho `awaiting_crew`.
- [ ] Nenhuma viagem sem crew completo é despachada, manual ou automaticamente.
- [ ] Os três botões de atualizar não geram nenhuma escrita — provado por teste que conta linhas
      afetadas antes/depois do clique (mesmo padrão de prova usado na spec 164 para "não escreveu
      nada").
