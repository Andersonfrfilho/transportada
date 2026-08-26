/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A **forma** do que a API guarda e devolve — não o algoritmo, que roda no worker (ADR-0044 §7). A
 * API cria a sugestão, enfileira e serve o resultado; ela nunca resolve nada.
 *
 * ⚠️ Cópia por valor de `worker-transportada/src/routing/domain/route-solver.types.ts`, na mesma
 * convenção que os schemas compartilhados já usam. A paridade é contrato de teste; um import
 * relativo atravessando apps quebraria a publicação independente de cada uma.
 */

/** ADR-0044 §5: a violação aparece explícita na proposta, nunca escondida numa ordem pior. */
export type RouteViolation = Readonly<{
  /** Quanto falta: quilos acima da capacidade, segundos fora da janela. Número, nunca "estourou". */
  amount: number
  kind: 'delivery_window' | 'duty_time' | 'unreachable' | 'weight'
  stopIndex: number | null
  vehicleId: string
}>

/**
 * Spec 058 D6b. Nulo em qualquer campo é "não é restrição aqui": distribuição urbana com retorno ao
 * barracão não se parece com viagem interestadual, e uma restrição rígida no lugar errado empobrece
 * a solução sem proteger ninguém.
 */
export type RouteDutyLimits = Readonly<{
  maxDrivingSeconds: number | null
  maxDutySeconds: number | null
  mandatoryBreakSeconds: number | null
  breakEverySeconds: number | null
}>
