/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray } from 'drizzle-orm'

import { cteBatchItemDocuments, cteBatchItems } from '../../database/cte-batch.schema.js'
import { companyCargoSettings } from '../../database/company-cargo-settings.schema.js'
import { companyFiscalProfiles } from '../../database/company-fiscal-profile.schema.js'
import { cteEmissionProfiles } from '../../database/cte-emission-profile.schema.js'
import { resolveCargoWeight } from '../../nfe-documents/domain/cargo-weight.policy.js'
import {
  nfeAddresses,
  nfeDocuments,
  nfeParticipants,
  nfeProducts,
  nfeVolumes,
} from '../../database/nfe.schema.js'
import type {
  CteIssuanceEmitter,
  CteIssuancePayloadSource,
  CteIssuancePayloadSourceQuery,
} from '../application/cte-issuance-payload.port.js'
import type {
  CtePayloadCharge,
  CtePayloadInvoice,
  CtePayloadParty,
  CtePayloadProduct,
  CtePayloadProfile,
  CtePayloadVolume,
} from '../domain/cte-payload.types.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

export type PayloadQueryable = Database | Transaction

type PartyRow = {
  readonly city: string | null
  readonly cityCode: string | null
  readonly complement: string | null
  readonly district: string | null
  readonly documentId: string
  readonly legalName: string | null
  readonly number: string | null
  readonly phone: string | null
  readonly postalCode: string | null
  readonly role: string
  readonly state: string | null
  readonly stateRegistration: string | null
  readonly street: string | null
  readonly taxId: string | null
  readonly tradeName: string | null
}

const SENDER_ROLE = 'emitter'
const RECIPIENT_ROLE = 'recipient'

type CompanyScope = {
  readonly companyId: string
}

type DocumentScope = CompanyScope & {
  readonly documentIds: readonly string[]
}

export function buildBatchItemFilters(
  input: CompanyScope & { readonly batchId: string; readonly batchItemId: string },
) {
  return [
    eq(cteBatchItems.companyId, input.companyId),
    eq(cteBatchItems.batchId, input.batchId),
    eq(cteBatchItems.id, input.batchItemId),
  ]
}

export function buildEmitterFilters(input: CompanyScope) {
  return [eq(companyFiscalProfiles.companyId, input.companyId)]
}

export function buildProfileFilters(input: CompanyScope & { readonly profileId: string }) {
  return [
    eq(cteEmissionProfiles.companyId, input.companyId),
    eq(cteEmissionProfiles.id, input.profileId),
  ]
}

export function buildItemDocumentFilters(input: CompanyScope & { readonly batchItemId: string }) {
  return [
    eq(cteBatchItemDocuments.companyId, input.companyId),
    eq(cteBatchItemDocuments.itemId, input.batchItemId),
  ]
}

export function buildDocumentJoinFilters() {
  return [
    eq(nfeDocuments.companyId, cteBatchItemDocuments.companyId),
    eq(nfeDocuments.id, cteBatchItemDocuments.nfeDocumentId),
  ]
}

export function buildParticipantFilters(input: DocumentScope) {
  return [
    eq(nfeParticipants.companyId, input.companyId),
    inArray(nfeParticipants.documentId, [...input.documentIds]),
  ]
}

export function buildAddressJoinFilters() {
  return [
    eq(nfeAddresses.companyId, nfeParticipants.companyId),
    eq(nfeAddresses.participantId, nfeParticipants.id),
  ]
}

export function buildProductFilters(input: DocumentScope) {
  return [
    eq(nfeProducts.companyId, input.companyId),
    inArray(nfeProducts.documentId, [...input.documentIds]),
  ]
}

export function buildVolumeFilters(input: DocumentScope) {
  return [
    eq(nfeVolumes.companyId, input.companyId),
    inArray(nfeVolumes.documentId, [...input.documentIds]),
  ]
}

