/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { billingInvoiceItems } from '../../database/billing.schema.js'
import {
  cteBatchItemCharges,
  cteBatchItemDocuments,
  cteBatchItems,
  cteBatches,
} from '../../database/cte-batch.schema.js'
import {
  cteFiscalDocuments,
  cteIssuanceAttempts,
  cteIssuanceEvents,
} from '../../database/cte-issuance.schema.js'
import { nfeDocuments } from '../../database/nfe.schema.js'
import {
  type CteFiscalDocumentState,
  resolveIssuedDocumentStatus,
} from '../../cte-issuance/domain/cte-fiscal-document-status.policy.js'
import {
  decodeKeysetCursor,
  encodeKeysetCursor,
  type KeysetCursor,
} from '../../shared/keyset-cursor.js'
import {
  CTE_BATCH_ITEM_PENDING_STATUS,
  type CompanyCteItem,
  type CompanyCteItemFilters,
  type CompanyCteItemPage,
  type CompanyCteItemQuery,
  type CteBatchItem,
  type CteBatchItemBillingStatus,
  type CteBatchItemCharge,
  type CteBatchItemDocument,
  type CteBatchItemQuery,
  type CteBatchItemReaderPort,
  type CteFiscalNumberChange,
} from '../application/cte-batch-item.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

type AttemptState = {
  readonly fiscalNumber: string
  readonly fiscalSeries: string
  readonly lastErrorCode: string | null
  readonly status: string
}

type ItemRecord = {
  readonly accessKey: string | null
  readonly authorizationProtocol: string | null
  readonly authorizedAt: Date | null
  readonly calculationSnapshot: unknown
  readonly documentCancellationRequestedAt: Date | null
  readonly documentStatus: string | null
  readonly fiscalDocumentId: string | null
  readonly id: string
  readonly invoiced: boolean
  readonly position: bigint
}

type ItemRelations = {
  readonly attempts: Map<string, AttemptState>
  readonly charges: Map<string, CteBatchItemCharge[]>
  readonly documents: Map<string, CteBatchItemDocument[]>
  readonly fiscalNumberChanges: Map<string, CteFiscalNumberChange>
}

export type CompanyCteItemFilterInput = {
  readonly companyId: string
  readonly cursor: KeysetCursor | null
  readonly filters?: CompanyCteItemFilters | undefined
}

/** Escrito pelo worker quando a SEFAZ acusa duplicidade — o nome é cópia, as apps não se importam. */
const FISCAL_NUMBER_ADVANCED_EVENT = 'fiscal_number_advanced'
const FISCAL_NUMBER_DUPLICATE_REASON = 'sefaz_duplicate_number'

const AUTHORIZED_DOCUMENT_STATUS = 'authorized'
const CANCELLED_DOCUMENT_STATUS = 'cancelled'

/** Número da NF-e é `text`: comparar com padding evita cast que estoura em valor não numérico. */
const INVOICE_NUMBER_WIDTH = 20

const ITEM_PROJECTION = {
  accessKey: cteFiscalDocuments.accessKey,
  authorizationProtocol: cteFiscalDocuments.authorizationProtocol,
  authorizedAt: cteFiscalDocuments.authorizedAt,
  calculationSnapshot: cteBatchItems.calculationSnapshot,
  documentCancellationRequestedAt: cteFiscalDocuments.cancellationRequestedAt,
  documentStatus: cteFiscalDocuments.status,
  fiscalDocumentId: cteFiscalDocuments.id,
  id: cteBatchItems.id,
  invoiced: sql<boolean>`${billingItemExistsExpression()}`,
  position: cteBatchItems.position,
}

const ISSUED_DOCUMENT_JOIN = and(
  eq(cteFiscalDocuments.companyId, cteBatchItems.companyId),
  eq(cteFiscalDocuments.batchItemId, cteBatchItems.id),
)

export class DrizzleCteBatchItemRepository implements CteBatchItemReaderPort {
  public constructor(private readonly database: Database) {}

