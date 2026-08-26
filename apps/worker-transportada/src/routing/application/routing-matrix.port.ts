/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type RoutingCoordinate = Readonly<{ latitude: string; longitude: string }>

/**
 * A matriz N×N que o solver lê milhares de vezes por sugestão. `durationsSeconds[i][j]` é o tempo de
 * `i` para `j`; `distancesMeters` idem. Assimétrica de propósito — mão única existe, e uma matriz
 * simétrica esconderia exatamente o erro que a ADR-0044 §1 diz que o motorista percebe.
 *
 * `null` numa célula é par inalcançável: ilha sem estrada, ponte fora, endereço errado. Quem chama
 * separa a parada e avisa, em vez de somar um número inventado.
 */
export type RoutingMatrix = Readonly<{
  distancesMeters: readonly (readonly (number | null)[])[]
  durationsSeconds: readonly (readonly (number | null)[])[]
}>

/**
 * ADR-0044 §2: a porta é o que torna a troca por Google Distance Matrix — quando tráfego em tempo
 * real virar requisito — um adaptador novo, e não uma reescrita da otimização.
 *
 * Lança quando o serviço não responde. **Não devolve haversine.** Um resultado ruim disfarçado de
 * bom é pior que ausência: quem chama transforma a exceção em sugestão `failed` com código estável,
 * e a tela oferece ordenar à mão (ADR-0044 §1 e §5).
 */
export type RoutingMatrixPort = Readonly<{
  table: (coordinates: readonly RoutingCoordinate[]) => Promise<RoutingMatrix>
}>

/**
 * A mesma viagem pedida duas vezes seguidas não pede matriz duas vezes (RNF). A chave é o conjunto
 * de coordenadas **na ordem em que entram**, porque a matriz é indexada por posição — reordenar as
 * paradas produz outra matriz, ainda que o conjunto de pontos seja o mesmo.
 */
export function buildMatrixCacheKey(coordinates: readonly RoutingCoordinate[]): string {
  return coordinates.map((point) => `${point.latitude},${point.longitude}`).join(';')
}
