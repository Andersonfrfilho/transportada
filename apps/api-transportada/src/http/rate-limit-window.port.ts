/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { RateLimitOutcome } from './rate-limiter.service.js'

export type ConsumeRateLimitWindowParams = Readonly<{
  maxRequests: number
  scope: string
  /** Só identificadores opacos (`companyId:userId`): a tabela não guarda PII. */
  subjectKey: string
  windowSeconds: number
}>

/**
 * O balde compartilhado entre réplicas. Cada `consume` conta, inclusive o recusado — quem insiste
 * depois do teto continua sem passar até a janela virar.
 */
export type RateLimitWindowStorePort = Readonly<{
  consume: (params: ConsumeRateLimitWindowParams) => Promise<RateLimitOutcome>
}>
