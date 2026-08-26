/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  RoutingCoordinate,
  RoutingMatrix,
  RoutingMatrixPort,
} from '../application/routing-matrix.port.js'
import { RoutingMatrixUnavailableError } from '../domain/routing-matrix.error.js'

/**
 * O `/table` do OSRM (ADR-0044 §2). Devolve a matriz completa em milissegundos para o N que
 * interessa — dezenas a centenas de paradas —, e é por isso que a matriz é hospedada: avaliar uma
 * sequência vira acesso a array, e o solver pode ser tão guloso quanto a qualidade exigir.
 *
 * OSRM fala `lon,lat`, ao contrário de quase todo o resto. Trocar a ordem não dá erro: dá uma rota
 * plausível no lugar errado do mundo.
 */
type OsrmTableResponse = Readonly<{
  code: string
  distances?: readonly (readonly (number | null)[])[]
  durations?: readonly (readonly (number | null)[])[]
}>

const OK_CODE = 'Ok'

export type OsrmRoutingMatrixGatewayInput = Readonly<{
  baseUrl: string
  fetchImplementation?: typeof fetch
  timeoutMilliseconds?: number
}>

const DEFAULT_TIMEOUT_MILLISECONDS = 15_000

export function createOsrmRoutingMatrixGateway(
  input: OsrmRoutingMatrixGatewayInput,
): RoutingMatrixPort {
  const fetchImplementation = input.fetchImplementation ?? fetch
  const timeout = input.timeoutMilliseconds ?? DEFAULT_TIMEOUT_MILLISECONDS

  return {
    async table(coordinates: readonly RoutingCoordinate[]): Promise<RoutingMatrix> {
      if (coordinates.length === 0) return { distancesMeters: [], durationsSeconds: [] }

      const path = coordinates.map((point) => `${point.longitude},${point.latitude}`).join(';')
      const url = `${input.baseUrl.replace(/\/$/u, '')}/table/v1/driving/${path}?annotations=duration,distance`

      const response = await fetchWithTimeout({ fetchImplementation, timeout, url })
      if (!response.ok) throw new RoutingMatrixUnavailableError({ status: response.status })

      const payload = (await response.json()) as OsrmTableResponse
      if (payload.code !== OK_CODE) throw new RoutingMatrixUnavailableError({ code: payload.code })

      const durationsSeconds = payload.durations
      const distancesMeters = payload.distances
      // Sem uma das duas metades não há como custear a rota, e meia matriz não é matriz
      if (durationsSeconds === undefined || distancesMeters === undefined) {
        throw new RoutingMatrixUnavailableError({ code: 'incomplete-table' })
      }

      return { distancesMeters, durationsSeconds }
    },
  }
}

async function fetchWithTimeout(input: {
  readonly fetchImplementation: typeof fetch
  readonly timeout: number
  readonly url: string
}): Promise<Response> {
  try {
    return await input.fetchImplementation(input.url, {
      signal: AbortSignal.timeout(input.timeout),
    })
  } catch (cause) {
    /**
     * Rede fora, DNS, timeout — tudo vira o mesmo erro de domínio. A camada de cima o transforma em
     * sugestão `failed`; ela **nunca** cai em haversine (ADR-0044 §1).
     */
    throw new RoutingMatrixUnavailableError({ cause })
  }
}
