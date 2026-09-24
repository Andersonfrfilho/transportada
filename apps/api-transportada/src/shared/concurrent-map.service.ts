/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T20: mapa com concorrência limitada e prazo por item. Cinquenta downloads em série
 * estouram o prazo da requisição; cinquenta em paralelo materializam o lote inteiro em memória e
 * afogam a conexão com o storage. O prazo é parte do contrato: item que não chega devolve `null`,
 * e quem chamou decide o que colocar no lugar — nunca uma espera sem fim.
 */

export type ConcurrentMapInput<TItem, TResult> = {
  readonly concurrency: number
  readonly items: readonly TItem[]
  readonly map: (item: TItem) => Promise<TResult>
  readonly timeoutMs: number
}

/**
 * Devolve os resultados **na ordem da entrada**. `null` no lugar do item que falhou ou estourou o
 * prazo: uma foto indisponível não pode derrubar o demonstrativo inteiro.
 */
export async function mapWithConcurrencyLimit<TItem, TResult>(
  input: ConcurrentMapInput<TItem, TResult>,
): Promise<readonly (TResult | null)[]> {
  const results: (TResult | null)[] = new Array<TResult | null>(input.items.length).fill(null)
  const workers = Math.max(1, Math.min(input.concurrency, input.items.length))
  let nextIndex = 0

  async function runWorker(): Promise<void> {
    for (let index = nextIndex; index < input.items.length; index = nextIndex) {
      nextIndex += 1
      const item = input.items[index]
      if (item === undefined) continue
      results[index] = await runWithTimeout({
        operation: () => input.map(item),
        timeoutMs: input.timeoutMs,
      })
    }
  }

  await Promise.all(Array.from({ length: workers }, runWorker))
  return results
}

async function runWithTimeout<TResult>(input: {
  readonly operation: () => Promise<TResult>
  readonly timeoutMs: number
}): Promise<TResult | null> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), input.timeoutMs)
  })

  try {
    return await Promise.race([input.operation(), deadline])
  } catch {
    return null
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
