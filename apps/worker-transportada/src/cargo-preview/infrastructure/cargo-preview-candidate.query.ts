/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a: as notas que uma prévia ainda pode pegar — da empresa, autorizadas, emitidas pelo
 * CNPJ do contratante (`nfe_participants` papel `emitter`), importadas dentro da janela do perfil e
 * sem vínculo com prévia nenhuma. O `NroCarga` sai do `infCpl` pelo padrão do perfil.
 */
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { cargoPreviewDocumentLinks } from '../../database/cargo-preview.schema.js'
import {
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
  nfeVolumes,
} from '../../database/nfe.schema.js'
import type { CargoPreviewCandidateDocument } from '../../cargo-receiving/domain/cargo-preview-matching.types.js'
import { extractLoadReference } from '../../cargo-receiving/domain/load-reference.policy.js'
import { NFE_PARTICIPANT_ROLE } from '../../nfe-imports/domain/nfe-participant-role.constant.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
export type Executor = Pick<Database, 'select'>

const AUTHORIZED_STATUS = 'authorized'
const POSTAL_CODE_LENGTH = 8
const NOT_DIGIT = /\D/gu

const emitter = alias(nfeParticipants, 'cargo_preview_emitter')
const recipient = alias(nfeParticipants, 'cargo_preview_recipient')

function recipientAddress(field: typeof nfeAddresses.postalCode | typeof nfeAddresses.city) {
  return sql<
    string | null
  >`(select ${field} from ${nfeAddresses} where ${nfeAddresses.companyId} = ${recipient.companyId} and ${nfeAddresses.participantId} = ${recipient.id} order by ${nfeAddresses.createdAt}, ${nfeAddresses.id} limit 1)`
}

const GROSS_WEIGHT = sql<
  string | null
>`(select sum(${nfeVolumes.grossWeight}) from ${nfeVolumes} where ${nfeVolumes.companyId} = ${nfeDocuments.companyId} and ${nfeVolumes.documentId} = ${nfeDocuments.id})`

const IS_LINKED = sql`exists (select 1 from ${cargoPreviewDocumentLinks} where ${cargoPreviewDocumentLinks.companyId} = ${nfeDocuments.companyId} and ${cargoPreviewDocumentLinks.documentId} = ${nfeDocuments.id})`

export type CandidateWindow = {
  readonly companyId: string
  readonly emitterTaxId: string
  readonly from: Date
  readonly loadReferenceLabel: string | null
  readonly to: Date
}

/** `0` de peso é "sem peso" (a importação grava zero quando o XML não traz `pesoB`). */
function toGrossWeight(value: string | null): string | undefined {
  if (value === null) return undefined
  return Number(value) > 0 ? value : undefined
}

function toPostalCode(value: string | null): string | undefined {
  const digits = value?.replace(NOT_DIGIT, '') ?? ''
  return digits.length === 0 ? undefined : digits.padStart(POSTAL_CODE_LENGTH, '0')
}

export async function selectCandidateDocuments(
  executor: Executor,
  window: CandidateWindow,
): Promise<readonly CargoPreviewCandidateDocument[]> {
  const rows = await executor
    .select({
      additionalInformation: nfeDocuments.additionalInformation,
      grossWeight: GROSS_WEIGHT,
      id: nfeDocuments.id,
      issuedAt: nfeDocuments.issuedAt,
      number: nfeDocuments.number,
      recipientCity: recipientAddress(nfeAddresses.city),
      recipientName: recipient.legalName,
      recipientPostalCode: recipientAddress(nfeAddresses.postalCode),
      recipientTaxId: recipient.taxId,
      totalValue: nfeDocuments.totalValue,
    })
    .from(nfeDocuments)
    .innerJoin(
      emitter,
      and(
        eq(emitter.companyId, nfeDocuments.companyId),
        eq(emitter.documentId, nfeDocuments.id),
        eq(emitter.role, NFE_PARTICIPANT_ROLE.EMITTER),
        eq(emitter.taxId, window.emitterTaxId),
      ),
    )
    .leftJoin(
      recipient,
      and(
        eq(recipient.companyId, nfeDocuments.companyId),
        eq(recipient.documentId, nfeDocuments.id),
        eq(recipient.role, NFE_PARTICIPANT_ROLE.RECIPIENT),
      ),
    )
    .where(
      and(
        eq(nfeDocuments.companyId, window.companyId),
        eq(nfeDocuments.status, AUTHORIZED_STATUS),
        gte(nfeDocuments.createdAt, window.from),
        lte(nfeDocuments.createdAt, window.to),
        sql`not ${IS_LINKED}`,
      ),
    )
    .orderBy(asc(nfeDocuments.id))
  return rows.map((row) => ({
    grossWeightKg: toGrossWeight(row.grossWeight),
    id: row.id,
    issuedAt: row.issuedAt.toISOString(),
    loadReference: extractLoadReference({
      additionalInfo: row.additionalInformation ?? undefined,
      label: window.loadReferenceLabel,
    }),
    number: row.number,
    recipientCity: row.recipientCity ?? undefined,
    recipientName: row.recipientName ?? undefined,
    recipientPostalCode: toPostalCode(row.recipientPostalCode),
    recipientTaxId: row.recipientTaxId ?? undefined,
    totalValue: row.totalValue,
  }))
}
