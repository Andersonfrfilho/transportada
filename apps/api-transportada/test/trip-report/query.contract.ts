/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, it } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import { parseTripReportQuery } from '../../src/trips/presentation/trip-report.schema.js'

const TRIP_ID = '11111111-1111-4111-8111-111111111111'
const DOCUMENT_ID = '22222222-2222-4222-8222-222222222222'
const CURSOR = `2026-10-07T12:34:56.123456Z::${TRIP_ID}::${DOCUMENT_ID}`

function parse(query: string) {
  return parseTripReportQuery(new URL(`http://localhost/v1/trip-document-report${query}`))
}

function refusal(query: string): ApiError {
  try {
    parse(query)
  } catch (error) {
    if (error instanceof ApiError) return error
    throw error
  }
  throw new Error('expected the query to be refused')
}

describe('parseTripReportQuery', () => {
  it('applies the defaults on an empty query', () => {
    expect(parse('')).toEqual({ cursor: undefined, filters: {}, limit: 100 })
  })

  it('accepts every documented filter', () => {
    const result = parse(
      `?cursor=${CURSOR}&limit=50&tripIdIn=${TRIP_ID}&documentIdIn=${DOCUMENT_ID}` +
        `&statusIn=draft,completed&vehicleIdIn=${TRIP_ID}&driverIdIn=${DOCUMENT_ID}` +
        '&createdFrom=2026-10-01T00:00:00.000Z&createdUntil=2026-10-07T00:00:00.000Z' +
        '&proofPendingEq=true&search=nota&recipientCityIn=Recife,Olinda&recipientStateIn=PE,BA' +
        '&valueOperator=gte&valueAmount=1250.5&documentStatusIn=delivered,returned',
    )
    expect(result.limit).toBe(50)
    expect(result.cursor).toEqual({
      createdAt: '2026-10-07T12:34:56.123456Z',
      tripDocumentId: DOCUMENT_ID,
      tripId: TRIP_ID,
    })
    expect(result.filters).toMatchObject({
      documentIdIn: [DOCUMENT_ID],
      documentStatusIn: ['delivered', 'returned'],
      proofPendingEq: true,
      recipientCityIn: ['Recife', 'Olinda'],
      recipientStateIn: ['PE', 'BA'],
      search: 'nota',
      statusIn: ['draft', 'completed'],
      tripIdIn: [TRIP_ID],
      valueAmount: '1250.5',
      valueOperator: 'gte',
    })
  })

  it('accepts the limit bounds and refuses outside them', () => {
    expect(parse('?limit=1').limit).toBe(1)
    expect(parse('?limit=100').limit).toBe(100)
    expect(refusal('?limit=0').code).toBe('INVALID_REQUEST')
    expect(refusal('?limit=101').code).toBe('INVALID_REQUEST')
  })

  it('refuses more than 100 ids in a list', () => {
    const ids = Array.from(
      { length: 101 },
      (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    )
    expect(refusal(`?tripIdIn=${ids.join(',')}`).code).toBe('INVALID_REQUEST')
    expect(refusal(`?documentIdIn=${ids.join(',')}`).code).toBe('INVALID_REQUEST')
  })

  it('refuses a malformed cursor', () => {
    for (const cursor of [
      'garbage',
      `2026-10-07T12:34:56.123Z::${TRIP_ID}::${DOCUMENT_ID}`,
      `2026-10-07T12:34:56.123456Z::${TRIP_ID}`,
      `2026-10-07T12:34:56.123456Z::${TRIP_ID}::not-a-uuid`,
      `2026-13-07T12:34:56.123456Z::${TRIP_ID}::${DOCUMENT_ID}`,
    ]) {
      const error = refusal(`?cursor=${cursor}`)
      expect(error.code).toBe('INVALID_REQUEST')
      expect(error.status).toBe(400)
    }
  })

  it('refuses an unknown key', () => {
    expect(refusal('?tripCode=1').status).toBe(400)
  })

  it('refuses a repeated key', () => {
    expect(refusal('?limit=1&limit=2').code).toBe('INVALID_REQUEST')
  })

  it('reports every error together with details', () => {
    const error = refusal('?limit=0&cursor=x&statusIn=nope&mystery=1&valueOperator=gt')
    expect(error.code).toBe('INVALID_REQUEST')
    const fields = (error.details ?? []).map((detail) => detail.field).sort()
    expect(fields).toEqual(['', 'cursor', 'limit', 'statusIn', 'valueAmount'])
  })

  it('requires valueOperator and valueAmount together', () => {
    expect(refusal('?valueOperator=gt').details?.[0]?.field).toBe('valueAmount')
    expect(refusal('?valueAmount=10').details?.[0]?.field).toBe('valueOperator')
    expect(parse('?valueOperator=eq&valueAmount=10').filters).toMatchObject({
      valueAmount: '10',
      valueOperator: 'eq',
    })
  })

  it('keeps money as a decimal string and refuses floats and unknown operators', () => {
    expect(refusal('?valueOperator=gt&valueAmount=1e3').code).toBe('INVALID_REQUEST')
    expect(refusal('?valueOperator=gt&valueAmount=-1').code).toBe('INVALID_REQUEST')
    expect(refusal('?valueOperator=gt&valueAmount=1.23456').code).toBe('INVALID_REQUEST')
    expect(refusal('?valueOperator=between&valueAmount=1').code).toBe('INVALID_REQUEST')
  })

  it('accepts the none marker in contractorIdIn', () => {
    expect(parse('?contractorIdIn=none').filters.contractorIdIn).toEqual({
      contractorIds: [],
      includesNone: true,
    })
    expect(parse(`?contractorIdIn=none,${TRIP_ID}`).filters.contractorIdIn).toEqual({
      contractorIds: [TRIP_ID],
      includesNone: true,
    })
    expect(refusal('?contractorIdIn=none,none').code).toBe('INVALID_REQUEST')
    expect(refusal('?contractorIdIn=banana').code).toBe('INVALID_REQUEST')
  })

  it('refuses invalid document status, state and boolean', () => {
    expect(refusal('?documentStatusIn=flying').code).toBe('INVALID_REQUEST')
    expect(refusal('?recipientStateIn=pernambuco').code).toBe('INVALID_REQUEST')
    expect(refusal('?proofPendingEq=maybe').code).toBe('INVALID_REQUEST')
  })

  it('accepts the spec 258 note filters with their types', () => {
    expect(
      parse(
        '?numberFrom=00001&numberTo=99999&issuedFrom=2028-02-29&issuedUntil=2028-03-01' +
          '&emitterNameIn=AMARELINHA,OUTRA&emitterTaxIdIn=12345678000190&emitterCityIn=Recife' +
          '&emitterStateIn=PE&emitterAddress=Rua%20A&recipientName=Maria&recipientAddress=Av%20B' +
          '&cteIssued=issued&fiscalStatusIn=authorized,denied',
      ).filters,
    ).toEqual({
      cteIssued: 'issued',
      emitterAddress: 'Rua A',
      emitterCityIn: ['Recife'],
      emitterNameIn: ['AMARELINHA', 'OUTRA'],
      emitterStateIn: ['PE'],
      emitterTaxIdIn: ['12345678000190'],
      fiscalStatusIn: ['authorized', 'denied'],
      issuedFrom: '2028-02-29',
      issuedUntil: '2028-03-01',
      numberFrom: '00001',
      numberTo: '99999',
      recipientAddress: 'Av B',
      recipientName: 'Maria',
    })
  })

  it('accepts a single-sided number range and a single-sided date range', () => {
    expect(parse('?numberFrom=42').filters).toEqual({ numberFrom: '42' })
    expect(parse('?numberTo=42').filters).toEqual({ numberTo: '42' })
    expect(parse('?issuedUntil=2026-10-31').filters).toEqual({ issuedUntil: '2026-10-31' })
    expect(parse('?numberFrom=42&numberTo=42').filters).toEqual({
      numberFrom: '42',
      numberTo: '42',
    })
  })

  it('refuses an inverted number range', () => {
    expect(refusal('?numberFrom=99999&numberTo=00001').details?.[0]?.field).toBe('numberTo')
  })

  it('refuses a document number that is not 1 to 15 digits', () => {
    expect(refusal('?numberFrom=12A').code).toBe('INVALID_REQUEST')
    expect(refusal('?numberTo=-1').code).toBe('INVALID_REQUEST')
    expect(refusal('?numberTo=1234567890123456').code).toBe('INVALID_REQUEST')
    expect(refusal('?numberFrom=').code).toBe('INVALID_REQUEST')
  })

  it('refuses a date that is not a real calendar day', () => {
    expect(refusal('?issuedFrom=2026-02-30').code).toBe('INVALID_REQUEST')
    expect(refusal('?issuedUntil=2027-02-29').code).toBe('INVALID_REQUEST')
    expect(refusal('?issuedFrom=2026-1-5').code).toBe('INVALID_REQUEST')
    expect(refusal('?issuedFrom=05/10/2026').code).toBe('INVALID_REQUEST')
  })

  it('refuses an inverted date range', () => {
    expect(refusal('?issuedFrom=2026-10-31&issuedUntil=2026-10-01').details?.[0]?.field).toBe(
      'issuedUntil',
    )
  })

  it('refuses a cteIssued outside issued and pending', () => {
    expect(parse('?cteIssued=pending').filters.cteIssued).toBe('pending')
    expect(refusal('?cteIssued=maybe').code).toBe('INVALID_REQUEST')
    expect(refusal('?cteIssued=ISSUED').code).toBe('INVALID_REQUEST')
  })

  it('refuses an unknown fiscal status and an unknown state in the new lists', () => {
    expect(refusal('?fiscalStatusIn=flying').code).toBe('INVALID_REQUEST')
    expect(refusal('?emitterStateIn=pernambuco').code).toBe('INVALID_REQUEST')
  })

  it('refuses a text longer than the contains ceiling', () => {
    const longText = 'a'.repeat(61)
    expect(refusal(`?recipientName=${longText}`).code).toBe('INVALID_REQUEST')
    expect(refusal(`?emitterAddress=${longText}`).code).toBe('INVALID_REQUEST')
  })

  it('refuses a list above the 100 values ceiling in the new lists', () => {
    const names = Array.from({ length: 101 }, (_, index) => `e${index}`).join(',')
    expect(refusal(`?emitterNameIn=${names}`).code).toBe('INVALID_REQUEST')
  })
})
