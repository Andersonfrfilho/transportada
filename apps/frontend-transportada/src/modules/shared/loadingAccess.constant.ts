/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * ⚠️ **Cópia por valor** de `api-transportada/src/shared/loading-access.constant.ts` — o bundle não
 * carrega código da API, o mesmo caso de `VEHICLE_TYPES` e `FUEL_TYPES`. Mudou de um lado? mude do
 * outro; quem guarda a paridade é `test/fleet/loading-access.contract.ts`.
 *
 * A ordem é do mais restritivo ao mais aberto, e é ela que o select imprime.
 */
export const LOADING_ACCESS_KINDS = ['rear', 'rear_and_side', 'open'] as const

export type LoadingAccess = (typeof LOADING_ACCESS_KINDS)[number]
