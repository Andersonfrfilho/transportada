/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { DacteXmlInvalidError } from '../../src/cte-issuance/domain/dacte.error.js'
import { parseCteXmlForDacte } from '../../src/cte-issuance/infrastructure/cte-xml.mapper.js'
import {
  buildSyntheticCteXml,
  SYNTHETIC_CTE_ACCESS_KEY,
  SYNTHETIC_ICMS00_BLOCK,
  SYNTHETIC_TOMA4_BLOCK,
} from '../fixtures/cte-xml.fixture.js'

describe('parseCteXmlForDacte', () => {
  test('reads the identification block the DACTE header prints', () => {
    const dacte = parseCteXmlForDacte(buildSyntheticCteXml())

    expect(dacte.accessKey).toBe(SYNTHETIC_CTE_ACCESS_KEY)
    expect(dacte.model).toBe('57')
    expect(dacte.series).toBe('1')
    expect(dacte.number).toBe('1')
    expect(dacte.issuedAt).toBe('2026-07-28T02:14:59-03:00')
    expect(dacte.environment).toBe('homologation')
    expect(dacte.cfop).toBe('6353')
    expect(dacte.natureOfOperation).toBe('PRESTACAO DE SERVICO DE TRANSPORTE')
    expect(dacte.serviceType).toBe('0')
    expect(dacte.documentType).toBe('0')
    expect(dacte.modal).toBe('01')
    expect(dacte.printMode).toBe('1')
    expect(dacte.origin).toEqual({ city: 'Sao Paulo', state: 'SP' })
    expect(dacte.destination).toEqual({ city: 'Rio de Janeiro', state: 'RJ' })
  })

  test('keeps monetary values as decimal strings', () => {
    const dacte = parseCteXmlForDacte(buildSyntheticCteXml())

    expect(dacte.service.totalAmount).toBe('1250.75')
    expect(dacte.service.receivedAmount).toBe('1250.75')
    expect(dacte.service.components).toEqual([
      { name: 'FRETE PESO', value: '1100.50' },
      { name: 'PEDAGIO', value: '150.25' },
    ])
    expect(dacte.cargo.totalAmount).toBe('48000.00')
    expect(dacte.cargo.insuredAmount).toBe('48000.00')
    expect(dacte.tax.approximateTaxAmount).toBe('92.13')
  })

  test('reads the parties with their addresses', () => {
    const dacte = parseCteXmlForDacte(buildSyntheticCteXml())

    expect(dacte.emitter.name).toBe('Transportadora Sintetica Ltda')
    expect(dacte.emitter.document).toBe('00000000000191')
    expect(dacte.emitter.stateRegistration).toBe('110000000000')
    expect(dacte.emitter.address).toEqual({
      city: 'Sao Paulo',
      district: 'Distrito',
      number: '1500',
      state: 'SP',
      street: 'Rodovia dos Contratos',
      zipCode: '04000000',
    })
    expect(dacte.emitter.phone).toBe('1140000000')

    expect(dacte.sender.name).toBe('Remetente Sintetico Ltda')
    expect(dacte.receiver.name).toBe('Destinatario Sintetico Ltda')
    expect(dacte.receiver.address.complement).toBe('Bloco B')
  })

  test('omits the quadros the emitter did not fill', () => {
    const dacte = parseCteXmlForDacte(buildSyntheticCteXml())

    expect(dacte.shipper).toBeUndefined()
    expect(dacte.deliveryParty).toBeUndefined()
  })

  test('resolves the service taker from toma3 to the party it points at', () => {
    const dacte = parseCteXmlForDacte(buildSyntheticCteXml())

    expect(dacte.serviceTaker.role).toBe('sender')
    expect(dacte.serviceTaker.party.name).toBe('Remetente Sintetico Ltda')
  })

  test('resolves the service taker from toma4 with its own party block', () => {
    const dacte = parseCteXmlForDacte(buildSyntheticCteXml({ takerBlock: SYNTHETIC_TOMA4_BLOCK }))

    expect(dacte.serviceTaker.role).toBe('other')
    expect(dacte.serviceTaker.party.name).toBe('Tomador Sintetico Ltda')
    expect(dacte.serviceTaker.party.document).toBe('00000000000434')
    expect(dacte.serviceTaker.party.address.city).toBe('Sao Paulo')
  })

  test('reads the ICMS of a Simples Nacional emitter', () => {
    const dacte = parseCteXmlForDacte(buildSyntheticCteXml())

    expect(dacte.tax.situationCode).toBe('90')
    expect(dacte.tax.isSimplesNacional).toBe(true)
    expect(dacte.tax.baseAmount).toBeUndefined()
    expect(dacte.tax.amount).toBeUndefined()
  })

  test('reads the ICMS of a regular regime emitter', () => {
    const dacte = parseCteXmlForDacte(buildSyntheticCteXml({ icms: SYNTHETIC_ICMS00_BLOCK }))

    expect(dacte.tax.situationCode).toBe('00')
    expect(dacte.tax.isSimplesNacional).toBe(false)
    expect(dacte.tax.baseAmount).toBe('1250.75')
    expect(dacte.tax.rate).toBe('12.00')
    expect(dacte.tax.amount).toBe('150.09')
  })

  test('reads the cargo quantities and the linked invoices', () => {
    const dacte = parseCteXmlForDacte(buildSyntheticCteXml())

    expect(dacte.cargo.predominantProduct).toBe('PRODUTO SINTETICO')
    expect(dacte.cargo.quantities).toEqual([
      { measureType: 'PESO BRUTO', quantity: '1250.0000', unitCode: '01' },
      { measureType: 'UNIDADE', quantity: '40.0000', unitCode: '03' },
    ])
    expect(dacte.relatedDocuments).toEqual([
      {
        accessKey: '35260700000000000272550010000000181000000018',
        expectedDeliveryDate: '2026-07-30',
      },
      {
        accessKey: '35260700000000000272550010000000191000000027',
        expectedDeliveryDate: '2026-07-30',
      },
    ])
  })

  test('reads the road modal, the observations and the QR Code', () => {
    const dacte = parseCteXmlForDacte(buildSyntheticCteXml())

    expect(dacte.rntrc).toBe('58151044')
    expect(dacte.observations).toBe('Observacao sintetica do contribuinte')
    expect(dacte.qrCodeUrl).toContain(SYNTHETIC_CTE_ACCESS_KEY)
  })

  test('reads the authorization protocol the DACTE prints next to the barcode', () => {
    const dacte = parseCteXmlForDacte(buildSyntheticCteXml())

    expect(dacte.authorization).toEqual({
      protocol: '135260000000001',
      receivedAt: '2026-07-28T02:15:04-03:00',
    })
  })

  test('accepts a CT-e without the protocol envelope', () => {
    const dacte = parseCteXmlForDacte(buildSyntheticCteXml({ protocol: false }))

    expect(dacte.authorization).toBeUndefined()
    expect(dacte.accessKey).toBe(SYNTHETIC_CTE_ACCESS_KEY)
  })

  test('rejects an XML that is not a CT-e', () => {
    expect(() => parseCteXmlForDacte('<nfeProc><NFe /></nfeProc>')).toThrow(DacteXmlInvalidError)
  })

  test('rejects an XML whose access key is not 44 digits', () => {
    const broken = buildSyntheticCteXml().replace(`CTe${SYNTHETIC_CTE_ACCESS_KEY}`, 'CTe123')

    expect(() => parseCteXmlForDacte(broken)).toThrow(DacteXmlInvalidError)
  })

  test('rejects malformed XML instead of returning an empty document', () => {
    expect(() => parseCteXmlForDacte('<cteProc><CTe>')).toThrow(DacteXmlInvalidError)
  })
})
