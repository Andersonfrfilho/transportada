/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseBillingInvoiceList } from '../../src/billing/presentation/billing.schema.js'
import { parseCompanySettingsLookupCnpjRequest } from '../../src/companies/presentation/company-settings.schema.js'
import { parseNfseInvoiceList } from '../../src/nfse-invoices/presentation/nfse-invoices.schema.js'
import { ApiError } from '../../src/shared/api.error.js'

const ALPHANUMERIC_CNPJ = '12ABC34501DE35'
const LOWERCASE_CNPJ = '12abc34501de35'
const NUMERIC_CNPJ = '12345678000195'
const OUT_OF_ALPHABET_CNPJ = '12ABC34501DE3!'

const lookupRequest = (cnpj: string) =>
  new Request(`http://localhost/company-settings/lookup?cnpj=${encodeURIComponent(cnpj)}`)

const listUrl = (path: string, query: string) => new URL(`http://localhost${path}?${query}`)

const expectInvalidRequest = (parse: () => unknown) => {
  try {
    parse()
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).code).toBe('INVALID_REQUEST')
    return
  }
  throw new Error('Expected the boundary to reject the tax id')
}

describe('CNPJ alfanumérico na fronteira: filtros de consulta', () => {
  test('a consulta de empresa por CNPJ aceita a forma alfanumérica e devolve maiúscula', () => {
    expect(parseCompanySettingsLookupCnpjRequest(lookupRequest(LOWERCASE_CNPJ))).toBe(
      ALPHANUMERIC_CNPJ,
    )
    expect(parseCompanySettingsLookupCnpjRequest(lookupRequest(NUMERIC_CNPJ))).toBe(NUMERIC_CNPJ)
    expectInvalidRequest(() =>
      parseCompanySettingsLookupCnpjRequest(lookupRequest(OUT_OF_ALPHABET_CNPJ)),
    )
  })

  test('o filtro de cliente da fatura aceita CNPJ alfanumérico, sozinho e em lista', () => {
    const single = parseBillingInvoiceList(
      listUrl('/billing/invoices', `customerDocument=${LOWERCASE_CNPJ}`),
    )
    const many = parseBillingInvoiceList(
      listUrl('/billing/invoices', `customerDocumentIn=${LOWERCASE_CNPJ},${NUMERIC_CNPJ}`),
    )

    expect(single.customerDocument).toBe(ALPHANUMERIC_CNPJ)
    expect(many.customerDocumentIn).toEqual([ALPHANUMERIC_CNPJ, NUMERIC_CNPJ])
    expectInvalidRequest(() =>
      parseBillingInvoiceList(
        listUrl('/billing/invoices', `customerDocument=${OUT_OF_ALPHABET_CNPJ}`),
      ),
    )
  })

  test('o filtro de tomador da NFS-e aceita CNPJ alfanumérico e segue aceitando CPF', () => {
    const alphanumeric = parseNfseInvoiceList(
      listUrl('/nfse-invoices', `takerTaxIdEq=${LOWERCASE_CNPJ}`),
    )
    const taxpayer = parseNfseInvoiceList(listUrl('/nfse-invoices', 'takerTaxIdEq=12345678901'))

    expect(alphanumeric.filters?.takerTaxIdEq).toBe(ALPHANUMERIC_CNPJ)
    expect(taxpayer.filters?.takerTaxIdEq).toBe('12345678901')
    expectInvalidRequest(() =>
      parseNfseInvoiceList(listUrl('/nfse-invoices', `takerTaxIdEq=${OUT_OF_ALPHABET_CNPJ}`)),
    )
  })
})
