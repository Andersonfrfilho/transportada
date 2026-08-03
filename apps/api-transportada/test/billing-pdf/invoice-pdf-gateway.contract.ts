/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { InvoiceFiscalProfileMissingError } from '../../src/billing/domain/invoice-layout.error.js'
import type {
  InvoiceLayoutInvoice,
  InvoiceLayoutProfile,
  InvoiceLayoutReportRow,
} from '../../src/billing/domain/invoice-layout.policy.js'
import {
  createInvoicePdfGateway,
  INVOICE_PDF_ROWS_PER_PAGE,
} from '../../src/billing/infrastructure/invoice-pdf.gateway.js'

const PDF_HEADER = '%PDF-'
const PDF_TRAILER = '%%EOF'
const PRINTED_AT = new Date('2026-07-30T13:45:00.000Z')

const PROFILE: InvoiceLayoutProfile = {
  city: 'Cidade Sintetica',
  cnpj: '11222333000181',
  defaultObservations: '',
  district: 'Bairro Sintetico',
  email: 'faturamento@transportadora-sintetica.test',
  legalName: 'TRANSPORTADORA SINTETICA LTDA',
  number: '1000',
  payment: {
    bankAccount: '12345-6',
    bankBranch: '0001',
    bankCode: '341',
    bankName: 'Banco Sintetico',
    pixKey: 'faturamento@transportadora-sintetica.test',
  },
  phone: '1140000000',
  postalCode: '01000000',
  state: 'SP',
  stateRegistration: '110042490114',
  street: 'Rua Sintetica',
  tradeName: 'Sintetica Transportes',
}

const EMPTY_PAYMENT_PROFILE: InvoiceLayoutProfile = {
  ...PROFILE,
  payment: { bankAccount: '', bankBranch: '', bankCode: '', bankName: '', pixKey: '' },
}

const INVOICE: InvoiceLayoutInvoice = {
  customerDocument: '44555666000172',
  customerName: 'TOMADOR SINTETICO LTDA',
  dueDate: new Date('2026-08-20T00:00:00.000Z'),
  invoiceNumber: 42n,
  issueDate: new Date('2026-07-21T00:00:00.000Z'),
  totalAmount: '1234.56',
}

function buildRows(count: number): readonly InvoiceLayoutReportRow[] {
  return Array.from({ length: count }, (_unused, index) => ({
    cteFiscalNumber: BigInt(1000 + index),
    cteFiscalSeries: '1',
    grossWeight: '130.5000',
    issuedAt: new Date('2026-07-10T12:00:00.000Z'),
    netWeight: '119.0000',
    nfeDocuments: [{ number: String(500 + index), series: '1' }],
    recipientLegalName: 'DESTINATARIO SINTETICO LTDA',
    recipientTaxId: '44555666000172',
    totalAmount: '10.50',
  }))
}

function countPageObjects(bytes: Buffer): number {
  return (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
}

/** O pdfkit grava o texto em hex dentro de arrays TJ, quebrados por kerning — remontar é o único jeito de conferir o que foi desenhado. */
function extractDrawnText(bytes: Buffer): string {
  const runs = bytes.toString('latin1').match(/\[[^\]]*\]\s*TJ/g) ?? []
  return runs
    .map((run) =>
      (run.match(/<[0-9a-fA-F]*>/g) ?? [])
        .map((chunk) => Buffer.from(chunk.slice(1, -1), 'hex').toString('latin1'))
        .join(''),
    )
    .join('\n')
}

function countOccurrences(text: string, needle: string): number {
  return text.split(needle).length - 1
}

/** Cada célula é um desenho de texto próprio: comparar a linha inteira prova que o número saiu sozinho na coluna. */
function countCells(text: string, value: string): number {
  return text.split('\n').filter((line) => line === value).length
}

/** PNG de 1x1 pixel: o menor arquivo que o pdfkit ainda aceita desenhar. */
const LOGO_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function render(input: {
  readonly logo?: { readonly bytes: Buffer } | null
  readonly observations?: string
  readonly profile?: InvoiceLayoutProfile | null
  readonly rowCount: number
}) {
  return createInvoicePdfGateway({ compress: false }).render({
    invoice: INVOICE,
    logo: input.logo ?? null,
    observations: input.observations ?? 'Deposito em conta sintetica, agencia 0001.',
    printedAt: PRINTED_AT,
    profile: input.profile === undefined ? PROFILE : input.profile,
    rows: buildRows(input.rowCount),
  })
}

describe('invoice pdf gateway logo contract', () => {
  test('desenha o logo da transportadora em toda página e mantém a identidade legível', async () => {
    const document = await render({ logo: { bytes: LOGO_PNG }, rowCount: 90 })
    const content = extractDrawnText(document.bytes)

    expect(document.pageCount).toBe(3)
    expect(countPageObjects(document.bytes)).toBe(3)
    expect(document.bytes.toString('latin1')).toContain('/Subtype /Image')
    expect(countOccurrences(content, 'TRANSPORTADORA SINTETICA LTDA')).toBe(3)
  })

  test('sem logo cadastrado o PDF sai íntegro e sem objeto de imagem', async () => {
    const document = await render({ logo: null, rowCount: 10 })

    expect(document.pageCount).toBe(1)
    expect(document.bytes.toString('latin1')).not.toContain('/Subtype /Image')
    expect(extractDrawnText(document.bytes)).toContain('TRANSPORTADORA SINTETICA LTDA')
  })

  test('imagem corrompida não derruba a fatura — o documento fiscal continua sendo entregue', async () => {
    const document = await render({
      logo: { bytes: Buffer.from('conteudo-que-nao-e-imagem', 'latin1') },
      rowCount: 10,
    })

    expect(document.pageCount).toBe(1)
    expect(document.bytes.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER)
    expect(document.bytes.toString('latin1')).not.toContain('/Subtype /Image')
    expect(extractDrawnText(document.bytes)).toContain('TOMADOR SINTETICO LTDA')
  })
})