  public async findBatch(query: CteBatchItemQuery): Promise<{ readonly id: string } | null> {
    const [record] = await this.database
      .select({ id: cteBatches.id })
      .from(cteBatches)
      .where(and(eq(cteBatches.companyId, query.companyId), eq(cteBatches.id, query.batchId)))
      .limit(1)

    return record ?? null
  }

  public async listCompanyItems(query: CompanyCteItemQuery): Promise<CompanyCteItemPage> {
    const records = await this.database
      .select({
        ...ITEM_PROJECTION,
        batchId: cteBatchItems.batchId,
        batchName: cteBatches.name,
        createdAt: cteBatchItems.createdAt,
      })
      .from(cteBatchItems)
      .innerJoin(
        cteBatches,
        and(
          eq(cteBatches.companyId, cteBatchItems.companyId),
          eq(cteBatches.id, cteBatchItems.batchId),
        ),
      )
      .leftJoin(cteFiscalDocuments, ISSUED_DOCUMENT_JOIN)
      .where(
        and(
          ...buildCompanyItemFilters({
            companyId: query.companyId,
            cursor: decodeKeysetCursor(query.cursor),
            filters: query.filters,
          }),
        ),
      )
      .orderBy(desc(cteBatchItems.createdAt), desc(cteBatchItems.id))
      .limit(query.limit + 1)
    if (records.length === 0) return { items: [], nextCursor: null }

    const page = records.slice(0, query.limit)
    const relations = await this.loadRelations(
      query.companyId,
      page.map((record) => record.id),
    )
    const last = page[page.length - 1]

    return {
      items: page.map((record) => toCompanyItem(record, relations)),
      nextCursor:
        records.length > page.length && last !== undefined
          ? encodeKeysetCursor({ createdAt: last.createdAt, id: last.id })
          : null,
    }
  }

  public async listItems(query: CteBatchItemQuery): Promise<readonly CteBatchItem[]> {
    const records = await this.database
      .select(ITEM_PROJECTION)
      .from(cteBatchItems)
      .leftJoin(cteFiscalDocuments, ISSUED_DOCUMENT_JOIN)
      .where(
        and(eq(cteBatchItems.companyId, query.companyId), eq(cteBatchItems.batchId, query.batchId)),
      )
      .orderBy(cteBatchItems.position)
    if (records.length === 0) return []

    const relations = await this.loadRelations(
      query.companyId,
      records.map((record) => record.id),
    )

    return records.map((record) => toBatchItem(record, relations))
  }

  private async loadRelations(
    companyId: string,
    itemIds: readonly string[],
  ): Promise<ItemRelations> {
    const [attempts, charges, documents, fiscalNumberChanges] = await Promise.all([
      loadLatestAttempts(this.database, companyId, itemIds),
      loadCharges(this.database, companyId, itemIds),
      loadDocuments(this.database, companyId, itemIds),
      loadFiscalNumberChanges(this.database, companyId, itemIds),
    ])

    return { attempts, charges, documents, fiscalNumberChanges }
  }
}

/**
 * Filtros da listagem que atravessa lotes. O status e o número do CT-e são derivados, então o filtro
 * recompõe a mesma precedência de `resolveBatchItemStatus` sobre as colunas de origem.
 */
