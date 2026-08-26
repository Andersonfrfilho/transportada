/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O problema, como o solver o vê. **Nenhum I/O** (RF-10): matriz + restrições entram, sequência sai.
 * É isso que torna a suíte de baseline da ADR-0044 §4 possível — um solver que busca a própria
 * matriz não pode ser rodado contra instâncias da literatura.
 *
 * Índices, não ids: `0` é o depósito de partida, e as paradas são `1..n`. O depósito de chegada, se
 * for outro lugar, é o último índice. Trabalhar por índice é o que faz a matriz ser acesso a array.
 */
export type RouteProblem = Readonly<{
  /** `durationsSeconds[i][j]`, em segundos. `null` é par inalcançável. */
  durationsSeconds: readonly (readonly (number | null)[])[]
  distancesMeters: readonly (readonly (number | null)[])[]
  /** Índice do ponto de partida — sempre existe (ADR-0044 §5: toda otimização parte de um ponto). */
  depotIndex: number
  /**
   * Índice do ponto de chegada. Igual a `depotIndex` para voltar ao barracão; `null` para terminar
   * na última parada — o motorista que mora do outro lado da cidade e fecha o dia perto de casa é
   * caso real, e ignorá-lo produz um roteiro que ele reordena todo dia.
   */
  endIndex: number | null
  stops: readonly RouteStopInput[]
  vehicles: readonly RouteVehicleInput[]
  /** ADR-0044 §8: sem semente explícita o resultado não é reprodutível nem depurável. */
  seed: number
  /** Teto em milissegundos. Estourou, devolve o melhor encontrado marcado como truncado. */
  timeBudgetMilliseconds: number
  /** Gerações sem melhora que encerram antes do orçamento. */
  stagnationLimit: number
  duty: RouteDutyLimits | null
}>

export type RouteStopInput = Readonly<{
  /** Posição na matriz. */
  index: number
  weightKilograms: number
  serviceTimeSeconds: number
  /** Segundos a partir do início da jornada; `null` dos dois lados é "sem janela". */
  windowStartSeconds: number | null
  windowEndSeconds: number | null
}>

export type RouteVehicleInput = Readonly<{
  id: string
  capacityKilograms: number
  /** Custo por quilômetro, em centavos por metro para caber em inteiro — dinheiro não é float. */
  costPerMeterMicros: number
}>

/**
 * ADR-0044 §4 e spec 058 D6b. Nulo em qualquer campo é "não é restrição aqui": distribuição urbana
 * com retorno ao barracão não se parece com viagem interestadual, e uma restrição rígida no lugar
 * errado empobrece a solução sem proteger ninguém.
 */
export type RouteDutyLimits = Readonly<{
  maxDrivingSeconds: number | null
  maxDutySeconds: number | null
  mandatoryBreakSeconds: number | null
  breakEverySeconds: number | null
}>

export type RouteViolation = Readonly<{
  kind: 'delivery_window' | 'duty_time' | 'unreachable' | 'weight'
  /** Quanto falta: quilos acima da capacidade, segundos fora da janela. Número, nunca "estourou". */
  amount: number
  stopIndex: number | null
  vehicleId: string
}>

export type RouteAssignment = Readonly<{
  vehicleId: string
  /** Só as paradas, na ordem de visita — sem os depósitos, que são do problema e não da solução. */
  stopIndexes: readonly number[]
  distanceMeters: number
  durationSeconds: number
  costMicros: number
}>

export type RouteSolution = Readonly<{
  assignments: readonly RouteAssignment[]
  /** Paradas que nenhum veículo comportou. Elas vêm listadas, não empurradas estourando o peso. */
  unassignedStopIndexes: readonly number[]
  violations: readonly RouteViolation[]
  totalCostMicros: number
  totalDistanceMeters: number
  totalDurationSeconds: number
  /** O orçamento cortou antes da convergência; o melhor encontrado veio mesmo assim. */
  truncated: boolean
  generations: number
}>
