/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Espaçamento fixo entre o **início** de duas requisições (D9). O relógio monotônico e o `sleep` são
 * injetados: o contrato mede o espaçamento sem esperar de verdade, e a espera desconta o tempo que a
 * própria chamada anterior levou.
 */
export type RequestClock = {
  nowMilliseconds(): number
  sleep(milliseconds: number): Promise<void>
}

export type RequestLimiter = {
  wait(): Promise<void>
}

export function createRequestLimiter(input: {
  readonly clock: RequestClock
  readonly spacingMilliseconds: number
}): RequestLimiter {
  let lastStartedAt: number | undefined

  return {
    async wait() {
      if (lastStartedAt !== undefined) {
        const elapsed = input.clock.nowMilliseconds() - lastStartedAt
        if (elapsed < input.spacingMilliseconds) {
          await input.clock.sleep(input.spacingMilliseconds - elapsed)
        }
      }
      lastStartedAt = input.clock.nowMilliseconds()
    },
  }
}
