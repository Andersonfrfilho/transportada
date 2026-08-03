/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { FISCAL_MONEY_SCALE, parseScaledDecimal } from '../../shared/decimal.service.js'
import { invoiceAmountInWords } from './invoice-amount-in-words.service.js'
import { InvoiceFiscalProfileMissingError } from './invoice-layout.error.js'

const AMOUNT_ERROR_CODE_PREFIX = 'BILLING_INVOICE_LAYOUT'
const CNPJ_LENGTH = 14
const CPF_LENGTH = 11
const PAYMENT_BLOCK_TITLE = 'DADOS PARA PAGAMENTO'
const POSTAL_CODE_LENGTH = 8
const THOUSANDS_PATTERN = /\B(?=(\d{3})+(?!\d))/g
const SEPARATOR = ' · '

export const INVOICE_TABLE_COLUMNS = [
  { align: 'left', key: 'issuedAt', label: 'Emissão', width: 52 },
  { align: 'left', key: 'cteNumber', label: 'Nº CT-e', width: 44 },
  { align: 'left', key: 'cteSeries', label: 'Série', width: 24 },
  { align: 'left', key: 'recipientTaxId', label: 'CNPJ destinatário', width: 72 },
  { align: 'left', key: 'recipientLegalName', label: 'Destinatário', width: 113 },
  { align: 'left', key: 'nfe', label: 'NF-e', width: 60 },
  { align: 'right', key: 'grossWeight', label: 'Peso bruto', width: 50 },
  { align: 'right', key: 'netWeight', label: 'Peso líquido', width: 50 },
  { align: 'right', key: 'totalAmount', label: 'Valor', width: 58 },
] as const

export type InvoiceLayoutPaymentProfile = {
  readonly bankAccount: string
  readonly bankBranch: string
  readonly bankCode: string
  readonly bankName: string
  readonly pixKey: string
}

export type InvoiceLayoutProfile = {
  readonly city: string
  readonly cnpj: string
  readonly defaultObservations: string
  readonly district: string
  readonly email: string
  readonly legalName: string
  readonly number: string
  readonly payment: InvoiceLayoutPaymentProfile
  readonly phone: string
  readonly postalCode: string
  readonly state: string
  readonly stateRegistration: string
  readonly street: string
  readonly tradeName: string
}

export type InvoiceLayoutInvoice = {
  readonly customerDocument: string
  readonly customerName: string
  readonly dueDate: Date
  readonly invoiceNumber: bigint
  readonly issueDate: Date
  readonly totalAmount: string
}

export type InvoiceLayoutReportRow = {
  readonly cteFiscalNumber: bigint
  readonly cteFiscalSeries: string
  readonly grossWeight: string
  readonly issuedAt: Date | null
  readonly netWeight: string
  readonly nfeDocuments: readonly { readonly number: string; readonly series: string }[]
  readonly recipientLegalName: null | string
  readonly recipientTaxId: null | string
  readonly totalAmount: string
}

export type InvoiceLayoutCarrier = {
  readonly addressLine: string
  readonly contactLine: string
  readonly legalName: string
  readonly taxLine: string
  readonly tradeName: string
}

export type InvoiceLayoutField = {
  readonly label: string
  readonly value: string
}

export type InvoiceLayoutBlock = {
  readonly fields: readonly InvoiceLayoutField[]
  readonly title: string
}

export type InvoiceLayoutPage = {
  readonly pageNumber: number
  readonly rows: readonly InvoiceLayoutReportRow[]
}

export type InvoiceLayout = {
  readonly carrier: InvoiceLayoutCarrier
  readonly customer: InvoiceLayoutBlock
  readonly invoice: InvoiceLayoutBlock
  readonly observations: string
  readonly pageCount: number
  readonly pages: readonly InvoiceLayoutPage[]
  readonly payment: InvoiceLayoutBlock | null
  readonly totalInWords: string
}

export type BuildInvoiceLayoutInput = {
  readonly invoice: InvoiceLayoutInvoice
  readonly observations: string
  readonly profile: InvoiceLayoutProfile | null
  readonly rows: readonly InvoiceLayoutReportRow[]
  readonly rowsPerPage: number
}

export function buildInvoiceLayout(input: BuildInvoiceLayoutInput): InvoiceLayout {
  const { profile } = input
  if (profile === null) throw new InvoiceFiscalProfileMissingError()

  const pages = paginateRows(input.rows, input.rowsPerPage)

  return {
    carrier: buildCarrier(profile),
    customer: buildCustomerBlock(input.invoice),
    invoice: buildInvoiceBlock(input.invoice),
    /** Sem observação própria a fatura herda o texto padrão cadastrado na empresa. */
    observations: input.observations.trim() || profile.defaultObservations.trim(),
    pageCount: pages.length,
    pages,
    payment: buildPaymentBlock(profile.payment),
    totalInWords: invoiceAmountInWords(parseAmount(input.invoice.totalAmount)),
  }
}

