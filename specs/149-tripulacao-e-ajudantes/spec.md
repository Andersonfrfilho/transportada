# Spec 149 — Tripulação com ajudantes, diária do ajudante e motorista recomendado pelo desempenho

> 🤖 Modelo: `opus` 🧠 (modelo de dados da tripulação, fórmula do score, aprendizado com a troca) ·
> `sonnet` (fiação API/front, contratos) · `haiku` (documentação)

## Problema

Em staging (14/09/2026), a proposta "Montar roteiro pela busca de notas" com 7 motoristas e 6 veículos
criou 5 das 6 viagens **sem motorista**. Causa medida no código:

- A montagem (`useTripRouteAssembly.hook.ts:223-230`) manda cada veículo com o motorista de
  `resolveSoleDriverOfVehicle` — só o do **vínculo único** do cadastro. Veículo sem vínculo, ou com dois,
  vai sem ninguém. Os motoristas escolhidos no campo "motoristas" não são distribuídos.
- A montagem **não usa** a escolha manual por veículo (`assignDriver` existe e só é usado no diálogo
  antigo `MultiVehicleSuggestionDialog`).
- O aceite cria cada viagem com 0 ou 1 linha em `trip_drivers` (`trip-composer.adapter.ts:64-80`), embora
  a viagem aceite até 10 (`MAX_DRIVERS_PER_TRIP`).

Além disso, a operação sai com **ajudantes**, e o produto não conhece o papel: não há onde dizer quem
acompanha o motorista, e a conta da viagem não tem a diária dele.

## Decisões do usuário (14/09/2026)

- **D1 — Ajudante é papel na tripulação, marcado no cadastro do motorista.** A ficha do motorista ganha
  "pode atuar como ajudante". A mesma pessoa pode dirigir numa viagem e ajudar em outra.
- **D2 — Diária do ajudante: valor geral parametrizado + valor próprio por ajudante quando necessário.**
  O próprio vence o geral.
- **D3 — O score de entregas combina taxa de entrega, ocorrências de entrega, pontualidade e
  comprovante.**
- **D4 — O sistema sugere o motorista; o operador pode trocar, e a troca serve para as sugestões
  futuras.**

## Decisões de desenho desta spec (padrões — o usuário pode mudar antes da Fase 1)

- **D5 — Papel na linha da viagem.** `trip_drivers.role` (`driver` | `helper`, VARCHAR com check, padrão
  `driver`). Migration aditiva: toda linha existente vira `driver`. A posição 1 é sempre um `driver`.
- **D6 — Ajudante não é condutor.** O MDF-e leva só `role = driver`; a ADR-0065 registra. O PWA continua
  achando a viagem por `trip_drivers` para os dois papéis (o ajudante com acesso vê a viagem).
- **D7 — Diária em dias de jornada.** Parcela nova `helper` na conta:
  `Σ(diária de cada ajudante) × dias`, com `dias = max(1, ceil(jornada estimada com a volta / 24 h))` na
  proposta e na viagem planejada. Diária ausente (nem própria nem geral) → parcela `missing` com lacuna
  `HELPER_DAILY_RATE_MISSING`, nunca zero silencioso. Sem ajudante → parcela zero, sem lacuna.
- **D8 — Score 0–100, janela de 90 dias, só como motorista (`role = driver`).**

  | Componente             | Peso | Medida                                                                                                                     |
  | ---------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------- |
  | Taxa de entrega        | 40   | notas `delivered_at` ÷ (entregues + `returned_at`)                                                                         |
  | Ocorrências de entrega | 25   | 1 − (notas com `recusa_total`, `recusa_parcial`, `avaria_transporte`, `destinatario_ausente` ÷ notas entregues/devolvidas) |
  | Pontualidade           | 20   | paradas com `arrived` dentro da janela de `trip_stop_schedules` ÷ paradas com janela                                       |
  | Comprovante            | 15   | notas entregues com ≥ 1 `trip_delivery_proofs` ÷ notas entregues                                                           |

  Componente sem denominador sai do cálculo e os pesos restantes são renormalizados. Menos de 10 notas na
  janela → "sem histórico" (sem número; entra depois dos que têm score, nunca como zero). O evento é
  atribuído a **todos os motoristas** da viagem (tripulação de dois motoristas divide o resultado).