export async function findCteIssuancePayloadSource(
  queryable: PayloadQueryable,
  query: CteIssuancePayloadSourceQuery,
): Promise<CteIssuancePayloadSource | null> {
  const [item] = await queryable
    .select({ calculationSnapshot: cteBatchItems.calculationSnapshot })
    .from(cteBatchItems)
    .where(
      and(
        ...buildBatchItemFilters({
          batchId: query.batchId,
          batchItemId: query.batchItemId,
          companyId: query.companyId,
        }),
      ),
    )
    .limit(1)
  if (item === undefined) return null

  const snapshot = readSnapshot(item.calculationSnapshot)
  if (snapshot === null) return null

  const [emitter, profile, invoices] = await Promise.all([
    loadEmitter(queryable, query.companyId),
    loadProfile(queryable, query.companyId, snapshot.profileId),
    loadInvoices(queryable, query),
  ])
  if (emitter === null || profile === null || invoices.length === 0) return null

  return { charge: snapshot.charge, emitter, invoices, profile }
}

function readSnapshot(
  value: unknown,
): { readonly charge: CtePayloadCharge; readonly profileId: string } | null {
  if (typeof value !== 'object' || value === null) return null
  const snapshot = value as Record<string, unknown>

  const profile = snapshot['profile']
  if (typeof profile !== 'object' || profile === null) return null
  const profileId = (profile as Record<string, unknown>)['id']
  if (typeof profileId !== 'string' || profileId.length === 0) return null

  const totalAmount = snapshot['fiscalAmount']
  if (typeof totalAmount !== 'string' || totalAmount.length === 0) return null

  const components = readChargeComponents(snapshot['fiscalComponents'])
  if (components === null) return null

  return { charge: { components, totalAmount }, profileId }
}

function readChargeComponents(
  value: unknown,
): readonly { readonly amount: string; readonly label: string }[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const components: { readonly amount: string; readonly label: string }[] = []
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) return null
    const amount = (entry as Record<string, unknown>)['amount']
    const label = (entry as Record<string, unknown>)['label']
    if (typeof amount !== 'string' || typeof label !== 'string') return null
    components.push({ amount, label })
  }

  return components
}

async function loadEmitter(
  queryable: PayloadQueryable,
  companyId: string,
): Promise<CteIssuanceEmitter | null> {
  const [record] = await queryable
    .select({
      city: companyFiscalProfiles.city,
      cityIbgeCode: companyFiscalProfiles.cityIbgeCode,
      cnpj: companyFiscalProfiles.cnpj,
      complement: companyFiscalProfiles.complement,
      district: companyFiscalProfiles.district,
      legalName: companyFiscalProfiles.legalName,
      number: companyFiscalProfiles.number,
      phone: companyFiscalProfiles.phone,
      postalCode: companyFiscalProfiles.postalCode,
      rntrc: companyFiscalProfiles.rntrc,
      state: companyFiscalProfiles.state,
      stateRegistration: companyFiscalProfiles.stateRegistration,
      street: companyFiscalProfiles.street,
      taxRegime: companyFiscalProfiles.taxRegime,
      tradeName: companyFiscalProfiles.tradeName,
    })
    .from(companyFiscalProfiles)
    .where(and(...buildEmitterFilters({ companyId })))
    .limit(1)

  return record ?? null
}

async function loadProfile(
  queryable: PayloadQueryable,
  companyId: string,
  profileId: string,
): Promise<CtePayloadProfile | null> {
  const [record] = await queryable
    .select({
      cfopInternal: cteEmissionProfiles.cfopInternal,
      cfopInterstate: cteEmissionProfiles.cfopInterstate,
      icmsBaseReductionRate: cteEmissionProfiles.icmsBaseReductionRate,
      icmsCst: cteEmissionProfiles.icmsCst,
      icmsRate: cteEmissionProfiles.icmsRate,
      modal: cteEmissionProfiles.modal,
      observations: cteEmissionProfiles.observations,
      operationNature: cteEmissionProfiles.operationNature,
      pickupDetails: cteEmissionProfiles.pickupDetails,
      pickupIndicator: cteEmissionProfiles.pickupIndicator,
      predominantProductMode: cteEmissionProfiles.predominantProductMode,
      predominantProductName: cteEmissionProfiles.predominantProductName,
      receiverIeIndicator: cteEmissionProfiles.receiverIeIndicator,
      serviceType: cteEmissionProfiles.serviceType,
      taker: cteEmissionProfiles.taker,
    })
    .from(cteEmissionProfiles)
    .where(and(...buildProfileFilters({ companyId, profileId })))
    .limit(1)

  return record ?? null
}

