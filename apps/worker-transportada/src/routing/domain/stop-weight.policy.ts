/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type StopWeightDocument = {
  /** A soma do `pesoB` dos volumes da nota. Ausência e zero dizem a mesma coisa: não declarado. */
  readonly grossWeight: string | null
  /** A soma do `qVol`, único sinal de tamanho que a nota sem massa ainda traz. */
  readonly quantity: string | null
}

export type ResolveStopWeightParams = {
  readonly defaultWeightPerVolume: string | null
  readonly documents: readonly StopWeightDocument[]
  readonly fallbackWeightKilograms: string
}

export type ResolvedStopWeight = {
  /** Verdadeiro quando **alguma** nota da parada não trouxe massa medida. */
  readonly estimated: boolean
  readonly weightKilograms: number
}

function toNumber(value: string | null): number {
  if (value === null) return 0
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * O peso que o solver usa para decidir capacidade. A precedência é a mesma da spec 067 na listagem
 * de notas — `pesoB` declarado → `qVol × peso padrão da empresa` → ausência —, porque duas ordens
 * diferentes fariam a tela e o roteirizador discordarem sobre a mesma nota.
 *
 * ⚠️ Aqui a ausência **não** é ausência: o solver precisa de um número para não mandar carga a mais
 * a um caminhão que ele acredita vazio. Ela cai em `fallback_weight_kilograms`, que deixa de ser
 * peso de parada e passa a ser peso **por nota sem medida** — com uma nota só, que é o caso de
 * ontem, o resultado é idêntico ao de antes.
 *
 * Medido em 2026-09-05: 344 das 345 notas trazem `pesoB`, e a média da empresa cobria de 13 kg a
 * 336 kg com o mesmo número. Era essa faixa de 25× que o roteirizador não enxergava.
 */
export function resolveStopWeight({
  defaultWeightPerVolume,
  documents,
  fallbackWeightKilograms,
}: ResolveStopWeightParams): ResolvedStopWeight {
  const fallback = toNumber(fallbackWeightKilograms)
  if (documents.length === 0) return { estimated: true, weightKilograms: fallback }

  const perVolume = toNumber(defaultWeightPerVolume)
  let total = 0
  let estimated = false

  for (const document of documents) {
    const declared = toNumber(document.grossWeight)
    if (declared > 0) {
      total += declared
      continue
    }

    estimated = true
    const quantity = toNumber(document.quantity)
    total += perVolume > 0 && quantity > 0 ? perVolume * quantity : fallback
  }

  return { estimated, weightKilograms: total }
}
