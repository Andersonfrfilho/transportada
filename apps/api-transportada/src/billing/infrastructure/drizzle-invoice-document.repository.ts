/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, type SQL } from 'drizzle-orm'

import { BILLING_DOCUMENT_KINDS } from '../../database/billing.schema.js'
import {
  billingInvoiceDocuments,
  billingInvoiceEvents,
  billingInvoices,
  companyFiscalProfiles,
  companyLogos,
  storedObjects,
} from '../../database/database.schema.js'
import type {
  CreateInvoiceDocumentEventInput,
  CreateInvoiceDocumentInput,
  CreateInvoiceStoredObjectInput,
  InvoiceDocumentInvoice,
  InvoiceDocumentLogo,
  InvoiceDocumentRecord,
  InvoiceDocumentRepositoryPort,
  InvoiceDocumentScope,
} from '../application/invoice-document.port.js'
import type {
  InvoiceLayoutProfile,
  InvoiceLayoutReportRow,
} from '../domain/invoice-layout.policy.js'
import { findInvoiceReportRows } from './invoice-report.query.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]
type Queryable = Database | Transaction

const EVENT_VERSION = 1n

type DocumentKind = (typeof BILLING_DOCUMENT_KINDS)[number]

export const DOCUMENT_INVOICE_SELECTION = {
  companyId: billingInvoices.companyId,
  customerDocument: billingInvoices.customerDocument,
  customerName: billingInvoices.customerName,
  dueDate: billingInvoices.dueDate,
  id: billingInvoices.id,
  invoiceNumber: billingInvoices.invoiceNumber,
  issueDate: billingInvoices.issueDate,
  observations: billingInvoices.observations,
  totalAmount: billingInvoices.totalAmount,
} as const

export const DOCUMENT_FISCAL_PROFILE_SELECTION = {
  city: companyFiscalProfiles.city,
  cnpj: companyFiscalProfiles.cnpj,
  defaultObservations: companyFiscalProfiles.billingObservations,
  district: companyFiscalProfiles.district,
  email: companyFiscalProfiles.email,
  legalName: companyFiscalProfiles.legalName,
  number: companyFiscalProfiles.number,
  payment: {
    bankAccount: companyFiscalProfiles.billingBankAccount,
    bankBranch: companyFiscalProfiles.billingBankBranch,
    bankCode: companyFiscalProfiles.billingBankCode,
    bankName: companyFiscalProfiles.billingBankName,
    pixKey: companyFiscalProfiles.billingPixKey,
  },
  phone: companyFiscalProfiles.phone,
  postalCode: companyFiscalProfiles.postalCode,
  state: companyFiscalProfiles.state,
  stateRegistration: companyFiscalProfiles.stateRegistration,
  street: companyFiscalProfiles.street,
  tradeName: companyFiscalProfiles.tradeName,
} as const

export function buildDocumentInvoiceFilters(input: InvoiceDocumentScope): SQL[] {
  return [eq(billingInvoices.companyId, input.companyId), eq(billingInvoices.id, input.invoiceId)]
}

export function buildDocumentFiscalProfileFilters(input: { readonly companyId: string }): SQL[] {
  return [eq(companyFiscalProfiles.companyId, input.companyId)]
}

export function buildInvoiceDocumentFilters(
  input: InvoiceDocumentScope & { readonly documentKind: string },
): SQL[] {
  return [
    ...buildInvoiceDocumentListFilters(input),
    eq(billingInvoiceDocuments.documentKind, input.documentKind as DocumentKind),
  ]
}

export function buildInvoiceDocumentListFilters(input: InvoiceDocumentScope): SQL[] {
  return [
    eq(billingInvoiceDocuments.companyId, input.companyId),
    eq(billingInvoiceDocuments.invoiceId, input.invoiceId),
  ]
}

class DrizzleInvoiceDocumentTransaction implements InvoiceDocumentRepositoryPort {
  public constructor(protected readonly database: Queryable) {}

  public async findInvoice(input: InvoiceDocumentScope): Promise<InvoiceDocumentInvoice | null> {
    const [record] = await this.database
      .select(DOCUMENT_INVOICE_SELECTION)
      .from(billingInvoices)
      .where(and(...buildDocumentInvoiceFilters(input)))
      .limit(1)

    return record ?? null
  }

  public async findCompanyLogo(input: {
    readonly companyId: string
  }): Promise<InvoiceDocumentLogo | null> {
    const [record] = await this.database
      .select({ contentBase64: companyLogos.contentBase64 })
      .from(companyLogos)
      .where(eq(companyLogos.companyId, input.companyId))
      .limit(1)
    if (record === undefined) return null

    return { bytes: Buffer.from(record.contentBase64, 'base64') }
  }