export function buildCompanyItemFilters(input: CompanyCteItemFilterInput): SQL[] {
  const conditions: SQL[] = [eq(cteBatchItems.companyId, input.companyId)]
  if (input.cursor !== null) conditions.push(keysetCondition(input.cursor))

  const filters = input.filters
  if (filters === undefined) return conditions

  if (filters.batchId !== undefined) {
    conditions.push(eq(cteBatchItems.batchId, filters.batchId))
  }
  if (filters.batchIdIn !== undefined) {
    conditions.push(inArray(cteBatchItems.batchId, [...filters.batchIdIn]))
  }
  if (filters.issuedFrom !== undefined) {
    conditions.push(gte(cteBatchItems.createdAt, new Date(filters.issuedFrom)))
  }
  if (filters.issuedUntil !== undefined) {
    conditions.push(lte(cteBatchItems.createdAt, new Date(filters.issuedUntil)))
  }
  if (filters.cteNumberGte !== undefined) {
    conditions.push(sql`${cteNumberExpression()} >= ${BigInt(filters.cteNumberGte)}`)
  }
  if (filters.cteNumberLte !== undefined) {
    conditions.push(sql`${cteNumberExpression()} <= ${BigInt(filters.cteNumberLte)}`)
  }
  if (filters.cteNumberIn !== undefined) {
    conditions.push(
      sql`${cteNumberExpression()} in (${sql.join(
        filters.cteNumberIn.map((value) => sql`${BigInt(value)}`),
        sql`, `,
      )})`,
    )
  }
  const invoiceRange = invoiceNumberCondition(input.companyId, filters)
  if (invoiceRange !== undefined) conditions.push(invoiceRange)
  const invoiceList = invoiceNumberInCondition(input.companyId, filters)
  if (invoiceList !== undefined) conditions.push(invoiceList)

  const billingStatuses = filters.billingStatusIn
  if (billingStatuses !== undefined && billingStatuses.length > 0) {
    conditions.push(sql`(${sql.join(billingStatuses.map(billingStatusCondition), sql` or `)})`)
  }

  const statuses = filters.statusIn
  if (statuses !== undefined && statuses.length > 0) {
    conditions.push(sql`(${sql.join(statuses.map(statusCondition), sql` or `)})`)
  }

  return conditions
}

/**
 * Documento fiscal gravado manda sobre a última tentativa: uma tentativa recusada depois da
 * autorização não desautoriza o CT-e que a SEFAZ já aceitou (ADR-0018).
 */
export function resolveBatchItemStatus(input: {
  readonly attemptStatus: string | undefined
  readonly document: CteFiscalDocumentState | null
}): string {
  if (input.document !== null) return resolveIssuedDocumentStatus(input.document)
  return input.attemptStatus ?? CTE_BATCH_ITEM_PENDING_STATUS
}

function keysetCondition(cursor: KeysetCursor): SQL {
  return sql`(${lt(cteBatchItems.createdAt, cursor.createdAt)} or (${eq(
    cteBatchItems.createdAt,
    cursor.createdAt,
  )} and ${lt(cteBatchItems.id, cursor.id)}))`
}

/** Última tentativa do item, lida por subquery correlacionada para não multiplicar linhas. */
function latestAttemptExpression(column: AnyPgColumn): SQL {
  return sql`(select ${column} from ${cteIssuanceAttempts} where ${eq(
    cteIssuanceAttempts.companyId,
    cteBatchItems.companyId,
  )} and ${eq(cteIssuanceAttempts.batchItemId, cteBatchItems.id)} order by ${
    cteIssuanceAttempts.attemptNumber
  } desc limit 1)`
}

/** Mesma regra da elegibilidade: o CT-e já lançado em fatura sai da fila, e o recorte é por tenant. */
function billingItemExistsExpression(): SQL {
  return sql`exists (select 1 from ${billingInvoiceItems} where ${eq(
    billingInvoiceItems.companyId,
    cteBatchItems.companyId,
  )} and ${eq(billingInvoiceItems.cteDocumentId, cteFiscalDocuments.id)})`
}

function billingStatusCondition(status: string): SQL {
  if (status === CTE_BATCH_ITEM_PENDING_STATUS) return sql`not ${billingItemExistsExpression()}`

  return billingItemExistsExpression()
}

function cteNumberExpression(): SQL {
  return sql`coalesce(${cteFiscalDocuments.fiscalNumber}, ${latestAttemptExpression(
    cteIssuanceAttempts.fiscalNumber,
  )})`
}