describe('invoice pdf gateway contract', () => {
  test('fatura curta gera um PDF válido de uma página', async () => {
    const document = await render({ rowCount: 10 })

    expect(document.pageCount).toBe(1)
    expect(document.bytes.subarray(0, PDF_HEADER.length).toString('latin1')).toBe(PDF_HEADER)
    expect(document.bytes.subarray(-16).toString('latin1')).toContain(PDF_TRAILER)
    expect(countPageObjects(document.bytes)).toBe(1)
  })

  test('cabeçalho da transportadora e bloco da fatura repetem em toda página', async () => {
    const document = await render({ rowCount: 90 })
    const content = extractDrawnText(document.bytes)

    expect(document.pageCount).toBe(3)
    expect(countPageObjects(document.bytes)).toBe(document.pageCount)
    expect(countOccurrences(content, 'TRANSPORTADORA SINTETICA LTDA')).toBe(document.pageCount)
    expect(countOccurrences(content, 'FATURA')).toBe(document.pageCount)
    expect(countOccurrences(content, 'CNPJ 11.222.333/0001-81')).toBe(document.pageCount)
  })

  test('rodapé traz a data de impressão e a paginação sem criar página extra', async () => {
    const document = await render({ rowCount: 90 })
    const content = extractDrawnText(document.bytes)

    expect(countOccurrences(content, '30/07/2026')).toBe(document.pageCount)
    expect(content).toContain('1 de 3')
    expect(content).toContain('3 de 3')
    expect(countPageObjects(document.bytes)).toBe(3)
  })

  test('bloco do tomador, observações e total fecham o documento uma única vez', async () => {
    const document = await render({ rowCount: 90 })
    const content = extractDrawnText(document.bytes)

    expect(countOccurrences(content, 'TOMADOR SINTETICO LTDA')).toBe(document.pageCount)
    expect(countOccurrences(content, 'Deposito em conta sintetica, agencia 0001.')).toBe(1)
    expect(countOccurrences(content, 'mil duzentos e trinta e quatro reais')).toBe(1)
  })

  test('uma linha por CT-e: cada CT-e aparece uma vez e nenhuma linha se perde na quebra', async () => {
    const rowCount = INVOICE_PDF_ROWS_PER_PAGE * 2 + 1
    const document = await render({ rowCount })
    const content = extractDrawnText(document.bytes)

    expect(document.pageCount).toBe(3)
    expect(countCells(content, '1000')).toBe(1)
    expect(countCells(content, `${1000 + rowCount - 1}`)).toBe(1)
  })

  test('número e série do CT-e saem em colunas próprias, sem barra no meio', async () => {
    const rowCount = 5
    const document = await render({ rowCount })
    const content = extractDrawnText(document.bytes)

    expect(content).not.toContain('1000/1')
    expect(countOccurrences(content, 'Nº CT-e')).toBe(document.pageCount)
    expect(countOccurrences(content, 'Série')).toBe(document.pageCount)
    /** Uma célula de série por linha: a coluna nova não pode nascer vazia. */
    expect(countCells(content, '1')).toBe(rowCount)
  })

  test('empresa sem perfil fiscal não gera PDF', async () => {
    await expect(render({ profile: null, rowCount: 10 })).rejects.toBeInstanceOf(
      InvoiceFiscalProfileMissingError,
    )
  })

  test('observações vazias não deixam bloco órfão no documento', async () => {
    const document = await render({ observations: '', rowCount: 5 })
    const content = extractDrawnText(document.bytes)

    expect(document.pageCount).toBe(1)
    expect(content).not.toContain('OBSERVA')
  })

  test('dados bancários da empresa fecham o documento uma única vez', async () => {
    const document = await render({ rowCount: 90 })
    const content = extractDrawnText(document.bytes)

    expect(countOccurrences(content, 'DADOS PARA PAGAMENTO')).toBe(1)
    expect(content).toContain('341 - Banco Sintetico')
    expect(content).toContain('0001')
    expect(content).toContain('12345-6')
  })

  test('empresa sem dados bancários não deixa bloco de pagamento órfão', async () => {
    const document = await render({ profile: EMPTY_PAYMENT_PROFILE, rowCount: 5 })
    const content = extractDrawnText(document.bytes)

    expect(content).not.toContain('DADOS PARA PAGAMENTO')
  })

  test('fechamento que não cabe na última página cheia abre página própria', async () => {
    const document = await render({
      observations: 'Observacao sintetica de fechamento. '.repeat(30),
      rowCount: INVOICE_PDF_ROWS_PER_PAGE,
    })
    const content = extractDrawnText(document.bytes)

    expect(document.pageCount).toBe(2)
    expect(countOccurrences(content, 'DADOS PARA PAGAMENTO')).toBe(1)
    expect(countOccurrences(content, 'mil duzentos e trinta e quatro reais')).toBe(1)
    expect(content).toContain('2 de 2')
  })
})
