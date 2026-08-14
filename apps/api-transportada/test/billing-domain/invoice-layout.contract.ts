/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { InvoiceFiscalProfileMissingError } from '../../src/billing/domain/invoice-layout.error.js'
import {
  buildInvoiceLayout,
  buildInvoiceRowCells,
  INVOICE_TABLE_COLUMNS,
  type InvoiceLayoutInvoice,
  type InvoiceLayoutProfile,
  type InvoiceLayoutReportRow,
} from '../../src/billing/domain/invoice-layout.policy.js'
import {
  formatScaledDecimal,
  FISCAL_MONEY_SCALE,
  parseScaledDecimal,
} from '../../src/shared/decimal.service.js'

const ROWS_PER_PAGE = 43
const AMOUNT_ERROR_CODE_PREFIX = 'BILLING_INVOICE_LAYOUT_TEST'

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
    nfeDocuments: [{ number: '555', series: '1' }],
    recipientLegalName: 'DESTINATARIO SINTETICO LTDA',
    recipientTaxId: '44555666000172',
    totalAmount: '10.50',
  }))
}

function sumAmounts(rows: readonly InvoiceLayoutReportRow[]): string {
  const total = rows.reduce(
    (accumulated, row) =>
      accumulated +
      parseScaledDecimal({
        errorCodePrefix: AMOUNT_ERROR_CODE_PREFIX,
        scale: FISCAL_MONEY_SCALE,
        value: row.totalAmount,
      }),
    0n,
  )
  return formatScaledDecimal(total, FISCAL_MONEY_SCALE)
}

function buildLayout(rows: readonly InvoiceLayoutReportRow[]) {
  return buildInvoiceLayout({
    invoice: INVOICE,
    observations: 'Deposito em conta sintetica, agencia 0001.',
    profile: PROFILE,
    rows,
    rowsPerPage: ROWS_PER_PAGE,
  })
}

