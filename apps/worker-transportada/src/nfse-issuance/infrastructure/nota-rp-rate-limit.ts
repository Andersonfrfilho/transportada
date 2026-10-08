/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CreateRateLimitedFetchParams, RateLimitedFetch } from './nota-rp-rate-limit.types.js'

/**
 * Uma instância por processo, compartilhada pelos gateways: a fila vive na closure, então um
 * limitador criado por chamada não limitaria nada. Só a **largada** é serializada — a resposta de uma
 * chamada não segura a próxima, e o erro de uma não trava a fila.
 */
export function createRateLimitedFetch(params: CreateRateLimitedFetchParams): RateLimitedFetch {
  const { clock, minIntervalMilliseconds, sleep } = params
  let lastStartedAt: number | undefined
  let queue: Promise<void> = Promise.resolve()

  async function waitForSlot(): Promise<void> {
    if (lastStartedAt !== undefined) {
      const remaining = lastStartedAt + minIntervalMilliseconds - clock()
      if (remaining > 0) await sleep(remaining)
    }
    lastStartedAt = clock()
  }

  return async (input, init) => {
    const slot = queue.then(waitForSlot)
    queue = slot.catch(() => undefined)
    await slot
    return params.fetch(input, init)
  }
}
