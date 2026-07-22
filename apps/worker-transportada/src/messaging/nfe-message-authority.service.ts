/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeProcessingEnvelopeV1 } from './nfe-processing-envelope.schema.js'

type NfeAuthoritativeMessageRecord = {
  readonly actorId: string
  readonly aggregateId: string
  readonly companyId: string
  readonly eventId: string
}

type ValidateNfeMessageAuthorityParams = {
  readonly authoritativeRecord: NfeAuthoritativeMessageRecord
  readonly envelope: NfeProcessingEnvelopeV1
}

type ValidateNfeMessageAuthorityResult = {
  readonly accepted: true
}

export class NfeMessageAuthorityMismatchError extends Error {
  override readonly name = 'NfeMessageAuthorityMismatchError'

  constructor() {
    super('NF-e message authority does not match the persisted outbox aggregate')
  }
}

export function validateNfeMessageAuthority(
  params: ValidateNfeMessageAuthorityParams,
): ValidateNfeMessageAuthorityResult {
  const isMatchingAuthority =
    params.envelope.eventId === params.authoritativeRecord.eventId &&
    params.envelope.companyId === params.authoritativeRecord.companyId &&
    params.envelope.actorId === params.authoritativeRecord.actorId &&
    params.envelope.payload.importId === params.authoritativeRecord.aggregateId

  if (!isMatchingAuthority) {
    throw new NfeMessageAuthorityMismatchError()
  }

  return { accepted: true }
}
