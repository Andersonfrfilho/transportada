/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §6): a porta do dono da ocorrência, para o e-mail automático assinar em nome dele. A 272 a
 * entrega **nula**; a 273 (ADR-0109) a implementa com a elegibilidade. O `jobTitle` volta já resolvido por
 * `resolveSignerJobTitle`, e ausente quando não há cargo nem papel.
 */
import type { OccurrenceConversationKind } from '../../database/occurrence-conversation.schema.js'

export type OccurrenceOwner = {
  readonly jobTitle?: string
  readonly name: string
  readonly userId: string
}

export type OccurrenceOwnerReader = {
  findEligibleOwner(params: {
    readonly companyId: string
    readonly kind: OccurrenceConversationKind
    readonly occurrenceId: string
  }): Promise<OccurrenceOwner | undefined>
}

/** Sem a 273: ninguém é dono, e a equipe assina. */
export const NULL_OCCURRENCE_OWNER_READER: OccurrenceOwnerReader = {
  findEligibleOwner: async () => undefined,
}
