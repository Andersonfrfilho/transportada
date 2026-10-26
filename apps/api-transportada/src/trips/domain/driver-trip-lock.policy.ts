/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Trava de uma viagem por vez no pedido de prorrogação do motorista. Regra pura, sem I/O.
 *
 * A viagem **atual** é a mais antiga das que estão na rua — a mesma que "Conferir carga" e "Iniciar rota"
 * alcançam. Nota de viagem concluída nunca é travada (o cliente pede a prorrogação depois da entrega) e a
 * viagem que ainda não saiu já é inalcançável pelo registro. Só trava o motorista que tem outra viagem mais
 * antiga na rua e **nota abaixo do corte**; sem nota (nenhuma entrega com foto em 90 dias) conta como abaixo.
 */
export type DriverTripLockInput = {
  readonly enabled: boolean
  readonly minimumScore: number
  /** As viagens do motorista na rua agora, da mais antiga para a mais nova. */
  readonly onRoadTripIds: readonly string[]
  readonly score: null | number
  readonly tripId: string
}

export function isDriverTripLocked(input: DriverTripLockInput): boolean {
  if (!input.enabled) return false
  const position = input.onRoadTripIds.indexOf(input.tripId)
  if (position <= 0) return false
  return input.score === null || input.score < input.minimumScore
}
