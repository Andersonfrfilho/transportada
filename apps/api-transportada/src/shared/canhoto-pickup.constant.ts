/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 321 (D4, D6): a coleta de canhoto. `pending` nasce no registro da ocorrência (T2); `scheduled` é a coleta
 * encaixada pelo escritório numa viagem de outro motorista (T3); `collected` é o canhoto que chegou (T4); `cancelled`
 * é a ocorrência cancelada. Ocorrência deste tipo **aberta** = coleta em `CANHOTO_PICKUP_OPEN_STATUSES` (D6): selo,
 * lista, duplicidade e o andamento da 266 leem essa mesma definição.
 */
export const CANHOTO_PICKUP_STATUSES = ['pending', 'scheduled', 'collected', 'cancelled'] as const

export type CanhotoPickupStatus = (typeof CANHOTO_PICKUP_STATUSES)[number]

export const CANHOTO_PICKUP_OPEN_STATUSES = [
  'pending',
  'scheduled',
] as const satisfies readonly CanhotoPickupStatus[]
