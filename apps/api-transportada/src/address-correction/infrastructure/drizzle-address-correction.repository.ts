/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { addressCorrectionRequests, contractors } from '../../database/database.schema.js'
import type {
  AddressCorrectionContractor,
  AddressCorrectionRepositoryPort,
  AddressCorrectionRequest,
  FindAddressCorrectionsByAddressKeysParams,
  FindContractorByTaxIdParams,
  ListAddressCorrectionDraftsByContractorParams,
  UpsertAddressCorrectionDraftParams,
} from '../application/address-correction.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type AddressCorrectionRow = typeof addressCorrectionRequests.$inferSelect

const DRAFT_STATUS = 'draft'

type EditableColumns = Omit<
  typeof addressCorrectionRequests.$inferInsert,
  'addressKey' | 'companyId' | 'createdAt' | 'id' | 'sentAt' | 'status' | 'threadId' | 'updatedAt'
>

function toEditableColumns(params: UpsertAddressCorrectionDraftParams): EditableColumns {
  const { proposed, reported } = params
  return {
    actorUserId: params.actorUserId,
    contractorId: params.contractorId,
    proposedCity: proposed.city,
    proposedCityCode: proposed.cityCode,
    proposedComplement: proposed.complement,
    proposedDistrict: proposed.district,
    proposedNumber: proposed.number,
    proposedPostalCode: proposed.postalCode,
    proposedState: proposed.state,
    proposedStreet: proposed.street,
    reasonDistanceMetres: params.reasonDistanceMetres,
    reasonMatchLevel: params.reasonMatchLevel,
    recipientName: params.recipientName,
    reportedCity: reported.city,
    reportedCityCode: reported.cityCode,
    reportedComplement: reported.complement,
    reportedDistrict: reported.district,
    reportedNumber: reported.number,
    reportedPostalCode: reported.postalCode,
    reportedState: reported.state,
    reportedStreet: reported.street,
  }
}

function toAddressCorrectionRequest(row: AddressCorrectionRow): AddressCorrectionRequest {
  return {
    actorUserId: row.actorUserId,
    addressKey: row.addressKey,
    companyId: row.companyId,
    contractorId: row.contractorId,
    createdAt: row.createdAt,
    id: row.id,
    proposed: {
      city: row.proposedCity,
      cityCode: row.proposedCityCode,
      complement: row.proposedComplement,
      district: row.proposedDistrict,
      number: row.proposedNumber,
      postalCode: row.proposedPostalCode,
      state: row.proposedState,
      street: row.proposedStreet,
    },
    reasonDistanceMetres: row.reasonDistanceMetres,
    reasonMatchLevel: row.reasonMatchLevel,
    recipientName: row.recipientName,
    reported: {
      city: row.reportedCity,
      cityCode: row.reportedCityCode,
      complement: row.reportedComplement,
      district: row.reportedDistrict,
      number: row.reportedNumber,
      postalCode: row.reportedPostalCode,
      state: row.reportedState,
      street: row.reportedStreet,
    },
    sentAt: row.sentAt,
    status: row.status,
    threadId: row.threadId,
    updatedAt: row.updatedAt,
  }
}

export class DrizzleAddressCorrectionRepository implements AddressCorrectionRepositoryPort {
  constructor(private readonly database: Database) {}

  async findContractorByTaxId(
    params: FindContractorByTaxIdParams,
  ): Promise<AddressCorrectionContractor | undefined> {
    const [row] = await this.database
      .select({ displayName: contractors.displayName, id: contractors.id })
      .from(contractors)
      .where(and(eq(contractors.companyId, params.companyId), eq(contractors.taxId, params.taxId)))
      .limit(1)
    return row
  }

  /** O alvo do conflito é o índice parcial do rascunho: um pedido `sent` fica fora dele. */
  async upsertDraft(params: UpsertAddressCorrectionDraftParams): Promise<AddressCorrectionRequest> {
    const editable = toEditableColumns(params)
    const [row] = await this.database
      .insert(addressCorrectionRequests)
      .values({
        ...editable,
        addressKey: params.addressKey,
        companyId: params.companyId,
        status: DRAFT_STATUS,
      })
      .onConflictDoUpdate({
        set: { ...editable, updatedAt: sql`now()` },
        target: [addressCorrectionRequests.companyId, addressCorrectionRequests.addressKey],
        // Literal, not a bind parameter: Postgres only infers the partial index from a constant.
        targetWhere: sql`${addressCorrectionRequests.status} = ${sql.raw(`'${DRAFT_STATUS}'`)}`,
      })
      .returning()
    if (row === undefined) throw new Error('address correction draft was not persisted')
    return toAddressCorrectionRequest(row)
  }

  async findByAddressKeys(
    params: FindAddressCorrectionsByAddressKeysParams,
  ): Promise<readonly AddressCorrectionRequest[]> {
    if (params.addressKeys.length === 0) return []
    const rows = await this.database
      .select()
      .from(addressCorrectionRequests)
      .where(
        and(
          eq(addressCorrectionRequests.companyId, params.companyId),
          inArray(addressCorrectionRequests.addressKey, [...params.addressKeys]),
        ),
      )
      .orderBy(asc(addressCorrectionRequests.createdAt), asc(addressCorrectionRequests.id))
    return rows.map(toAddressCorrectionRequest)
  }

  async listDraftsByContractor(
    params: ListAddressCorrectionDraftsByContractorParams,
  ): Promise<readonly AddressCorrectionRequest[]> {
    const rows = await this.database
      .select()
      .from(addressCorrectionRequests)
      .where(
        and(
          eq(addressCorrectionRequests.companyId, params.companyId),
          eq(addressCorrectionRequests.contractorId, params.contractorId),
          eq(addressCorrectionRequests.status, DRAFT_STATUS),
        ),
      )
      .orderBy(asc(addressCorrectionRequests.addressKey))
    return rows.map(toAddressCorrectionRequest)
  }
}
