/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Spec 156 T8b: fila de concorrência limitada, uma requisição por item — a rota do escritório
 * (`field-return`) é individual, não há lote com autoria. Mesmo molde de `runEmissionQueue`
 * (`nfe-workspace/shared/cteEmissionQueue.service.ts`), generalizado por item em vez de fatia: uma
 * falha isolada não derruba as irmãs, e o resultado sai por item, não só um veredito do lote.
 */
export type FieldActionQueueResult<TItem, TValue> = Readonly<{
  errorCode: null | string
  item: TItem
  value: TValue | null
}>

export async function runFieldActionQueue<TItem, TValue>(
  input: Readonly<{
    concurrency: number
    items: readonly TItem[]
    run: (item: TItem) => Promise<TValue>
  }>,
): Promise<readonly FieldActionQueueResult<TItem, TValue>[]> {
  const total = input.items.length
  const results: FieldActionQueueResult<TItem, TValue>[] = []
  let nextIndex = 0

  async function consume(): Promise<void> {
    for (let current = nextIndex++; current < total; current = nextIndex++) {
      const item = input.items[current]
      if (item === undefined) return
      try {
        const value = await input.run(item)
        results[current] = { errorCode: null, item, value }
      } catch (error) {
        results[current] = { errorCode: readErrorCode(error), item, value: null }
      }
    }
  }

  const lanes = Math.min(Math.max(1, input.concurrency), Math.max(1, total))
  await Promise.all(Array.from({ length: lanes }, consume))

  return results
}

function readErrorCode(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
  ) {
    return error.code
  }
  return 'UNKNOWN'
}