function statusCondition(status: string): SQL {
  const withoutDocument = attemptStatusCondition(status)
  if (status === AUTHORIZED_DOCUMENT_STATUS) {
    return sql`((${eq(cteFiscalDocuments.status, AUTHORIZED_DOCUMENT_STATUS)} and ${isNull(
      cteFiscalDocuments.cancellationRequestedAt,
    )}) or ${withoutDocument})`
  }
  if (status === CANCELLED_DOCUMENT_STATUS) {
    return sql`((${eq(cteFiscalDocuments.status, CANCELLED_DOCUMENT_STATUS)} or ${isNotNull(
      cteFiscalDocuments.cancellationRequestedAt,
    )}) or ${withoutDocument})`
  }

  return withoutDocument
}

/** Sem documento gravado quem responde é a última tentativa — inclusive para `authorized`/`cancelled`. */
function attemptStatusCondition(status: string): SQL {
  const attemptStatus = latestAttemptExpression(cteIssuanceAttempts.status)
  if (status === CTE_BATCH_ITEM_PENDING_STATUS) {
    return sql`(${isNull(
      cteFiscalDocuments.status,
    )} and coalesce(${attemptStatus}, ${CTE_BATCH_ITEM_PENDING_STATUS}) = ${status})`
  }

  return sql`(${isNull(cteFiscalDocuments.status)} and ${attemptStatus} = ${status})`
}

function invoiceNumberCondition(
  companyId: string,
  filters: CompanyCteItemFilters,
): SQL | undefined {
  const bounds: SQL[] = []
  if (filters.invoiceNumberGte !== undefined) {
    bounds.push(sql`${paddedInvoiceNumber()} >= ${paddedInvoiceBound(filters.invoiceNumberGte)}`)
  }
  if (filters.invoiceNumberLte !== undefined) {
    bounds.push(sql`${paddedInvoiceNumber()} <= ${paddedInvoiceBound(filters.invoiceNumberLte)}`)
  }
  if (bounds.length === 0) return undefined

  return sql`${cteBatchItems.id} in (select ${cteBatchItemDocuments.itemId} from ${
    cteBatchItemDocuments
  } inner join ${nfeDocuments} on ${eq(
    nfeDocuments.id,
    cteBatchItemDocuments.nfeDocumentId,
  )} where ${eq(cteBatchItemDocuments.companyId, companyId)} and ${eq(
    nfeDocuments.companyId,
    companyId,
  )} and ${sql.join(bounds, sql` and `)})`
}

function invoiceNumberInCondition(
  companyId: string,
  filters: CompanyCteItemFilters,
): SQL | undefined {
  const values = filters.invoiceNumberIn
  if (values === undefined) return undefined

  return sql`${cteBatchItems.id} in (select ${cteBatchItemDocuments.itemId} from ${
    cteBatchItemDocuments
  } inner join ${nfeDocuments} on ${eq(
    nfeDocuments.id,
    cteBatchItemDocuments.nfeDocumentId,
  )} where ${eq(cteBatchItemDocuments.companyId, companyId)} and ${eq(
    nfeDocuments.companyId,
    companyId,
  )} and ${paddedInvoiceNumber()} in (${sql.join(
    values.map((value) => paddedInvoiceBound(value)),
    sql`, `,
  )}))`
}

function paddedInvoiceNumber(): SQL {
  return sql`lpad(${nfeDocuments.number}, ${sql.raw(String(INVOICE_NUMBER_WIDTH))}, '0')`
}

function paddedInvoiceBound(value: string): SQL {
  return sql`lpad(${value}, ${sql.raw(String(INVOICE_NUMBER_WIDTH))}, '0')`
}

