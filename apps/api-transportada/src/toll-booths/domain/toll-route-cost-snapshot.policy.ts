/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A leitura de `trips.planned_toll` é fronteira (spec 090 T11): o valor sai de uma coluna `jsonb`,
 * e nada garante que o que está lá tem a forma de `TollRouteCost` — schema mudou, linha escrita por
 * uma versão antiga, coluna editada à mão. `parseTollRouteCost` é o único portão: forma inesperada
 * vira ausência (`null`), nunca um objeto meio preenchido — a mesma regra dos outros payloads
 * congelados do produto (`trip_dispatch_snapshots`, `cte_issuance_payloads`).
 */
import {
  AXLE_COUNT_SOURCES,
  TOLL_PAYMENT_MODES,
  type TollBoothRecord,
  type TollRouteCost,
} from './toll-route-cost.policy.js'

const AXLE_COUNT_SOURCE_SET = new Set<string>(AXLE_COUNT_SOURCES)
const TOLL_PAYMENT_MODE_SET = new Set<string>(TOLL_PAYMENT_MODES)

/**
 * O congelado do momento do planejamento (spec 090 T11) — o mesmo `TollRouteCost` que a prévia já
 * calcula, sem `tariffObservedOn`: a data da tarifa é informação de leitura fresca do catálogo, e
 * congelar a viagem não congela junto a data de observação de quando o roteiro foi planejado.
 */
export function parseTollRouteCost(value: unknown): TollRouteCost | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  const axles = parseAxleCount(record.axles)
  if (axles === null) return null

  const booths = parseBooths(record.booths)
  if (booths === null) return null

  const { boothsFallenBackToManual, boothsWithoutCharge, chargePerAxle, paymentMode, total } =
    record
  if (typeof boothsFallenBackToManual !== 'number') return null
  if (typeof boothsWithoutCharge !== 'number') return null
  if (typeof chargePerAxle !== 'string') return null
  if (typeof paymentMode !== 'string' || !TOLL_PAYMENT_MODE_SET.has(paymentMode)) return null
  if (typeof total !== 'string') return null

  return {
    axles,
    booths,
    /**
     * ⚠️ **Congelado antes da categoria não é recomputado.** Valor sem `multiplier` foi somado com o
     * multiplicador antigo — a contagem de eixos —, e é esse número que está gravado em `total`.
     * Devolver a fração de hoje faria o rótulo contradizer o total ao lado dele, no único lugar do
     * produto que existe para dizer por que a viagem custou o que custou.
     */
    multiplier: parseMultiplier(record.multiplier) ?? { denominator: 1, numerator: axles.count },
    boothsFallenBackToManual,
    boothsWithoutCharge,
    chargePerAxle,
    paymentMode: paymentMode as TollRouteCost['paymentMode'],
    total,
  }
}

function parseAxleCount(value: unknown): TollRouteCost['axles'] | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.count !== 'number') return null
  if (typeof record.source !== 'string' || !AXLE_COUNT_SOURCE_SET.has(record.source)) return null

  return { count: record.count, source: record.source as TollRouteCost['axles']['source'] }
}

function parseMultiplier(value: unknown): null | { denominator: number; numerator: number } {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>
  if (typeof record.denominator !== 'number' || record.denominator <= 0) return null
  if (typeof record.numerator !== 'number') return null

  return { denominator: record.denominator, numerator: record.numerator }
}

function parseBooths(value: unknown): readonly TollBoothRecord[] | null {
  if (!Array.isArray(value)) return null

  const booths: TollBoothRecord[] = []
  for (const entry of value) {
    const booth = parseBooth(entry)
    if (booth === null) return null
    booths.push(booth)
  }

  return booths
}

function parseBooth(value: unknown): TollBoothRecord | null {
  if (typeof value !== 'object' || value === null) return null
  const record = value as Record<string, unknown>

  if (!isNullableString(record.chargeCar)) return null
  if (!isNullableString(record.chargePerAxle)) return null
  if (!isNullableString(record.chargePerAxleAutomatic)) return null
  if (typeof record.latitude !== 'string') return null
  if (typeof record.longitude !== 'string') return null
  if (!isNullableString(record.name)) return null
  if (!isNullableString(record.operator)) return null
  if (typeof record.osmNodeId !== 'number') return null

  return {
    chargeCar: record.chargeCar as null | string,
    chargePerAxle: record.chargePerAxle as null | string,
    chargePerAxleAutomatic: record.chargePerAxleAutomatic as null | string,
    latitude: record.latitude,
    longitude: record.longitude,
    name: record.name as null | string,
    operator: record.operator as null | string,
    osmNodeId: record.osmNodeId,
  }
}

function isNullableString(value: unknown): value is null | string {
  return value === null || typeof value === 'string'
}

/**
 * L5 (revisão final da 153): `parseBooth` acima é estrito de propósito — só reconhece os campos de
 * `TollBoothRecord`, a observação. `legIndex` (em que trecho a praça cai) viaja junto no jsonb
 * porque `freeze-trip-planned-route.use-case.ts` congela a linha inteira do extrato, não só o
 * registro (ver o comentário de `toFrozenToll`); este parser é a fronteira **só** desse campo.
 *
 * ⚠️ Nunca falha o pedágio inteiro por causa dele — uma praça sem `legIndex` gravado (linha
 * anterior a esta correção, ou forma inesperada) simplesmente some do mapa, e a leitura volta a
 * mostrar `null` para ela, honesto sobre o que não se sabe.
 */
export function parseFrozenBoothLegIndexes(value: unknown): ReadonlyMap<number, null | number> {
  const legIndexByNode = new Map<number, null | number>()
  if (typeof value !== 'object' || value === null) return legIndexByNode

  const booths = (value as Record<string, unknown>).booths
  if (!Array.isArray(booths)) return legIndexByNode

  for (const entry of booths) {
    if (typeof entry !== 'object' || entry === null) continue
    const record = entry as Record<string, unknown>
    if (typeof record.osmNodeId !== 'number') continue
    if (record.legIndex !== null && typeof record.legIndex !== 'number') continue
    legIndexByNode.set(record.osmNodeId, record.legIndex)
  }

  return legIndexByNode
}
