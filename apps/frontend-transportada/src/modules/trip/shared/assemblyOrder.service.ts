/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { AssemblyMapPoint } from './assemblyMap.service'

/**
 * A ordem que o operador monta no mapa, antes de a viagem existir.
 *
 * ⚠️ Ela é por **cidade**, e é o mesmo recorte do mapa: a parada da viagem nasce do endereço
 * normalizado, mas quem está montando enxerga município. Duas paradas na mesma cidade herdam a
 * posição da cidade e mantêm entre si a ordem em que foram bipadas.
 *
 * ⚠️ **Isto não é o roteirizador.** O OSRM entra em `plan-route`, depois da viagem criada, e pode
 * discordar — a proposta daqui é proximidade em linha reta, que é o que dá para saber sem estrada.
 * O texto da tela diz isso; trocar um pelo outro faria o operador ler distância rodada onde só há
 * distância no mapa.
 */
export type AssemblyCityOrder = readonly string[]

/**
 * A ordem nasce da chegada e **converge**: cidade nova entra no fim, cidade que saiu da seleção sai
 * da ordem. Recomeçar do zero a cada nota bipada apagaria o arranjo que o operador acabou de fazer.
 */
export function reconcileCityOrder(input: {
  readonly cityCodes: readonly string[]
  readonly order: AssemblyCityOrder
}): AssemblyCityOrder {
  const present = new Set(input.cityCodes)
  const kept = input.order.filter((code) => present.has(code))
  /**
   * ⚠️ O `known` cresce a cada cidade aceita, e não só com o que já estava na ordem: dez notas da
   * mesma cidade chegam como dez códigos iguais, e sem isto a cidade entrava repetida. A ordem com
   * entrada dobrada **não move**: `moveCity` acha a primeira, tira e devolve na posição da segunda,
   * que é a mesma lista — o botão de descer clicava e nada acontecia, sem erro nenhum.
   */
  const known = new Set(kept)
  const appended: string[] = []
  for (const code of input.cityCodes) {
    if (known.has(code) || isBlank(code)) continue
    known.add(code)
    appended.push(code)
  }
  return [...kept, ...appended]
}

export function moveCity(input: {
  readonly code: string
  readonly direction: -1 | 1
  readonly order: AssemblyCityOrder
}): AssemblyCityOrder {
  const index = input.order.indexOf(input.code)
  const target = index + input.direction
  if (index === -1 || target < 0 || target >= input.order.length) return input.order

  const next = [...input.order]
  const [moved] = next.splice(index, 1)
  if (moved === undefined) return input.order
  next.splice(target, 0, moved)
  return next
}

/**
 * Vizinho mais próximo a partir da **primeira cidade da ordem atual**, não de um ponto qualquer: o
 * operador costuma pôr primeiro a parada que já decidiu, e reescolher a origem desfaria essa
 * decisão sem avisar. Cidade sem ponto no mapa fica no fim, na ordem em que estava — ela não tem
 * como participar de uma conta de distância.
 */
export function proposeCityOrder(input: {
  readonly order: AssemblyCityOrder
  readonly points: readonly AssemblyMapPoint[]
}): AssemblyCityOrder {
  /**
   * ⚠️ Por **chave de parada**, não por `cityCode`: a ordem é feita de `cidade|CEP|número` (ver
   * `reconcileCityOrder`). Casando por cidade, `placed` saía vazio e a proposta era um no-op mudo.
   */
  const pointByCode = new Map(input.points.map((point) => [point.stopKey, point]))
  const placed = input.order.filter((code) => pointByCode.has(code))
  const unplaced = input.order.filter((code) => !pointByCode.has(code))
  if (placed.length < 3) return input.order

  const remaining = new Set(placed.slice(1))
  const proposal = [placed[0] ?? '']
  let current = pointByCode.get(proposal[0] ?? '')

  while (remaining.size > 0 && current !== undefined) {
    let nearest = ''
    let nearestDistance = Number.POSITIVE_INFINITY
    for (const code of remaining) {
      const candidate = pointByCode.get(code)
      if (candidate === undefined) continue
      const distance = (candidate.x - current.x) ** 2 + (candidate.y - current.y) ** 2
      if (distance >= nearestDistance) continue
      nearest = code
      nearestDistance = distance
    }
    if (nearest === '') break
    remaining.delete(nearest)
    proposal.push(nearest)
    current = pointByCode.get(nearest)
  }

  return [...proposal, ...remaining, ...unplaced]
}

/**
 * A ponte entre o que o operador arranjou e o que a viagem tem: as paradas já nasceram, cada uma
 * com a cidade dela, e aqui elas se põem na ordem das cidades.
 *
 * ⚠️ Parada cuja cidade não está na ordem **não é descartada** — ela vai para o fim na ordem em que
 * o servidor a devolveu. A rota de reordenação exige a lista completa das paradas da viagem, e uma
 * lista curta seria recusada com a viagem já criada.
 */
export function resolveStopOrder(input: {
  readonly order: AssemblyCityOrder
  /** `cityCode` chega **ausente** na parada servida por API anterior à spec 079 — daí o opcional. */
  /**
   * ⚠️ Casa por `addressKey`, não por cidade: a parada da viagem é o endereço, e duas paradas no
   * mesmo município teriam a mesma cidade e ordens diferentes.
   */
  readonly stops: readonly Readonly<{ addressKey?: null | string; id: string }>[]
}): readonly string[] {
  const rank = new Map(input.order.map((code, index) => [code, index]))
  return [...input.stops]
    .map((stop, index) => ({
      index,
      rank: rank.get(stop.addressKey ?? '') ?? Number.MAX_SAFE_INTEGER,
      stop,
    }))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map((entry) => entry.stop.id)
}

function isBlank(value: string): boolean {
  return value.trim() === ''
}