describe('invoice layout policy contract', () => {
  test('fatura curta gera uma página', () => {
    const layout = buildLayout(buildRows(10))

    expect(layout.pageCount).toBe(1)
    expect(layout.pages).toHaveLength(1)
    expect(layout.pages[0]?.pageNumber).toBe(1)
    expect(layout.pages[0]?.rows).toHaveLength(10)
  })

  test('fatura longa quebra em páginas com pageNumber sequencial de Página X de Y', () => {
    const layout = buildLayout(buildRows(90))

    expect(layout.pageCount).toBe(3)
    expect(layout.pages.map((page) => page.pageNumber)).toEqual([1, 2, 3])
    expect(layout.pages[0]?.rows).toHaveLength(43)
    expect(layout.pages[1]?.rows).toHaveLength(43)
    expect(layout.pages[2]?.rows).toHaveLength(4)
  })

  test('soma das linhas de todas as páginas bate com o total, sem perder ou duplicar linha', () => {
    const rows = buildRows(97)

    const layout = buildLayout(rows)
    const flattened = layout.pages.flatMap((page) => page.rows)

    expect(flattened).toHaveLength(rows.length)
    expect(sumAmounts(flattened)).toBe(sumAmounts(rows))
  })

  test('empresa sem perfil fiscal falha com erro de domínio nomeado', () => {
    expect(() =>
      buildInvoiceLayout({
        invoice: INVOICE,
        observations: '',
        profile: null,
        rows: [],
        rowsPerPage: ROWS_PER_PAGE,
      }),
    ).toThrow(InvoiceFiscalProfileMissingError)

    try {
      buildInvoiceLayout({
        invoice: INVOICE,
        observations: '',
        profile: null,
        rows: [],
        rowsPerPage: ROWS_PER_PAGE,
      })
      throw new Error('expected buildInvoiceLayout to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(InvoiceFiscalProfileMissingError)
      expect((error as InvoiceFiscalProfileMissingError).code).toBe(
        'BILLING_INVOICE_FISCAL_PROFILE_MISSING',
      )
      expect((error as InvoiceFiscalProfileMissingError).status).toBe(422)
    }
  })

  test('cabeçalho da transportadora vem inteiro do perfil fiscal', () => {
    const { carrier } = buildLayout(buildRows(1))

    expect(carrier.legalName).toBe('TRANSPORTADORA SINTETICA LTDA')
    expect(carrier.tradeName).toBe('Sintetica Transportes')
    expect(carrier.taxLine).toBe('CNPJ 11.222.333/0001-81 · IE 110042490114')
    expect(carrier.addressLine).toBe(
      'Rua Sintetica, 1000 · Bairro Sintetico · Cidade Sintetica/SP · CEP 01000-000',
    )
    expect(carrier.contactLine).toBe('Tel. 1140000000 · faturamento@transportadora-sintetica.test')
  })

  test('bloco da fatura traz número, emissão, vencimento e total', () => {
    const { invoice } = buildLayout(buildRows(1))

    expect(invoice.title).toBe('FATURA')
    expect(invoice.fields).toEqual([
      { label: 'Número', value: '42' },
      { label: 'Emissão', value: '21/07/2026' },
      { label: 'Vencimento', value: '20/08/2026' },
      { label: 'Total', value: 'R$ 1.234,56' },
    ])
  })

  test('valor por extenso sai do bloco repetido para ser impresso uma única vez', () => {
    expect(buildLayout(buildRows(1)).totalInWords).toBe(
      'mil duzentos e trinta e quatro reais e cinquenta e seis centavos',
    )
  })

  test('bloco do tomador e bloco de observações saem do que a fatura carrega', () => {
    const layout = buildLayout(buildRows(1))

    expect(layout.customer.title).toBe('TOMADOR')
    expect(layout.customer.fields).toEqual([
      { label: 'Nome', value: 'TOMADOR SINTETICO LTDA' },
      { label: 'CNPJ', value: '44.555.666/0001-72' },
    ])
    expect(layout.observations).toBe('Deposito em conta sintetica, agencia 0001.')
  })

  test('observações vazias não viram bloco', () => {
    const layout = buildInvoiceLayout({
      invoice: INVOICE,
      observations: '   ',
      profile: PROFILE,
      rows: buildRows(1),
      rowsPerPage: ROWS_PER_PAGE,
    })

    expect(layout.observations).toBe('')
  })

  test('bloco de pagamento sai do cadastro bancário da empresa', () => {
    const { payment } = buildLayout(buildRows(1))

    expect(payment?.title).toBe('DADOS PARA PAGAMENTO')
    expect(payment?.fields).toEqual([
      { label: 'Banco', value: '341 - Banco Sintetico' },
      { label: 'Agência', value: '0001' },
      { label: 'Conta', value: '12345-6' },
      { label: 'PIX', value: 'faturamento@transportadora-sintetica.test' },
    ])
  })

  test('empresa sem dados bancários não imprime bloco de pagamento', () => {
    const layout = buildInvoiceLayout({
      invoice: INVOICE,
      observations: '',
      profile: EMPTY_PAYMENT_PROFILE,
      rows: buildRows(1),
      rowsPerPage: ROWS_PER_PAGE,
    })

    expect(layout.payment).toBeNull()
  })

  test('banco sem código imprime apenas o nome e omite os campos vazios', () => {
    const layout = buildInvoiceLayout({
      invoice: INVOICE,
      observations: '',
      profile: {
        ...PROFILE,
        payment: { ...PROFILE.payment, bankAccount: '', bankCode: '', pixKey: '' },
      },
      rows: buildRows(1),
      rowsPerPage: ROWS_PER_PAGE,
    })

    expect(layout.payment?.fields).toEqual([
      { label: 'Banco', value: 'Banco Sintetico' },
      { label: 'Agência', value: '0001' },
    ])
  })

  test('observação padrão da empresa entra quando a fatura não tem observação própria', () => {
    const layout = buildInvoiceLayout({
      invoice: INVOICE,
      observations: '   ',
      profile: { ...PROFILE, defaultObservations: '  Pagamento somente em conta da empresa.  ' },
      rows: buildRows(1),
      rowsPerPage: ROWS_PER_PAGE,
    })

    expect(layout.observations).toBe('Pagamento somente em conta da empresa.')
  })

  test('observação da fatura tem precedência sobre a observação padrão da empresa', () => {
    const layout = buildInvoiceLayout({
      invoice: INVOICE,
      observations: 'Combinado com o tomador nesta fatura.',
      profile: { ...PROFILE, defaultObservations: 'Pagamento somente em conta da empresa.' },
      rows: buildRows(1),
      rowsPerPage: ROWS_PER_PAGE,
    })

    expect(layout.observations).toBe('Combinado com o tomador nesta fatura.')
  })

  test('uma linha por CT-e: todas as NF-e do pacote cabem na mesma célula', () => {
    const [row] = buildRows(1)
    const bundled: InvoiceLayoutReportRow = {
      ...row!,
      nfeDocuments: [
        { number: '600', series: '2' },
        { number: '601', series: '2' },
      ],
    }

    const cells = buildInvoiceRowCells(bundled)

    expect(cells).toHaveLength(INVOICE_TABLE_COLUMNS.length)
    expect(cells).toEqual([
      '10/07/2026',
      '1000',
      '1',
      '44.555.666/0001-72',
      'DESTINATARIO SINTETICO LTDA',
      '600/2, 601/2',
      '130,5000',
      '119,0000',
      '10,50',
    ])
  })

  test('linha sem destinatário e sem emissão não quebra a montagem das células', () => {
    const [row] = buildRows(1)
    const incomplete: InvoiceLayoutReportRow = {
      ...row!,
      issuedAt: null,
      nfeDocuments: [],
      recipientLegalName: null,
      recipientTaxId: null,
    }

    expect(buildInvoiceRowCells(incomplete)).toEqual([
      '',
      '1000',
      '1',
      '',
      '',
      '',
      '130,5000',
      '119,0000',
      '10,50',
    ])
  })

  test('CNPJ alfanumérico da transportadora e do tomador sai pontuado nas posições da IN', () => {
    const layout = buildInvoiceLayout({
      invoice: { ...INVOICE, customerDocument: '12ABC34501DE35' },
      observations: '',
      profile: { ...PROFILE, cnpj: '12ABC34501DE35' },
      rows: buildRows(1),
      rowsPerPage: ROWS_PER_PAGE,
    })

    expect(layout.carrier.taxLine).toBe('CNPJ 12.ABC.345/01DE-35 · IE 110042490114')
    expect(layout.customer.fields).toEqual([
      { label: 'Nome', value: 'TOMADOR SINTETICO LTDA' },
      { label: 'CNPJ', value: '12.ABC.345/01DE-35' },
    ])
  })

  /**
   * Um CNPJ com três letras deixa onze dígitos quando se apaga o que não é número — o comprimento
   * do CPF. A guarda tem de olhar o documento inteiro, ou o tomador aparece rotulado como pessoa
   * física com a máscara errada.
   */
  test('CNPJ com três letras nunca é rotulado nem mascarado como CPF', () => {
    const layout = buildInvoiceLayout({
      invoice: { ...INVOICE, customerDocument: '12ABC345000135' },
      observations: '',
      profile: PROFILE,
      rows: buildRows(1),
      rowsPerPage: ROWS_PER_PAGE,
    })

    expect(layout.customer.fields).toEqual([
      { label: 'Nome', value: 'TOMADOR SINTETICO LTDA' },
      { label: 'CNPJ', value: '12.ABC.345/0001-35' },
    ])
  })

  test('tomador pessoa física continua rotulado e mascarado como CPF', () => {
    const layout = buildInvoiceLayout({
      invoice: { ...INVOICE, customerDocument: '12345678909' },
      observations: '',
      profile: PROFILE,
      rows: buildRows(1),
      rowsPerPage: ROWS_PER_PAGE,
    })

    expect(layout.customer.fields.at(1)).toEqual({ label: 'CPF', value: '123.456.789-09' })
  })

  /**
   * A guarda de comprimento aceitava qualquer coisa com catorze caracteres: o texto que o
   * destinatário não tem saía pontuado como se fosse documento, e a letra minúscula ia para o papel
   * como veio. A guarda tem de ser de conjunto — o documento inteiro, normalizado.
   */
  test('coluna do destinatário só mascara o que é documento, e normaliza antes', () => {
    const [row] = buildRows(1)

    expect(buildInvoiceRowCells({ ...row!, recipientTaxId: '12abc34501de35' }).at(3)).toBe(
      '12.ABC.345/01DE-35',
    )
    expect(buildInvoiceRowCells({ ...row!, recipientTaxId: 'DOCUMENTO NULO' }).at(3)).toBe(
      'DOCUMENTO NULO',
    )
    expect(buildInvoiceRowCells({ ...row!, recipientTaxId: 'SEM DOCUMENTO' }).at(3)).toBe(
      'SEM DOCUMENTO',
    )
  })

  test('as colunas da tabela cabem na largura útil da página A4', () => {
    const totalWidth = INVOICE_TABLE_COLUMNS.reduce((sum, column) => sum + column.width, 0)

    expect(INVOICE_TABLE_COLUMNS.map((column) => column.label)).toEqual([
      'Emissão',
      'Nº CT-e',
      'Série',
      'CNPJ destinatário',
      'Destinatário',
      'NF-e',
      'Peso bruto',
      'Peso líquido',
      'Valor',
    ])
    expect(totalWidth).toBeLessThanOrEqual(523)
  })
})
