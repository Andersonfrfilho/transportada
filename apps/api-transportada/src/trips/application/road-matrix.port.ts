/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RouteGeometryPoint } from '../domain/route-geometry.policy.js'

/**
 * Spec 323 T3: a matriz N×N pela estrada entre todos os pontos pedidos (linha = origem, coluna = destino), na ordem
 * pedida. O ordenador do rascunho põe o barracão no ponto 0. `null` numa célula é o par sem estrada.
 */
export type RoadMatrix = Readonly<{
  distancesMetres: readonly (readonly (number | null)[])[]
  durationsSeconds: readonly (readonly (number | null)[])[]
}>

/**
 * Uma chamada só. Devolve `null` inteiro quando o serviço falhou (fora do ar, tempo esgotado, resposta que não casa) e
 * nunca lança: quem chama deixa a ordem de chegada com `ROUTING_MATRIX_UNAVAILABLE` e não cai para a linha reta.
 */
export type RoadMatrixPort = {
  readMatrix(points: readonly RouteGeometryPoint[]): Promise<RoadMatrix | null>
}
