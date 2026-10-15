/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverOccurrenceFlow, DriverOccurrenceType } from './driverTrip.types'

/**
 * A lista de tipos do registro de ocorrência: busca, "Mais usados" e grupos. Nada aqui conhece nome
 * de tipo (CA4 da spec 255): o grupo é o `flow` que a API já manda, e o "mais usado" é a contagem de
 * registros deste aparelho.
 */
const OCCURRENCE_TYPE_USAGE_STORAGE_KEY = 'transportada.driver.occurrence-type-usage.v1'

/** Quantos tipos entram em "Mais usados"; só aparece quando há mais tipos do que isso. */
export const FREQUENT_OCCURRENCE_TYPE_LIMIT = 3

export type OccurrenceTypeUsage = Readonly<Record<string, number>>

export type OccurrenceTypeUsageStorage = Pick<Storage, 'getItem' | 'setItem'>

export type OccurrenceTypeGroup = Readonly<{
  flow: DriverOccurrenceFlow
  types: readonly DriverOccurrenceType[]
}>

export type OccurrenceTypeList = Readonly<{
  frequent: readonly DriverOccurrenceType[]
  groups: readonly OccurrenceTypeGroup[]
}>

export function resolveOccurrenceTypeUsageStorage(): OccurrenceTypeUsageStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

export function readOccurrenceTypeUsage(
  storage: OccurrenceTypeUsageStorage | null,
): OccurrenceTypeUsage {
  try {
    const raw = storage?.getItem(OCCURRENCE_TYPE_USAGE_STORAGE_KEY)
    if (raw == null) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const usage: Record<string, number> = {}
    for (const [id, count] of Object.entries(parsed)) {
      if (typeof count === 'number' && Number.isInteger(count) && count > 0) usage[id] = count
    }
    return usage
  } catch {
    return {}
  }
}

/** Contar um uso é conveniência: falhar ao gravar (cota, modo privado) não muda o registro. */
export function recordOccurrenceTypeUse(input: {
  readonly storage: OccurrenceTypeUsageStorage | null
  readonly typeId: string
}): void {
  try {
    const usage = readOccurrenceTypeUsage(input.storage)
    const next = { ...usage, [input.typeId]: (usage[input.typeId] ?? 0) + 1 }
    input.storage?.setItem(OCCURRENCE_TYPE_USAGE_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // A ordem desta abertura segue valendo.
  }
}

/** Minúsculas e sem acento: "devolucao" acha "Devolução". */
export function normalizeOccurrenceTypeQuery(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}

const FLOW_ORDER: readonly DriverOccurrenceFlow[] = ['stop', 'document']

/**
 * Sem busca: os mais usados primeiro (só os que já foram usados, e só quando a lista é maior que o
 * limite), depois um grupo por `flow`, cada um com os mais usados na frente. Com busca: uma lista só
 * de grupos, sem "Mais usados", porque o motorista já disse o que procura.
 */
export function buildOccurrenceTypeList(input: {
  readonly query: string
  readonly types: readonly DriverOccurrenceType[]
  readonly usage: OccurrenceTypeUsage
}): OccurrenceTypeList {
  const query = normalizeOccurrenceTypeQuery(input.query)
  const used = (type: DriverOccurrenceType): number => input.usage[type.id] ?? 0
  const matching = input.types.filter(
    (type) => query === '' || normalizeOccurrenceTypeQuery(type.name).includes(query),
  )
  const byUse = matching
    .map((type, index) => ({ index, type }))
    .sort((a, b) => used(b.type) - used(a.type) || a.index - b.index)
    .map(({ type }) => type)

  const frequent =
    query === '' && input.types.length > FREQUENT_OCCURRENCE_TYPE_LIMIT
      ? byUse.filter((type) => used(type) > 0).slice(0, FREQUENT_OCCURRENCE_TYPE_LIMIT)
      : []

  const groups = FLOW_ORDER.map((flow) => ({
    flow,
    types: byUse.filter((type) => (type.flow ?? 'document') === flow),
  })).filter((group) => group.types.length > 0)

  return { frequent, groups }
}