async function loadInvoices(
  queryable: PayloadQueryable,
  query: CteIssuancePayloadSourceQuery,
): Promise<readonly CtePayloadInvoice[]> {
  const documents = await queryable
    .select({
      accessKey: nfeDocuments.accessKey,
      id: nfeDocuments.id,
      totalAmount: nfeDocuments.totalValue,
    })
    .from(cteBatchItemDocuments)
    .innerJoin(nfeDocuments, and(...buildDocumentJoinFilters()))
    .where(
      and(
        ...buildItemDocumentFilters({
          batchItemId: query.batchItemId,
          companyId: query.companyId,
        }),
      ),
    )
    .orderBy(asc(cteBatchItemDocuments.position))
  if (documents.length === 0) return []

  const documentIds = documents.map((document) => document.id)
  const [parties, products, volumes, defaultWeightPerVolume] = await Promise.all([
    loadParties(queryable, query.companyId, documentIds),
    loadProducts(queryable, query.companyId, documentIds),
    loadVolumes(queryable, query.companyId, documentIds),
    loadDefaultVolumeWeight(queryable, query.companyId),
  ])

  return documents.flatMap((document) => {
    const documentParties = parties.get(document.id)
    if (documentParties === undefined) return []

    return [
      {
        accessKey: document.accessKey,
        products: products.get(document.id) ?? [],
        recipient: documentParties.recipient,
        sender: documentParties.sender,
        totalAmount: document.totalAmount,
        volumes: applyEstimatedWeight(volumes.get(document.id) ?? [], defaultWeightPerVolume),
      },
    ]
  })
}

async function loadParties(
  queryable: PayloadQueryable,
  companyId: string,
  documentIds: readonly string[],
): Promise<Map<string, { readonly recipient: CtePayloadParty; readonly sender: CtePayloadParty }>> {
  const rows = await queryable
    .select({
      city: nfeAddresses.city,
      cityCode: nfeAddresses.cityCode,
      complement: nfeAddresses.complement,
      district: nfeAddresses.district,
      documentId: nfeParticipants.documentId,
      legalName: nfeParticipants.legalName,
      number: nfeAddresses.number,
      phone: nfeAddresses.phone,
      postalCode: nfeAddresses.postalCode,
      role: nfeParticipants.role,
      state: nfeAddresses.state,
      stateRegistration: nfeParticipants.stateRegistration,
      street: nfeAddresses.street,
      taxId: nfeParticipants.taxId,
      tradeName: nfeParticipants.tradeName,
    })
    .from(nfeParticipants)
    .leftJoin(nfeAddresses, and(...buildAddressJoinFilters()))
    .where(and(...buildParticipantFilters({ companyId, documentIds })))

  const senders = new Map<string, CtePayloadParty>()
  const recipients = new Map<string, CtePayloadParty>()
  for (const row of rows) {
    if (row.role === SENDER_ROLE) senders.set(row.documentId, toParty(row))
    if (row.role === RECIPIENT_ROLE) recipients.set(row.documentId, toParty(row))
  }

  const parties = new Map<
    string,
    { readonly recipient: CtePayloadParty; readonly sender: CtePayloadParty }
  >()
  for (const documentId of documentIds) {
    const sender = senders.get(documentId)
    const recipient = recipients.get(documentId)
    if (sender === undefined || recipient === undefined) continue
    parties.set(documentId, { recipient, sender })
  }

  return parties
}

