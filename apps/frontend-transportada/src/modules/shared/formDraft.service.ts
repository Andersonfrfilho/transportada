/* Copyright (c) 2026 Ada Technology. MIT License. */
export type FormDraftStorage = Readonly<{
  getItem: (key: string) => null | string
  removeItem: (key: string) => void
  setItem: (key: string, value: string) => void
}>

type ReadInput<TField extends string> = Readonly<{
  fields: readonly TField[]
  storage: FormDraftStorage | null
  storageKey: string
}>

type WriteInput<TField extends string> = Readonly<{
  draft: Readonly<Record<TField, string>>
  fields: readonly TField[]
  storage: FormDraftStorage | null
  storageKey: string
}>

type ClearInput = Readonly<{
  storage: FormDraftStorage | null
  storageKey: string
}>

export function resolveFormDraftStorage(): FormDraftStorage | null {
  return typeof window === 'undefined' ? null : window.localStorage
}

/**
 * O rascunho é entrada não confiável — ele sobrevive a versão de campo que mudou de nome e a quem
 * edita o armazenamento à mão. Só campo declarado e valor de texto volta para o formulário; o
 * resto é descartado em silêncio, porque cadastro pela metade é melhor que formulário quebrado.
 */
export function readFormDraft<TField extends string>(
  input: ReadInput<TField>,
): Partial<Record<TField, string>> {
  if (input.storage === null) return {}
  try {
    const raw = input.storage.getItem(input.storageKey)
    if (raw === null) return {}
    const parsed = JSON.parse(raw) as unknown
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const record = parsed as Record<string, unknown>
    const draft: Partial<Record<TField, string>> = {}
    for (const field of input.fields) {
      const value = record[field]
      if (typeof value === 'string') draft[field] = value
    }
    return draft
  } catch {
    return {}
  }
}

/** Campo vazio não vai para o armazenamento: rascunho de formulário intocado é lixo com PII. */
export function writeFormDraft<TField extends string>(input: WriteInput<TField>): void {
  if (input.storage === null) return
  const filled = input.fields.filter((field) => input.draft[field] !== '')
  if (filled.length === 0) {
    clearFormDraft(input)
    return
  }
  try {
    const entries = filled.map((field) => [field, input.draft[field]])
    input.storage.setItem(input.storageKey, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    return
  }
}

export function clearFormDraft(input: ClearInput): void {
  if (input.storage === null) return
  try {
    input.storage.removeItem(input.storageKey)
  } catch {
    return
  }
}
