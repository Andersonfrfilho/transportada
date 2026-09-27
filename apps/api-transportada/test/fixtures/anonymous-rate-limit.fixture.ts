/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createRateLimitSubjectService } from '../../src/http/rate-limit-subject.service'
import type { RateLimitSubjectService } from '../../src/http/rate-limit-subject.service'
import type { RateLimitWindowStorePort } from '../../src/http/rate-limit-window.port'

/** Teto que nenhum contrato de rota alcança: quem testa o limitador é `test/rate-limit/`. */
export const OPEN_ANONYMOUS_RATE_LIMIT = { maxRequests: 10_000, windowSeconds: 900 } as const

/** Balde do Postgres que sempre deixa passar — o contrato da rota não é o contrato do limitador. */
export function allowingRateLimitWindows(): RateLimitWindowStorePort {
  return {
    async consume() {
      return { allowed: true }
    },
  }
}

/** Chave sintética de 32 bytes, distinta das chaves canônicas das outras fixtures. */
export function syntheticRateLimitSubjects(): RateLimitSubjectService {
  return createRateLimitSubjectService({ key: Uint8Array.from(Buffer.alloc(32, 11)) })
}