export function buildInvoiceRowCells(row: InvoiceLayoutReportRow): readonly string[] {
  return [
    formatDate(row.issuedAt),
    row.cteFiscalNumber.toString(),
    row.cteFiscalSeries,
    formatDocument(row.recipientTaxId ?? ''),
    row.recipientLegalName ?? '',
    row.nfeDocuments.map((document) => `${document.number}/${document.series}`).join(', '),
    formatDecimalText(row.grossWeight),
    formatDecimalText(row.netWeight),
    formatDecimalText(row.totalAmount),
  ]
}

function paginateRows(
  rows: readonly InvoiceLayoutReportRow[],
  rowsPerPage: number,
): readonly InvoiceLayoutPage[] {
  if (rows.length === 0) return [{ pageNumber: 1, rows: [] }]

  const pages: InvoiceLayoutPage[] = []
  for (let offset = 0; offset < rows.length; offset += rowsPerPage) {
    pages.push({ pageNumber: pages.length + 1, rows: rows.slice(offset, offset + rowsPerPage) })
  }
  return pages
}

function buildCarrier(profile: InvoiceLayoutProfile): InvoiceLayoutCarrier {
  return {
    addressLine: [
      `${profile.street}, ${profile.number}`,
      profile.district,
      `${profile.city}/${profile.state}`,
      `CEP ${formatPostalCode(profile.postalCode)}`,
    ].join(SEPARATOR),
    contactLine: [`Tel. ${profile.phone}`, profile.email].join(SEPARATOR),
    legalName: profile.legalName,
    taxLine: [`CNPJ ${formatDocument(profile.cnpj)}`, `IE ${profile.stateRegistration}`].join(
      SEPARATOR,
    ),
    tradeName: profile.tradeName,
  }
}

function buildInvoiceBlock(invoice: InvoiceLayoutInvoice): InvoiceLayoutBlock {
  return {
    fields: [
      { label: 'Número', value: invoice.invoiceNumber.toString() },
      { label: 'Emissão', value: formatDate(invoice.issueDate) },
      { label: 'Vencimento', value: formatDate(invoice.dueDate) },
      { label: 'Total', value: `R$ ${formatDecimalText(invoice.totalAmount)}` },
    ],
    title: 'FATURA',
  }
}

function buildPaymentBlock(payment: InvoiceLayoutPaymentProfile): InvoiceLayoutBlock | null {
  const fields = [
    { label: 'Banco', value: joinBankName(payment) },
    { label: 'Agência', value: payment.bankBranch.trim() },
    { label: 'Conta', value: payment.bankAccount.trim() },
    { label: 'PIX', value: payment.pixKey.trim() },
  ].filter((field) => field.value !== '')

  return fields.length === 0 ? null : { fields, title: PAYMENT_BLOCK_TITLE }
}

function joinBankName(payment: InvoiceLayoutPaymentProfile): string {
  const code = payment.bankCode.trim()
  const name = payment.bankName.trim()
  if (code === '') return name
  return name === '' ? code : `${code} - ${name}`
}

function buildCustomerBlock(invoice: InvoiceLayoutInvoice): InvoiceLayoutBlock {
  return {
    fields: [
      { label: 'Nome', value: invoice.customerName },
      {
        label: invoice.customerDocument.length === CPF_LENGTH ? 'CPF' : 'CNPJ',
        value: formatDocument(invoice.customerDocument),
      },
    ],
    title: 'TOMADOR',
  }
}

function parseAmount(value: string): bigint {
  return parseScaledDecimal({
    errorCodePrefix: AMOUNT_ERROR_CODE_PREFIX,
    scale: FISCAL_MONEY_SCALE,
    value,
  })
}

export function formatInvoiceDate(value: Date | null): string {
  return formatDate(value)
}

function formatDate(value: Date | null): string {
  if (value === null) return ''
  const day = String(value.getUTCDate()).padStart(2, '0')
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${value.getUTCFullYear()}`
}

function formatDecimalText(value: string): string {
  const [integerPart, fractionalPart] = value.split('.', 2)
  const grouped = (integerPart ?? '0').replace(THOUSANDS_PATTERN, '.')
  return fractionalPart === undefined ? grouped : `${grouped},${fractionalPart}`
}

function formatDocument(digits: string): string {
  if (digits.length === CNPJ_LENGTH) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`
  }
  if (digits.length === CPF_LENGTH) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
  }
  return digits
}

function formatPostalCode(digits: string): string {
  if (digits.length !== POSTAL_CODE_LENGTH) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}
