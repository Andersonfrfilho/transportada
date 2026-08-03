/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type {
  ArchivedInvoiceDocument,
  CreateInvoiceDocumentEventInput,
  CreateInvoiceDocumentInput,
  CreateInvoiceStoredObjectInput,
  InvoiceDocumentContext,
  InvoiceDocumentInvoice,
  InvoiceDocumentLogo,
  InvoiceDocumentRecord,
  InvoiceDocumentRepositoryPort,
  InvoiceDocumentScope,
} from '../../src/billing/application/invoice-document.port.js'
import { InvoiceFiscalProfileMissingError } from '../../src/billing/domain/invoice-layout.error.js'
import type {
  InvoiceLayoutProfile,
  InvoiceLayoutReportRow,
} from '../../src/billing/domain/invoice-layout.policy.js'
import type { ApiError } from '../../src/shared/api.error.js'

export { captureApiError } from './support.js'

export const COMPANY_ID = 'company-001'
export const USER_ID = 'user-001'
export const INVOICE_ID = 'billing-invoice-001'
export const DOCUMENT_ID = 'billing-invoice-document-001'
export const OBJECT_ID = 'stored-object-001'
export const EXPIRES_AT = '2026-07-30T13:50:00.000Z'
export const PRINTED_AT = '2026-07-30T13:45:00.000Z'
export const PDF_BYTES = Buffer.from('%PDF-1.3 documento sintetico de fatura\n%%EOF\n', 'latin1')
export const PDF_SHA256 = createHash('sha256').update(PDF_BYTES).digest('hex')
export const PAGE_COUNT = 2

export const ARCHIVED_DOCUMENT: ArchivedInvoiceDocument = {
  bucket: 'transportada-test',
  objectKey: `tenants/${COMPANY_ID}/billing-invoices/${INVOICE_ID}/pdf/${OBJECT_ID}.pdf`,
  provider: 'object-storage',
}

export const PROFILE: InvoiceLayoutProfile = {
  city: 'Cidade Sintetica',
  cnpj: '11222333000181',
  defaultObservations: '',
  district: 'Bairro Sintetico',
  email: 'faturamento@transportadora-sintetica.test',
  legalName: 'TRANSPORTADORA SINTETICA LTDA',
  number: '1000',
  payment: { bankAccount: '', bankBranch: '', bankCode: '', bankName: '', pixKey: '' },
  phone: '1140000000',
  postalCode: '01000000',
  state: 'SP',
  stateRegistration: '110042490114',
  street: 'Rua Sintetica',
  tradeName: 'Sintetica Transportes',
}

export const INVOICE: InvoiceDocumentInvoice = {
  companyId: COMPANY_ID,
  customerDocument: '44555666000172',
  customerName: 'TOMADOR SINTETICO LTDA',
  dueDate: new Date('2026-08-20T00:00:00.000Z'),
  id: INVOICE_ID,
  invoiceNumber: 42n,
  issueDate: new Date('2026-07-21T00:00:00.000Z'),
  observations: 'Deposito em conta sintetica, agencia 0001.',
  totalAmount: '1234.56',
}

export const REPORT_ROWS: readonly InvoiceLayoutReportRow[] = [
  {
    cteFiscalNumber: 1000n,
    cteFiscalSeries: '1',
    grossWeight: '130.5000',
    issuedAt: new Date('2026-07-10T12:00:00.000Z'),
    netWeight: '119.0000',
    nfeDocuments: [{ number: '500', series: '1' }],
    recipientLegalName: 'DESTINATARIO SINTETICO LTDA',
    recipientTaxId: '44555666000172',
    totalAmount: '1234.56',
  },
]

export const LOGO: InvoiceDocumentLogo = { bytes: Buffer.from('logo-sintetico', 'latin1') }

export type RenderCall = {
  readonly logo: InvoiceDocumentLogo | null
  readonly printedAt: Date
  readonly profile: InvoiceLayoutProfile | null
  readonly rows: readonly InvoiceLayoutReportRow[]
}

export class InvoiceDocumentRendererFixture {
  public readonly calls: RenderCall[] = []

  public async render(input: {
    readonly logo: InvoiceDocumentLogo | null
    readonly printedAt: Date
    readonly profile: InvoiceLayoutProfile | null
    readonly rows: readonly InvoiceLayoutReportRow[]
  }): Promise<{ readonly bytes: Buffer; readonly pageCount: number }> {
    this.calls.push({
      logo: input.logo,
      printedAt: input.printedAt,
      profile: input.profile,
      rows: input.rows,
    })
    if (input.profile === null) throw new InvoiceFiscalProfileMissingError()
    return { bytes: PDF_BYTES, pageCount: PAGE_COUNT }
  }
}

export class InvoiceDocumentArchiveFixture {
  public readonly downloadRequests: Array<Record<string, unknown>> = []
  public readonly puts: Array<Record<string, unknown>> = []
  public failure: ApiError | null = null

