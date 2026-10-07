/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord } from './tripGuards.validation'

type ToleranceKeys = Readonly<{ allowed: readonly string[]; required: readonly string[] }>

function pickKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const picked: Record<string, unknown> = {}
  for (const key of keys) {
    if (key in value) picked[key] = value[key]
  }
  return picked
}

/**
 * Chave desconhecida é **descartada**, nunca repassada: a proteção contra vazamento (spec 078 D1)
 * continua inteira — token, identidade de tenant e XML fiscal não atravessam —, só deixa de custar a
 * viagem inteira. Campo opcional com forma errada cai com o resto dos opcionais daquele objeto; os
 * obrigatórios seguem estritos, porque sem eles a tela não tem o que mostrar.
 */
export function readTolerantRecord<TValue>(
  value: unknown,
  input: Readonly<{ guard: (candidate: unknown) => candidate is TValue }> & ToleranceKeys,
): TValue | undefined {
  if (!isRecord(value)) return undefined
  const withOptionals = pickKeys(value, input.allowed)
  if (input.guard(withOptionals)) return withOptionals
  const requiredOnly = pickKeys(value, input.required)
  return input.guard(requiredOnly) ? requiredOnly : undefined
}

/** Lista cujo item não casa nem só com os obrigatórios reprova inteira: item sumido esconderia nota. */
export function readTolerantList<TItem>(
  value: unknown,
  readItem: (item: unknown) => TItem | undefined,
): readonly TItem[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items: TItem[] = []
  for (const entry of value as readonly unknown[]) {
    const item = readItem(entry)
    if (item === undefined) return undefined
    items.push(item)
  }
  return items
}