  public async findFiscalProfile(input: {
    readonly companyId: string
  }): Promise<InvoiceLayoutProfile | null> {
    const [record] = await this.database
      .select(DOCUMENT_FISCAL_PROFILE_SELECTION)
      .from(companyFiscalProfiles)
      .where(and(...buildDocumentFiscalProfileFilters(input)))
      .limit(1)

    return record ?? null
  }

  public async findInvoiceReportRows(
    input: InvoiceDocumentScope,
  ): Promise<readonly InvoiceLayoutReportRow[]> {
    return findInvoiceReportRows(this.database, {
      companyId: input.companyId,
      invoiceId: input.invoiceId,
    })
  }

  public async findInvoiceDocument(
    input: InvoiceDocumentScope & { readonly documentKind: string },
  ): Promise<InvoiceDocumentRecord | null> {
    const [record] = await this.selectDocuments(buildInvoiceDocumentFilters(input)).limit(1)
    return record ?? null
  }

  public async listInvoiceDocuments(
    input: InvoiceDocumentScope,
  ): Promise<readonly InvoiceDocumentRecord[]> {
    return this.selectDocuments(buildInvoiceDocumentListFilters(input)).orderBy(
      asc(billingInvoiceDocuments.createdAt),
    )
  }

  public async createStoredObject(input: CreateInvoiceStoredObjectInput): Promise<void> {
    await this.database.insert(storedObjects).values({
      bucket: input.bucket,
      companyId: input.companyId,
      id: input.id,
      mimeType: input.mimeType,
      objectKey: input.objectKey,
      provider: input.provider,
      purpose: 'billing_document',
      sha256: input.sha256,
      sizeBytes: input.sizeBytes,
      status: 'final',
    })
  }

  public async createInvoiceDocument(
    input: CreateInvoiceDocumentInput,
  ): Promise<InvoiceDocumentRecord | null> {
    const [inserted] = await this.database
      .insert(billingInvoiceDocuments)
      .values({
        byteSize: input.byteSize,
        companyId: input.companyId,
        documentKind: input.documentKind as DocumentKind,
        documentVersion: input.documentVersion,
        invoiceId: input.invoiceId,
        mimeType: input.mimeType,
        objectId: input.objectId,
        sha256: input.sha256,
      })
      .onConflictDoNothing()
      .returning({ id: billingInvoiceDocuments.id })
    if (inserted === undefined) return null

    return this.findInvoiceDocument({
      companyId: input.companyId,
      documentKind: input.documentKind,
      invoiceId: input.invoiceId,
    })
  }

  public async createInvoiceEvent(input: CreateInvoiceDocumentEventInput): Promise<void> {
    await this.database.insert(billingInvoiceEvents).values({
      actorUserId: input.actorUserId,
      companyId: input.companyId,
      eventName: input.eventName,
      eventVersion: EVENT_VERSION,
      invoiceId: input.invoiceId,
      occurredAt: new Date(),
      payload: input.payload,
    })
  }

  private selectDocuments(filters: readonly SQL[]) {
    return this.database
      .select({
        bucket: storedObjects.bucket,
        byteSize: billingInvoiceDocuments.byteSize,
        documentKind: billingInvoiceDocuments.documentKind,
        documentVersion: billingInvoiceDocuments.documentVersion,
        id: billingInvoiceDocuments.id,
        mimeType: billingInvoiceDocuments.mimeType,
        objectId: billingInvoiceDocuments.objectId,
        objectKey: storedObjects.objectKey,
        sha256: billingInvoiceDocuments.sha256,
      })
      .from(billingInvoiceDocuments)
      .innerJoin(
        storedObjects,
        and(
          eq(storedObjects.companyId, billingInvoiceDocuments.companyId),
          eq(storedObjects.id, billingInvoiceDocuments.objectId),
        ),
      )
      .where(and(...filters))
  }
}

export class DrizzleInvoiceDocumentRepository extends DrizzleInvoiceDocumentTransaction {
  public constructor(private readonly rootDatabase: Database) {
    super(rootDatabase)
  }

  public execute<TResponse>(
    operation: (transaction: InvoiceDocumentRepositoryPort) => Promise<TResponse>,
  ): Promise<TResponse> {
    return this.rootDatabase.transaction((transaction) =>
      operation(new DrizzleInvoiceDocumentTransaction(transaction)),
    )
  }
}
