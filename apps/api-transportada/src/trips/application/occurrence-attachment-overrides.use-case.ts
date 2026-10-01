/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-B3: `GET`/`PUT /company-settings/occurrence-types/:occurrenceTypeId/attachment-overrides`
 * — mesmo molde de `replaceOverrides` do comprovante, substituição total por tipo. O `:occurrenceTypeId`
 * é conferido contra o tenant antes de ler ou gravar, para responder 404 limpo (`OccurrenceTypeNotFoundError`)
 * em vez de devolver (ou aceitar) exceção de um tipo que não existe nesta empresa.
 */
import { OccurrenceTypeNotFoundError } from '../domain/trip.error.js'
import type { DeliveryProofFieldMode } from '../domain/delivery-proof-settings.policy.js'
import type {
  OccurrenceAttachmentContractorOverride,
  OccurrenceAttachmentRecipientOverride,
} from '../infrastructure/drizzle-occurrence-attachment-overrides.repository.js'

export type OccurrenceAttachmentOverridesResult = {
  readonly contractorOverrides: readonly OccurrenceAttachmentContractorOverride[]
  readonly recipientOverrides: readonly OccurrenceAttachmentRecipientOverride[]
}

export type OccurrenceAttachmentOverridesPort = {
  readonly findOccurrenceType: (input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }) => Promise<null | { readonly id: string }>
  readonly listContractorOverrides: (input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }) => Promise<readonly OccurrenceAttachmentContractorOverride[]>
  readonly listRecipientOverrides: (input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
  }) => Promise<readonly OccurrenceAttachmentRecipientOverride[]>
  readonly replaceContractorOverrides: (input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
    readonly overrides: readonly OccurrenceAttachmentContractorOverride[]
  }) => Promise<void>
  readonly replaceRecipientOverrides: (input: {
    readonly companyId: string
    readonly occurrenceTypeId: string
    readonly overrides: readonly OccurrenceAttachmentRecipientOverride[]
  }) => Promise<void>
}

async function assertOccurrenceTypeInTenant(input: {
  readonly companyId: string
  readonly occurrenceTypeId: string
  readonly port: OccurrenceAttachmentOverridesPort
}): Promise<void> {
  const type = await input.port.findOccurrenceType({
    companyId: input.companyId,
    occurrenceTypeId: input.occurrenceTypeId,
  })
  if (type === null) throw new OccurrenceTypeNotFoundError()
}

export async function readOccurrenceAttachmentOverrides(input: {
  readonly companyId: string
  readonly occurrenceTypeId: string
  readonly port: OccurrenceAttachmentOverridesPort
}): Promise<OccurrenceAttachmentOverridesResult> {
  await assertOccurrenceTypeInTenant(input)

  const [contractorOverrides, recipientOverrides] = await Promise.all([
    input.port.listContractorOverrides(input),
    input.port.listRecipientOverrides(input),
  ])

  return { contractorOverrides, recipientOverrides }
}

export async function replaceOccurrenceAttachmentOverrides(input: {
  readonly companyId: string
  readonly contractorOverrides: readonly {
    readonly attachmentMode: DeliveryProofFieldMode
    readonly contractorId: string
  }[]
  readonly occurrenceTypeId: string
  readonly port: OccurrenceAttachmentOverridesPort
  readonly recipientOverrides: readonly {
    readonly attachmentMode: DeliveryProofFieldMode
    readonly taxId: string
  }[]
}): Promise<OccurrenceAttachmentOverridesResult> {
  await assertOccurrenceTypeInTenant(input)

  await input.port.replaceContractorOverrides({
    companyId: input.companyId,
    occurrenceTypeId: input.occurrenceTypeId,
    overrides: input.contractorOverrides,
  })
  await input.port.replaceRecipientOverrides({
    companyId: input.companyId,
    occurrenceTypeId: input.occurrenceTypeId,
    overrides: input.recipientOverrides,
  })

  const [contractorOverrides, recipientOverrides] = await Promise.all([
    input.port.listContractorOverrides(input),
    input.port.listRecipientOverrides(input),
  ])

  return { contractorOverrides, recipientOverrides }
}
