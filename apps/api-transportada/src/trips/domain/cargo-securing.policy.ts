/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** tpCar `02` — carroceria fechada/baú. */
export const CLOSED_CARGO_BODY_TYPE = '02'

export type ResolveSecuresCargoParams = {
  /** A carroceria de quem carrega; `null` quando o veículo não foi encontrado. */
  readonly bodyType: string | null
  /** Um item por motorista da viagem — ficha ausente entra como `false`. */
  readonly driversSecureCargo: readonly boolean[]
}

/**
 * Spec 145 D21: no baú fechado as paredes seguram a pilha, e amarrar não muda nada. Nos outros
 * tipos vale a spec 100 — **o pior caso manda**: todo motorista amarra, e nenhum motorista é
 * ninguém amarrando. Detalhe, gatilho eager e prévia chamam esta função, e o hash depende disso.
 */
export function resolveSecuresCargo(params: ResolveSecuresCargoParams): boolean {
  if (params.bodyType === CLOSED_CARGO_BODY_TYPE) return true

  return (
    params.driversSecureCargo.length > 0 &&
    params.driversSecureCargo.every((securesCargo) => securesCargo)
  )
}
