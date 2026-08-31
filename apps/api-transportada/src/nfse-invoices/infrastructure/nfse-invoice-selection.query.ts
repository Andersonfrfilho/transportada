/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { type SQL, and, eq, inArray } from 'drizzle-orm'

import { nfeAddresses, nfeDocuments, nfeParticipants } from '../../database/nfe.schema.js'
import type { NfseSelectionDocument } from '../domain/nfse-selection.policy.js'
import type { NfsePartyAddress } from '../domain/nfse-taker-address.policy.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export type NfseInvoiceSelectionQueryable = Database | Transaction

export type NfseInvoiceSelectionQuery = {
  readonly companyId: string
  readonly documentIds: readonly string[]
}

type PartyLocation = {
  readonly address: NfsePartyAddress
  readonly city: string | null
  readonly legalName: string | null
  readonly state: string | null
  readonly taxId: string | null
}

type DocumentParties = {
  readonly recipient: PartyLocation
  readonly sender: PartyLocation
}

/** Participante sem endereço no join vira endereço todo nulo, que a política recusa como incompleto. */
const EMPTY_ADDRESS: NfsePartyAddress = {
  city: null,
  complement: null,
  district: null,
  number: null,
  phone: null,
  postalCode: null,
  state: null,
  street: null,
}

const EMPTY_PARTY: PartyLocation = {
  address: EMPTY_ADDRESS,
  city: null,
  legalName: null,
  state: null,
  taxId: null,
}
const EMPTY_PARTIES: DocumentParties = { recipient: EMPTY_PARTY, sender: EMPTY_PARTY }
const SENDER_ROLE = 'emitter'
const RECIPIENT_ROLE = 'recipient'
const COMPLETE_VARIANT = 'complete'

export function buildNfseSelectionDocumentFilters(input: NfseInvoiceSelectionQuery): SQL[] {
  return [
    eq(nfeDocuments.companyId, input.companyId),
    inArray(nfeDocuments.id, [...input.documentIds]),
  ]
}

export function buildNfseSelectionPartyFilters(input: NfseInvoiceSelectionQuery): SQL[] {
  return [
    eq(nfeParticipants.companyId, input.companyId),
    inArray(nfeParticipants.documentId, [...input.documentIds]),
  ]
}

/** Sem `company_id` na condição, o join alcançaria endereço de outra empresa pelo participantId sozinho. */
export function buildNfseSelectionPartyAddressJoin(): SQL {
  const condition = and(
    eq(nfeAddresses.companyId, nfeParticipants.companyId),
    eq(nfeAddresses.participantId, nfeParticipants.id),
  )
  if (condition === undefined)
    throw new Error('nfse selection party address join condition is empty')
  return condition
}

export async function findNfseSelectionDocuments(
  queryable: NfseInvoiceSelectionQueryable,
  query: NfseInvoiceSelectionQuery,
): Promise<readonly NfseSelectionDocument[]> {
  if (query.documentIds.length === 0) return []

  const [records, parties] = await Promise.all([
    queryable
      .select({
        accessKey: nfeDocuments.accessKey,
        id: nfeDocuments.id,
        issuedAt: nfeDocuments.issuedAt,
        number: nfeDocuments.number,
        series: nfeDocuments.series,
        status: nfeDocuments.status,
        totalValue: nfeDocuments.totalValue,
      })
      .from(nfeDocuments)
      .where(and(...buildNfseSelectionDocumentFilters(query))),
    loadParties(queryable, query),
  ])

  return records.map((record) => {
    const { recipient, sender } = parties.get(record.id) ?? EMPTY_PARTIES

    return {
      accessKey: record.accessKey,
      documentId: record.id,
      issuedAt: record.issuedAt.toISOString(),
      number: record.number,
      recipientAddress: recipient.address,
      recipientCity: recipient.city,
      recipientLegalName: recipient.legalName,
      recipientState: recipient.state,
      recipientTaxId: recipient.taxId,
      senderAddress: sender.address,
      senderCity: sender.city,
      senderLegalName: sender.legalName,
      senderState: sender.state,
      senderTaxId: sender.taxId,
      series: record.series,
      status: record.status,
      totalAmount: record.totalValue,
      variant: COMPLETE_VARIANT,
    }
  })
}

async function loadParties(
  queryable: NfseInvoiceSelectionQueryable,
  query: NfseInvoiceSelectionQuery,
): Promise<Map<string, DocumentParties>> {
  const rows = await queryable
    .select({
      city: nfeAddresses.city,
      complement: nfeAddresses.complement,
      district: nfeAddresses.district,
      documentId: nfeParticipants.documentId,
      legalName: nfeParticipants.legalName,
      number: nfeAddresses.number,
      phone: nfeAddresses.phone,
      postalCode: nfeAddresses.postalCode,
      role: nfeParticipants.role,
      state: nfeAddresses.state,
      street: nfeAddresses.street,
      taxId: nfeParticipants.taxId,
    })
    .from(nfeParticipants)
    .leftJoin(nfeAddresses, buildNfseSelectionPartyAddressJoin())
    .where(and(...buildNfseSelectionPartyFilters(query)))

  const parties = new Map<string, DocumentParties>()
  for (const row of rows) {
    if (row.role !== SENDER_ROLE && row.role !== RECIPIENT_ROLE) continue
    const current = parties.get(row.documentId) ?? EMPTY_PARTIES
    const party: PartyLocation = {
      address: {
        city: row.city,
        complement: row.complement,
        district: row.district,
        number: row.number,
        phone: row.phone,
        postalCode: row.postalCode,
        state: row.state,
        street: row.street,
      },
      city: row.city,
      legalName: row.legalName,
      state: row.state,
      taxId: row.taxId,
    }
    parties.set(
      row.documentId,
      row.role === SENDER_ROLE ? { ...current, sender: party } : { ...current, recipient: party },
    )
  }

  return parties
}
