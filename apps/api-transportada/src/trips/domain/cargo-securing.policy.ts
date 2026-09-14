/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** tpCar `02` — carroceria fechada/baú. */
export const CLOSED_CARGO_BODY_TYPE = '02'

export type ResolveCargoSecuringParams = {
  /** A carroceria de quem carrega; `null` quando o veículo não foi encontrado. */
  readonly bodyType: string | null
  /** Um item por motorista da viagem — ficha ausente entra como `false`. */
  readonly driversSecureCargo: readonly boolean[]
}

export type ResolveCargoSecuringResult = {
  /** Baú fechado: a pilha alta encosta na cabeceira e numa lateral, e o empacotador lê isso à parte. */
  readonly enclosedBody: boolean
  readonly securesCargo: boolean
}

/**
 * Spec 145 D23 (corrige a D21): parede de baú não é cinta — pilha alta solta no meio do baú cai do
 * mesmo jeito. `securesCargo` é só a spec 100, **o pior caso manda**: todo motorista amarra, e nenhum
 * motorista é ninguém amarrando. Detalhe, gatilho eager e prévia chamam esta função, e o hash depende
 * das duas saídas.
 */
export function resolveCargoSecuring(
  params: ResolveCargoSecuringParams,
): ResolveCargoSecuringResult {
  return {
    enclosedBody: params.bodyType === CLOSED_CARGO_BODY_TYPE,
    securesCargo:
      params.driversSecureCargo.length > 0 &&
      params.driversSecureCargo.every((securesCargo) => securesCargo),
  }
}