function toBatchItem(record: ItemRecord, relations: ItemRelations): CteBatchItem {
  const attempt = relations.attempts.get(record.id)
  const snapshot = record.calculationSnapshot

  return {
    accessKey: record.accessKey,
    authorizationProtocol: record.authorizationProtocol,
    authorizedAt: record.authorizedAt?.toISOString() ?? null,
    baseAmount: requiredSnapshotAmount(snapshot, 'baseAmount'),
    billingStatus: toBillingStatus(record.invoiced),
    charges: relations.charges.get(record.id) ?? [],
    documents: relations.documents.get(record.id) ?? [],
    fiscalAmount: requiredSnapshotAmount(snapshot, 'fiscalAmount'),
    fiscalDocumentId: record.fiscalDocumentId,
    fiscalNumber: attempt?.fiscalNumber ?? null,
    fiscalNumberChange: relations.fiscalNumberChanges.get(record.id) ?? null,
    fiscalSeries: attempt?.fiscalSeries ?? null,
    id: record.id,
    lastErrorCode: attempt?.lastErrorCode ?? null,
    position: record.position.toString(),
    status: resolveBatchItemStatus({
      attemptStatus: attempt?.status,
      document:
        record.documentStatus === null
          ? null
          : {
              cancellationRequestedAt: record.documentCancellationRequestedAt,
              status: record.documentStatus,
            },
    }),
    totalAmount: requiredSnapshotAmount(snapshot, 'calculatedAmount'),
  }
}

function toBillingStatus(invoiced: boolean): CteBatchItemBillingStatus {
  return invoiced ? 'invoiced' : CTE_BATCH_ITEM_PENDING_STATUS
}

function toCompanyItem(
  record: ItemRecord & {
    readonly batchId: string
    readonly batchName: string
    readonly createdAt: Date
  },
  relations: ItemRelations,
): CompanyCteItem {
  return {
    ...toBatchItem(record, relations),
    batchId: record.batchId,
    batchName: record.batchName,
    createdAt: record.createdAt.toISOString(),
  }
}

/** A última tentativa é o estado corrente do CT-e — as anteriores são histórico. */
async function loadLatestAttempts(
  database: Database,
  companyId: string,
  itemIds: readonly string[],
): Promise<Map<string, AttemptState>> {
  const rows = await database
    .selectDistinctOn([cteIssuanceAttempts.batchItemId], {
      batchItemId: cteIssuanceAttempts.batchItemId,
      fiscalNumber: cteIssuanceAttempts.fiscalNumber,
      fiscalSeries: cteIssuanceAttempts.fiscalSeries,
      lastErrorCode: cteIssuanceAttempts.lastErrorCode,
      status: cteIssuanceAttempts.status,
    })
    .from(cteIssuanceAttempts)
    .where(
      and(
        eq(cteIssuanceAttempts.companyId, companyId),
        inArray(cteIssuanceAttempts.batchItemId, [...itemIds]),
      ),
    )
    .orderBy(cteIssuanceAttempts.batchItemId, desc(cteIssuanceAttempts.attemptNumber))

  return new Map(
    rows.map((row) => [
      row.batchItemId,
      {
        fiscalNumber: row.fiscalNumber.toString(),
        fiscalSeries: row.fiscalSeries,
        lastErrorCode: row.lastErrorCode,
        status: row.status,
      },
    ]),
  )
}

/**
 * O item pode ter avançado a numeração mais de uma vez; o que interessa ao usuário é o número que
 * ele viu primeiro, então vale o evento mais antigo — o número corrente já vem da tentativa.
 */
async function loadFiscalNumberChanges(
  database: Database,
  companyId: string,
  itemIds: readonly string[],
): Promise<Map<string, CteFiscalNumberChange>> {
  const rows = await database
    .selectDistinctOn([cteIssuanceEvents.batchItemId], {
      batchItemId: cteIssuanceEvents.batchItemId,
      payload: cteIssuanceEvents.payload,
    })
    .from(cteIssuanceEvents)
    .where(
      and(
        eq(cteIssuanceEvents.companyId, companyId),
        eq(cteIssuanceEvents.eventName, FISCAL_NUMBER_ADVANCED_EVENT),
        inArray(cteIssuanceEvents.batchItemId, [...itemIds]),
      ),
    )
    .orderBy(cteIssuanceEvents.batchItemId, cteIssuanceEvents.occurredAt)

  const changes = new Map<string, CteFiscalNumberChange>()
  for (const row of rows) {
    const change = toFiscalNumberChange(row.payload)
    if (change !== null) changes.set(row.batchItemId, change)
  }

  return changes
}

