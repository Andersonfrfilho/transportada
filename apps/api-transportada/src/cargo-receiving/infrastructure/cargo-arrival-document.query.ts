/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T2.3: as consultas da nota candidata. "Viva em viagem" é `trip_documents` sem
 * `released_at` (o padrão de `buildActiveTripLinkFilters`); "já em chegada" é existir em
 * `cargo_arrival_documents`. O endereço do destinatário não tem unique por participante: um só, o
 * primeiro, para a nota nunca duplicar.
 */
import { and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core'

import { cargoArrivalDocuments } from '../../database/cargo-arrival-document.schema.js'
import { nfeAddresses, nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
import { tripDocuments } from '../../database/trip.schema.js'
import { NFE_DOCUMENT_AUTHORIZED_STATUS } from '../../nfe-documents/domain/nfe-document-status.constant.js'
import type { CargoArrivalReturnState } from '../../shared/cargo-arrival.constant.js'
import type { Database } from './cargo-arrival-persistence.support.js'

const EMITTER_ROLE = 'emitter'
export const RECIPIENT_ROLE = 'recipient'
const IBGE_CITY_CODE = /^[0-9]{7}$/

export const emitterParticipant = alias(nfeParticipants, 'cargo_emitter_participant')
export const recipientParticipant = alias(nfeParticipants, 'cargo_recipient_participant')

export function isInLiveTripSql(documentId: AnyPgColumn): SQL<boolean> {
  return sql<boolean>`exists (select 1 from ${tripDocuments} where ${tripDocuments.companyId} = ${nfeDocuments.companyId} and ${tripDocuments.nfeDocumentId} = ${documentId} and ${tripDocuments.releasedAt} is null)`
}

export function isInArrivalSql(documentId: AnyPgColumn): SQL<boolean> {
  return sql<boolean>`exists (select 1 from ${cargoArrivalDocuments} where ${cargoArrivalDocuments.companyId} = ${nfeDocuments.companyId} and ${cargoArrivalDocuments.nfeDocumentId} = ${documentId})`
}

/** A marcação "devolver ao contratante" da chegada em que a nota está; nula fora de chegada. */
export function returnToContractorSql(
  documentId: AnyPgColumn,
): SQL<CargoArrivalReturnState | null> {
  return sql<CargoArrivalReturnState | null>`(select ${cargoArrivalDocuments.returnToContractor} from ${cargoArrivalDocuments} where ${cargoArrivalDocuments.companyId} = ${nfeDocuments.companyId} and ${cargoArrivalDocuments.nfeDocumentId} = ${documentId})`
}

export function recipientAddressSql(
  field: typeof nfeAddresses.cityCode | typeof nfeAddresses.city | typeof nfeAddresses.state,
): SQL<string | null> {
  return sql<
    string | null
  >`(select ${field} from ${nfeAddresses} where ${nfeAddresses.companyId} = ${recipientParticipant.companyId} and ${nfeAddresses.participantId} = ${recipientParticipant.id} order by ${nfeAddresses.createdAt}, ${nfeAddresses.id} limit 1)`
}

export function emitterJoin(): SQL | undefined {
  return and(
    eq(emitterParticipant.companyId, nfeDocuments.companyId),
    eq(emitterParticipant.documentId, nfeDocuments.id),
    eq(emitterParticipant.role, EMITTER_ROLE),
  )
}

export function recipientJoin(): SQL | undefined {
  return and(
    eq(recipientParticipant.companyId, nfeDocuments.companyId),
    eq(recipientParticipant.documentId, nfeDocuments.id),
    eq(recipientParticipant.role, RECIPIENT_ROLE),
  )
}

/** As notas que podem entrar numa chegada: deste emitente, autorizadas, livres. */
export function buildAvailableDocumentFilters(params: {
  readonly companyId: string
  readonly emitterTaxId: string
}): SQL[] {
  return [
    eq(nfeDocuments.companyId, params.companyId),
    eq(nfeDocuments.status, NFE_DOCUMENT_AUTHORIZED_STATUS),
    eq(emitterParticipant.taxId, params.emitterTaxId),
    sql`not ${isInLiveTripSql(nfeDocuments.id)}`,
    sql`not ${isInArrivalSql(nfeDocuments.id)}`,
  ]
}

export function buildCandidateDocumentFilters(params: {
  readonly companyId: string
  readonly documentIds: readonly string[]
}): SQL[] {
  return [
    eq(nfeDocuments.companyId, params.companyId),
    inArray(nfeDocuments.id, [...params.documentIds]),
  ]
}

/** As linhas que a política de candidatas julga, mais a cidade que a nota vai levar. */
export function selectArrivalCandidateRows(
  executor: Pick<Database, 'select'>,
  params: { readonly companyId: string; readonly documentIds: readonly string[] },
) {
  return executor
    .select({
      cityIbgeCode: recipientAddressSql(nfeAddresses.cityCode),
      emitterTaxId: emitterParticipant.taxId,
      id: nfeDocuments.id,
      isInArrival: isInArrivalSql(nfeDocuments.id).mapWith(Boolean),
      isInLiveTrip: isInLiveTripSql(nfeDocuments.id).mapWith(Boolean),
      returnToContractor: returnToContractorSql(nfeDocuments.id),
      status: nfeDocuments.status,
    })
    .from(nfeDocuments)
    .leftJoin(emitterParticipant, emitterJoin())
    .leftJoin(recipientParticipant, recipientJoin())
    .where(and(...buildCandidateDocumentFilters(params)))
}

/** Código fora do formato IBGE vira ausência: o XML é entrada de terceiro. */
export function toIbgeCityCode(value: string | null): string | null {
  return value !== null && IBGE_CITY_CODE.test(value) ? value : null
}
