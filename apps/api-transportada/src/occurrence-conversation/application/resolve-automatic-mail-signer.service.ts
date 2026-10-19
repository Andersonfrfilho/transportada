/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §6): o assinante do e-mail automático — o dono elegível, se a porta devolver um, senão a equipe.
 */
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'
import type { OccurrenceMailSigner } from '../domain/occurrence-mail-signer.policy.js'
import type { OccurrenceOwnerReader } from './occurrence-owner-reader.port.js'

export async function resolveAutomaticMailSigner(params: {
  readonly companyId: string
  readonly kind: OccurrenceConversationKind
  readonly occurrenceId: string
  readonly ownerReader: OccurrenceOwnerReader
}): Promise<OccurrenceMailSigner> {
  const { ownerReader, ...lookup } = params
  const owner = await ownerReader.findEligibleOwner(lookup)
  if (owner === undefined) return { kind: 'team' }
  return {
    ...(owner.jobTitle === undefined ? {} : { jobTitle: owner.jobTitle }),
    kind: 'owner',
    name: owner.name,
    userId: owner.userId,
  }
}