- **D9 — Recomendação só preenche o que o cadastro não resolve.** Ordem: vínculo único do cadastro →
  recomendado → vazio. Recomendado = motorista ativo, não usado em outro par da mesma proposta, de maior
  `score + afinidade`. A linha diz a origem (`link` | `recommended` | `manual`) e o motivo.
- **D10 — A troca ensina por afinidade com o veículo.** Toda troca feita pelo operador na proposta grava
  `driver_assignment_feedback` (recomendado, escolhido, veículo). Afinidade (90 dias): +5 por vez que o
  operador escolheu o motorista para o veículo, −5 por vez que o recomendado foi trocado nesse veículo,
  limitada a ±15. O motivo aparece na tela ("escolhido por você 3× neste veículo").
  Viagem aceita com o recomendado conta como escolha também.
- **D11 — Ajudantes são escolhidos à mão** (sem recomendação nesta spec), só entre fichas com D1, e a
  mesma pessoa não aparece duas vezes na proposta (nem como motorista e ajudante).
- **D12 — A montagem passa a respeitar a escolha por veículo** (motorista e ajudantes por linha), e o
  aceite grava a tripulação editada — não o que foi pedido na criação.

## Requisitos funcionais

- **RF-1** Ficha do motorista: `can_act_as_helper` e `helper_daily_rate` (numeric, opcional).
- **RF-2** Parâmetro geral `company_crew_settings.helper_daily_rate`, com painel perto do efeito (aba de
  motoristas da frota, registrado em `SETTINGS_PANEL_PLACEMENT`).
- **RF-3** Proposta multi-veículo aceita `vehicles: [{vehicleId, driverId?, helperIds?}]`; a tripulação é
  editável depois da proposta pronta e antes do aceite (`PATCH /route-suggestions/:id/vehicles/:vehicleId/crew`).
- **RF-4** Aceite cria `trip_drivers` com motorista (posição 1) e ajudantes (`role = helper`).
- **RF-5** Conta da proposta e da viagem com a parcela `helper` (D7).
- **RF-6** `GET /fleet-drivers/performance` (`fleet.read`): score e componentes por motorista, uma consulta
  agregada (sem N+1).
- **RF-7** Criação da proposta preenche `recommended` (D9); troca registra feedback (D10).
- **RF-8** Tela: por veículo, select de motorista (com score e motivo) e multi-select de ajudantes;
  resumo "N viagens sem motorista" antes do botão de aceite.

## Fora do escopo

Recomendar ajudante; afinidade por cidade/região; diária do motorista; pagamento/folha do ajudante;
reconferir disponibilidade no aceite (segue ADR-0055).

## Critérios de aceite

1. Com 6 veículos sem vínculo e 7 motoristas ativos, a proposta nasce com 6 motoristas `recommended`
   distintos, ordenados pelo score.
2. Trocar o motorista de uma linha grava feedback; uma nova proposta com o mesmo veículo põe o escolhido
   à frente do antigo recomendado quando o score dos dois empata.
3. Viagem aceita com 1 motorista e 2 ajudantes: 3 linhas em `trip_drivers`, MDF-e com 1 condutor.
4. Conta com 2 ajudantes (diária própria de 150 e geral de 120) e jornada de 30 h = (150 + 120) × 2.
5. Ajudante sem diária própria e sem geral → parcela `missing` com `HELPER_DAILY_RATE_MISSING`.
6. Isolamento: score, feedback e parâmetros de outra empresa nunca aparecem (tenant-safety).