  public async put(input: {
    readonly bytes: Buffer
    readonly companyId: string
    readonly contentType: string
    readonly invoiceId: string
    readonly objectId: string
    readonly sha256: string
  }): Promise<ArchivedInvoiceDocument> {
    if (this.failure !== null) throw this.failure
    this.puts.push({ ...input })
    return ARCHIVED_DOCUMENT
  }

  public async createDownloadUrl(input: {
    readonly bucket: string
    readonly fileName: string
    readonly key: string
  }): Promise<{ readonly expiresAt: string; readonly url: string }> {
    this.downloadRequests.push({ ...input })
    return { expiresAt: EXPIRES_AT, url: `https://storage.test/${input.key}` }
  }
}

export class InvoiceDocumentRepositoryFixture implements InvoiceDocumentRepositoryPort {
  public readonly documents: Array<Record<string, unknown>> = []
  public readonly events: Array<Record<string, unknown>> = []
  public readonly storedObjects: Array<Record<string, unknown>> = []

  public invoice: InvoiceDocumentInvoice = INVOICE
  public logo: InvoiceDocumentLogo | null = null
  public loseInsertRace = false
  public profile: InvoiceLayoutProfile | null = PROFILE
  public reportRows: readonly InvoiceLayoutReportRow[] = REPORT_ROWS

  private readonly records: InvoiceDocumentRecord[] = []
  private raceLost = false

  public async execute<TResponse>(
    operation: (transaction: InvoiceDocumentRepositoryPort) => Promise<TResponse>,
  ): Promise<TResponse> {
    const lengths = {
      documents: this.documents.length,
      events: this.events.length,
      records: this.records.length,
      storedObjects: this.storedObjects.length,
    }

    try {
      return await operation(this)
    } catch (error) {
      this.documents.length = lengths.documents
      this.events.length = lengths.events
      this.records.length = lengths.records
      this.storedObjects.length = lengths.storedObjects
      throw error
    }
  }

  public async findInvoice(input: InvoiceDocumentScope): Promise<InvoiceDocumentInvoice | null> {
    return this.invoice.id === input.invoiceId ? this.invoice : null
  }

  public async findCompanyLogo(): Promise<InvoiceDocumentLogo | null> {
    return this.logo
  }

  public async findFiscalProfile(): Promise<InvoiceLayoutProfile | null> {
    return this.profile
  }

  public async findInvoiceReportRows(): Promise<readonly InvoiceLayoutReportRow[]> {
    return this.reportRows
  }

  public async findInvoiceDocument(input: {
    readonly documentKind: string
  }): Promise<InvoiceDocumentRecord | null> {
    if (this.raceLost) return buildRecord()
    return this.records.find((record) => record.documentKind === input.documentKind) ?? null
  }

  public async listInvoiceDocuments(): Promise<readonly InvoiceDocumentRecord[]> {
    return this.records
  }

  public async createStoredObject(input: CreateInvoiceStoredObjectInput): Promise<void> {
    this.storedObjects.push({ ...input })
  }

  public async createInvoiceDocument(
    input: CreateInvoiceDocumentInput,
  ): Promise<InvoiceDocumentRecord | null> {
    if (this.loseInsertRace) {
      this.raceLost = true
      return null
    }
    this.documents.push({ ...input })
    const record = buildRecord()
    this.records.push(record)
    return record
  }

  public async createInvoiceEvent(input: CreateInvoiceDocumentEventInput): Promise<void> {
    this.events.push({ ...input })
  }
}

function buildRecord(): InvoiceDocumentRecord {
  return {
    bucket: ARCHIVED_DOCUMENT.bucket,
    byteSize: BigInt(PDF_BYTES.byteLength),
    documentKind: 'pdf',
    documentVersion: 1n,
    id: DOCUMENT_ID,
    mimeType: 'application/pdf',
    objectId: OBJECT_ID,
    objectKey: ARCHIVED_DOCUMENT.objectKey,
    sha256: PDF_SHA256,
  }
}

export type InvoiceDocumentFixture = {
  readonly archive: InvoiceDocumentArchiveFixture
  readonly context: InvoiceDocumentContext
  readonly dependencies: {
    readonly archive: InvoiceDocumentArchiveFixture
    readonly clock: () => Date
    readonly createObjectId: () => string
    readonly renderer: InvoiceDocumentRendererFixture
    readonly repository: InvoiceDocumentRepositoryFixture
  }
  readonly renderer: InvoiceDocumentRendererFixture
  readonly repository: InvoiceDocumentRepositoryFixture
}

export function createInvoiceDocumentFixture(): InvoiceDocumentFixture {
  const archive = new InvoiceDocumentArchiveFixture()
  const renderer = new InvoiceDocumentRendererFixture()
  const repository = new InvoiceDocumentRepositoryFixture()

  return {
    archive,
    context: { companyId: COMPANY_ID, userId: USER_ID },
    dependencies: {
      archive,
      clock: () => new Date(PRINTED_AT),
      createObjectId: () => OBJECT_ID,
      renderer,
      repository,
    },
    renderer,
    repository,
  }
}