function toParty(row: PartyRow): CtePayloadParty {
  return {
    city: row.city ?? '',
    cityCode: row.cityCode ?? '',
    complement: row.complement,
    district: row.district ?? '',
    // A NF-e não expõe e-mail do participante; o CT-e sai sem <email> por falta de origem.
    email: null,
    legalName: row.legalName ?? '',
    number: row.number ?? '',
    phone: row.phone,
    postalCode: row.postalCode,
    state: row.state ?? '',
    stateRegistration: row.stateRegistration,
    street: row.street ?? '',
    taxId: row.taxId ?? '',
    tradeName: row.tradeName,
  }
}

async function loadProducts(
  queryable: PayloadQueryable,
  companyId: string,
  documentIds: readonly string[],
): Promise<Map<string, CtePayloadProduct[]>> {
  const rows = await queryable
    .select({
      description: nfeProducts.description,
      documentId: nfeProducts.documentId,
      ordinal: nfeProducts.ordinal,
      quantity: nfeProducts.quantity,
      totalValue: nfeProducts.totalValue,
    })
    .from(nfeProducts)
    .where(and(...buildProductFilters({ companyId, documentIds })))
    .orderBy(asc(nfeProducts.documentId), asc(nfeProducts.ordinal))

  const products = new Map<string, CtePayloadProduct[]>()
  for (const row of rows) {
    const current = products.get(row.documentId) ?? []
    current.push({
      description: row.description,
      grossWeight: null,
      ordinal: Number(row.ordinal),
      quantity: row.quantity,
      totalValue: row.totalValue,
    })
    products.set(row.documentId, current)
  }

  return products
}

/**
 * Spec 067: quando o emitente não declarou massa, a estimativa entra **por volume**, e não como um
 * total colado na nota — assim a soma que `composeCargoQuantities` faz continua sendo a soma dos
 * volumes, e o `infQ` sai coerente com o `qVol` que o XML declarou.
 *
 * Volume que já tem peso nunca é tocado: nota parcialmente pesada mantém o que o emitente disse.
 */
function applyEstimatedWeight(
  volumes: readonly CtePayloadVolume[],
  defaultWeightPerVolume: string | null,
): readonly CtePayloadVolume[] {
  if (defaultWeightPerVolume === null) return volumes

  const declared = volumes.some(
    (volume) =>
      resolveCargoWeight({
        defaultWeightPerVolume: null,
        volumeGrossWeight: volume.grossWeight,
        volumeQuantity: volume.quantity,
      }) !== null,
  )
  if (declared) return volumes

  return volumes.map((volume) => {
    const estimated = resolveCargoWeight({
      defaultWeightPerVolume,
      volumeGrossWeight: volume.grossWeight,
      volumeQuantity: volume.quantity,
    })

    return estimated === null ? volume : { ...volume, grossWeight: estimated.grossWeight }
  })
}

/** Uma consulta por lote: o padrão é da empresa, e o lote é de uma empresa só. */
async function loadDefaultVolumeWeight(
  queryable: PayloadQueryable,
  companyId: string,
): Promise<string | null> {
  const [row] = await queryable
    .select({ defaultVolumeWeight: companyCargoSettings.defaultVolumeWeight })
    .from(companyCargoSettings)
    .where(eq(companyCargoSettings.companyId, companyId))
    .limit(1)

  return row?.defaultVolumeWeight ?? null
}

async function loadVolumes(
  queryable: PayloadQueryable,
  companyId: string,
  documentIds: readonly string[],
): Promise<Map<string, CtePayloadVolume[]>> {
  const rows = await queryable
    .select({
      documentId: nfeVolumes.documentId,
      grossWeight: nfeVolumes.grossWeight,
      netWeight: nfeVolumes.netWeight,
      quantity: nfeVolumes.quantity,
    })
    .from(nfeVolumes)
    .where(and(...buildVolumeFilters({ companyId, documentIds })))
    .orderBy(asc(nfeVolumes.documentId), asc(nfeVolumes.ordinal))

  const volumes = new Map<string, CtePayloadVolume[]>()
  for (const row of rows) {
    const current = volumes.get(row.documentId) ?? []
    current.push({
      grossWeight: row.grossWeight,
      netWeight: row.netWeight,
      quantity: row.quantity,
    })
    volumes.set(row.documentId, current)
  }

  return volumes
}
