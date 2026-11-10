/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 T2 (D4, D4c, D6): as regras puras da coleta de canhoto.
 */
import {
  CANHOTO_PICKUP_OPEN_STATUSES,
  type CanhotoPickupStatus,
} from '../../shared/canhoto-pickup.constant.js'
import type { DuplicateRequestPolicy } from '../../shared/occurrence-contractor-reply.constant.js'

/** A marca ausente vale `false`: só os dublês de teste a omitem; a leitura real sempre a traz. */
export function occurrenceTypeCreatesCanhotoPickup(type: {
  readonly createsCanhotoPickup?: boolean | undefined
}): boolean {
  return type.createsCanhotoPickup === true
}

export type PickupCargoCountingDecision =
  | { readonly kind: 'refuse' }
  | { readonly kind: 'write'; readonly countsCargoOnPickupTrip: boolean | undefined }

/**
 * Spec 321 D4c: na fase 1 a coleta **não** soma carga na viagem que a busca, porque ela não é linha de
 * `trip_documents` e nenhum leitor de carga a conta. Então o tipo **com coleta** (`createsCanhotoPickup`, gravado ou
 * pedido) só aceita `countsCargoOnPickupTrip = false`:
 *
 * - `true` explícito é recusado (422) — prometeria uma conta que ninguém faz;
 * - ausente vira `false` quando o gravado (ou o padrão da coluna, na criação) é `true`, para o tipo com coleta nunca
 *   ficar gravado com uma promessa que não vale; já gravado `false`, ausente segue "não mexa".
 *
 * Tipo **sem** coleta: a marca não tem efeito nenhum, e o valor pedido passa como veio (inclusive `true`).
 */
export function resolvePickupCargoCounting(params: {
  readonly storedCountsCargo: boolean | undefined
  readonly storedCreatesPickup: boolean | undefined
  readonly requestedCountsCargo: boolean | undefined
  readonly requestedCreatesPickup: boolean | undefined
}): PickupCargoCountingDecision {
  const createsPickup = params.requestedCreatesPickup ?? params.storedCreatesPickup ?? false
  if (!createsPickup) {
    return { countsCargoOnPickupTrip: params.requestedCountsCargo, kind: 'write' }
  }
  if (params.requestedCountsCargo === true) return { kind: 'refuse' }
  if (params.requestedCountsCargo === false) {
    return { countsCargoOnPickupTrip: false, kind: 'write' }
  }
  return params.storedCountsCargo === false
    ? { countsCargoOnPickupTrip: undefined, kind: 'write' }
    : { countsCargoOnPickupTrip: false, kind: 'write' }
}

/** D6: a coleta aberta é a ocorrência deste tipo aberta. */
export function isCanhotoPickupOpen(status: CanhotoPickupStatus): boolean {
  return (CANHOTO_PICKUP_OPEN_STATUSES as readonly CanhotoPickupStatus[]).includes(status)
}

/**
 * D1/D6: o tipo com coleta vale `until_resolved` qualquer que seja a política gravada — duas coletas abertas da mesma
 * entrega nunca existem (o índice parcial do banco também recusa). Tipo sem coleta segue a política dele.
 */
export function effectiveDuplicateRequestPolicy(params: {
  readonly createsCanhotoPickup: boolean
  readonly policy: DuplicateRequestPolicy
}): DuplicateRequestPolicy {
  return params.createsCanhotoPickup ? 'until_resolved' : params.policy
}