function toFiscalNumberChange(payload: unknown): CteFiscalNumberChange | null {
  if (typeof payload !== 'object' || payload === null) return null

  const record = payload as Record<string, unknown>
  const burnedNumber = record['burnedNumber']
  const rejectionCode = record['rejectionCode']
  if (record['reason'] !== FISCAL_NUMBER_DUPLICATE_REASON) return null
  if (typeof burnedNumber !== 'number' || typeof rejectionCode !== 'string') return null

  return {
    previousNumber: burnedNumber.toString(),
    reason: FISCAL_NUMBER_DUPLICATE_REASON,
    rejectionCode,
  }
}

async function loadCharges(
  database: Database,
  companyId: string,
  itemIds: readonly string[],
): Promise<Map<string, CteBatchItemCharge[]>> {
  const rows = await database
    .select({
      amount: cteBatchItemCharges.amount,
      baseAmount: cteBatchItemCharges.baseAmount,
      calculationType: cteBatchItemCharges.calculationType,
      itemId: cteBatchItemCharges.itemId,
      label: cteBatchItemCharges.label,
      ordinal: cteBatchItemCharges.ordinal,
      rate: cteBatchItemCharges.rate,
    })
    .from(cteBatchItemCharges)
    .where(
      and(
        eq(cteBatchItemCharges.companyId, companyId),
        inArray(cteBatchItemCharges.itemId, [...itemIds]),
      ),
    )
    .orderBy(cteBatchItemCharges.itemId, cteBatchItemCharges.ordinal)

  const charges = new Map<string, CteBatchItemCharge[]>()
  for (const row of rows) {
    const current = charges.get(row.itemId) ?? []
    current.push({
      amount: row.amount,
      baseAmount: row.baseAmount,
      calculationType: row.calculationType,
      label: row.label,
      ordinal: row.ordinal.toString(),
      rate: row.rate,
    })
    charges.set(row.itemId, current)
  }

  return charges
}

async function loadDocuments(
  database: Database,
  companyId: string,
  itemIds: readonly string[],
): Promise<Map<string, CteBatchItemDocument[]>> {
  const rows = await database
    .select({
      accessKey: nfeDocuments.accessKey,
      id: nfeDocuments.id,
      itemId: cteBatchItemDocuments.itemId,
      number: nfeDocuments.number,
      position: cteBatchItemDocuments.position,
      series: nfeDocuments.series,
      totalAmount: nfeDocuments.totalValue,
    })
    .from(cteBatchItemDocuments)
    .innerJoin(
      nfeDocuments,
      and(
        eq(nfeDocuments.companyId, cteBatchItemDocuments.companyId),
        eq(nfeDocuments.id, cteBatchItemDocuments.nfeDocumentId),
      ),
    )
    .where(
      and(
        eq(cteBatchItemDocuments.companyId, companyId),
        inArray(cteBatchItemDocuments.itemId, [...itemIds]),
      ),
    )
    .orderBy(cteBatchItemDocuments.itemId, cteBatchItemDocuments.position)

  const documents = new Map<string, CteBatchItemDocument[]>()
  for (const row of rows) {
    const current = documents.get(row.itemId) ?? []
    current.push({
      accessKey: row.accessKey,
      id: row.id,
      number: row.number,
      position: row.position.toString(),
      series: row.series,
      totalAmount: row.totalAmount,
    })
    documents.set(row.itemId, current)
  }

  return documents
}

function requiredSnapshotAmount(snapshot: unknown, key: string): string {
  if (typeof snapshot !== 'object' || snapshot === null) {
    throw new Error('CTE_BATCH_ITEM_SNAPSHOT_INVALID')
  }
  const value = (snapshot as Record<string, unknown>)[key]
  if (typeof value !== 'string') throw new Error('CTE_BATCH_ITEM_SNAPSHOT_INVALID')

  return value
}
