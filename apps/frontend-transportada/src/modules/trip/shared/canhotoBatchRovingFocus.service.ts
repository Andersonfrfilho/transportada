/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 222 T8.1: para onde o foco do maço vai. A grade é uma parada de Tab só, e as setas andam
 * entre as notas — sem isto, o teto de 40 canhotos custa 80 paradas antes do botão de aprovar.
 *
 * A grade tem coluna variável (uma só no celular, `auto-fill` a partir de 15rem no monitor), então
 * não há linha nem coluna para mapear: os quatro sentidos andam um item, como numa lista.
 */

/** Setas não dão a volta (WAI-ARIA APG): a ponta é informação, e a volta esconde que chegou nela. */
const ROVING_STEPS = {
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -1,
} as const

const EDGE_KEYS = { End: 'last', Home: 'first' } as const

type ResolveRovingDocumentIdParams = Readonly<{
  /** Notas que ainda podem ser conferidas, na ordem da viagem — foto quebrada fica fora. */
  eligibleIds: readonly string[]
  requestedId: string | undefined
}>

type MoveRovingDocumentIdParams = Readonly<{
  eligibleIds: readonly string[]
  fromId: string | undefined
  key: string
}>

/**
 * O alvo do foco, derivado: a nota pedida enquanto ela serve, senão a primeira que serve. A foto
 * resolve depois do render, então a nota em foco pode virar inconferível sem ninguém tocar em nada.
 */
export function resolveRovingDocumentId({
  eligibleIds,
  requestedId,
}: ResolveRovingDocumentIdParams): string | undefined {
  if (requestedId !== undefined && eligibleIds.includes(requestedId)) return requestedId
  return eligibleIds[0]
}

/** `undefined` quando a tecla não navega — Espaço e Enter são de quem está em foco, não da grade. */
export function moveRovingDocumentId({
  eligibleIds,
  fromId,
  key,
}: MoveRovingDocumentIdParams): string | undefined {
  const current = resolveRovingDocumentId({ eligibleIds, requestedId: fromId })
  if (current === undefined) return undefined

  const edge = EDGE_KEYS[key as keyof typeof EDGE_KEYS]
  if (edge !== undefined) {
    return edge === 'first' ? eligibleIds[0] : eligibleIds[eligibleIds.length - 1]
  }

  const step = ROVING_STEPS[key as keyof typeof ROVING_STEPS]
  if (step === undefined) return undefined

  const target = eligibleIds.indexOf(current) + step
  if (target < 0 || target >= eligibleIds.length) return current
  return eligibleIds[target]
}
