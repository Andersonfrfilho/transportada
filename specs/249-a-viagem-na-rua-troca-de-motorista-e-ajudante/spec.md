# Feature 249 — A viagem na rua troca de motorista e de ajudante

## Problema e resultado

Hoje a tripulação só se troca até `route_planned` (spec 217): `isCrewSwappable` fecha a porta
quando o barracão começa a separar, e o motivo registrado é "o separador já tem papel na mão para
um caminhão específico". Esse motivo não vale para uma viagem **que já saiu**: o motorista passa
mal, o caminhão quebra e o ajudante assume o volante, o ajudante falta. O escritório precisa passar
a viagem para outra pessoa **sem refazer a viagem e sem mexer em valor**.

Pedido do usuário (2026-10-07): _"após a viagem começar ter a opção de transferir ela para outro
motorista ou ajudante, sem alterar valor"_ — e urgente para produção.

Resultado: com a viagem em `dispatched`, `in_transit` ou `on_delivery_route`, quem tem
`trip.report-on-behalf` abre **Transferir tripulação** na viagem, escolhe o(s) motorista(s) e
ajudante(s) novos, escreve o motivo e confirma. A viagem continua exatamente onde estava; o
histórico guarda quem saiu, quem entrou, quem fez, por quê, e o custo antes e depois.

## Decisões do usuário (2026-10-07)

- **Valor**: _"calcular novamente e add as diferenças com valor anterior e novo valor"_. O custo da
  viagem (diária de motorista e de ajudante) é **recalculado** com a tripulação nova, e o evento
  guarda custo anterior, custo novo e a diferença. Frete e receita não dependem do motorista e **não
  são tocados**.
- **MDF-e**: permitir, avisar e registrar. O MDF-e autorizado segue com o condutor anterior; o
  painel avisa e o evento marca a divergência. Incluir o condutor no MDF-e é spec seguinte.
- **Permissão**: `trip.report-on-behalf` (a da baixa em nome do motorista, ADR-0067). O separador não
  a tem.

## Decisões por delegação

- **D1 — Janela**: `dispatched`, `in_transit`, `on_delivery_route` e, por decisão do usuário
  (07/10/2026), `completed` — corrigir quem de fato dirigiu numa viagem já concluída; o resumo
  financeiro por motorista (D10) migra para a nova tripulação, como na rua. `separating` e `loading`
  seguem como estão (lacuna conhecida da 217, fora deste pedido). `cancelled` continua recusada
  com o motivo próprio.
- **D2 — O que não muda**: `status`, `vehicle_id`, rota congelada, pedágio, ETA, paradas, notas,
  `daily_allowance_days`, `planned_journey_seconds`. O corpo da rota **não aceita** `vehicleId`:
  trocar caminhão no meio da viagem apagaria a rota congelada.
- **D3 — Rota nova, ação nova**: `POST /v1/trips/:id/crew-transfers` com
  `{ driverIds, helperIds, reason }`, `201` com a viagem. `PATCH /trips/:id/crew` e a janela da 217
  ficam intactos. `reason` obrigatório (1–500 caracteres).
- **D4 — Mesmas regras de elegibilidade** da criação (`resolveTripCrewForCreation`): ao menos um
  motorista, `can_drive` para motorista, `can_act_as_helper` para ajudante, ficha ativa, sem
  duplicata. O ajudante nunca ocupa a posição 1 (CHECK do banco).
- **D5 — Sem efeito, sem evento**: tripulação pedida igual à atual → `409 TRIP_CREW_UNCHANGED`, nada
  gravado.
- **D6 — Histórico**: tabela `trip_crew_events`, append-only, no molde de `trip_status_events`:
  tripulação anterior e nova (JSON de `{driverId, name, role, position}`), `actor_user_id`,
  `channel`, `reason`, `cost_before`, `cost_after`, `cost_difference` (`numeric(14,2)`),
  `mdfe_driver_divergence` (boolean). Entra na linha do tempo da viagem. Grava `audit_logs`.
- **D7 — Custo antes e depois** (emendada pela T1.1): soma das parcelas `driver` e `helper`, pelas
  **mesmas funções puras** que `readTripValuation` usa (`buildTripDriverCost`,
  `buildTripHelperCost`), extraídas para `trip-crew-cost.policy.ts` e chamadas também por
  `buildCostParcels` — uma conta só. **Antes e depois são calculados em memória, dentro da
  transação e sob `FOR NO KEY UPDATE`**, a partir da mesma leitura das fichas e das diárias. Não
  se lê `readContext` na transação (12 consultas em paralelo numa conexão só). `cost_before` e
  `cost_after` são arredondados a 2 casas e a diferença é `after − before` sobre os arredondados.
  Parcela com lacuna entra com o valor que a tela já mostra e o evento marca `cost_has_gaps`.
- **D8 — MDF-e**: a divergência é verdadeira quando o conjunto de **motoristas** (`role='driver'`)
  mudou e há MDF-e `authorized` para a viagem. Troca só de ajudante nunca diverge (ADR-0065).
- **D9 — App do motorista**: a viagem some da lista de quem saiu e aparece para quem entrou pelo
  vínculo, como já acontece (217 D6/D7). Ações offline pendentes de quem saiu são recusadas com
  403/404 e ficam em pendências; o escritório dá baixa em nome de quem **está** na tripulação.
  Push/sino continuam fora do escopo (217 D9).
- **D10 — Resumo financeiro por motorista** (`financial-summary.query.ts`): une o resultado
  congelado ao `trip_drivers` **atual**. Depois de uma transferência, o total por motorista da
  viagem migra para o novo. **Registrado como risco conhecido**, fora deste pedido.

## Requisitos

- **RF1** A ação `transferCrew` aparece em `allowed-actions` só na janela D1 e só para quem tem a
  permissão; o painel não decide por status.
- **RF2** A transferência troca `trip_drivers` e grava o evento **na mesma transação**, sob
  `FOR NO KEY UPDATE`, reconferindo a janela sob lock.
- **RF3** Veículo, rota, ETA, status e paradas ficam byte a byte como estavam.
- **RF4** O evento mostra, na linha do tempo, "Maria → João", o motivo, o autor, e a diferença de
  custo (positiva ou negativa), com o aviso de MDF-e quando houver.
- **RF5** Resposta da API traz `costDifference` e `mdfeDriverDivergence` para o painel avisar na
  hora.
- **RF6** O motorista que entra consegue continuar a viagem em andamento (despachar já feito,
  paradas já concluídas pelo anterior, iniciar rota idempotente).

## Fora do escopo

Trocar veículo na rua · incluir condutor no MDF-e · push/sino de atribuição · janela
`separating`/`loading` · congelar custo · reatribuir o resumo financeiro por motorista (D10).
