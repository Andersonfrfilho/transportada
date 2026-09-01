/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  AggregateApplicationRequestError,
  createAggregateApplicationClient,
} from '../../src/modules/fleet/shared/aggregateApplicationClient.service'
import {
  formatDeclaredAddress,
  parseDeclaredData,
} from '../../src/modules/fleet/shared/aggregateApplicationDeclaredData.service'

const APPLICATION: unknown = {
  companyId: 'company-1',
  createdAt: '2026-08-25T12:00:00.000Z',
  declaredData: {},
  driverId: null,
  duplicateDriverId: null,
  email: 'candidato@example.com',
  id: 'application-1',
  latestSubmission: null,
  name: 'Fulano de Tal',
  phone: '11988887777',
  rejectionReason: '',
  resubmittedAt: null,
  reviewedAt: null,
  status: 'pending',
  taxId: '12345678901',
  updatedAt: '2026-08-25T12:00:00.000Z',
}

describe('aggregate application client', () => {
  test('lists applications for the company', async () => {
    const client = createAggregateApplicationClient({
      apiBaseUrl: 'http://localhost:53001',
      fetch: () => Promise.resolve(Response.json({ data: [APPLICATION] })),
      getAccessToken: () => Promise.resolve('token'),
    })

    const applications = await client.list()
    expect(applications).toHaveLength(1)
    expect(applications[0]?.name).toBe('Fulano de Tal')
  })

  test('approves an application, authenticated', async () => {
    let sentRequest: Request | undefined
    const client = createAggregateApplicationClient({
      apiBaseUrl: 'http://localhost:53001',
      fetch: (request: Request) => {
        sentRequest = request
        return Promise.resolve(
          Response.json({ data: { ...(APPLICATION as object), status: 'approved' } }),
        )
      },
      getAccessToken: () => Promise.resolve('a-token'),
    })

    const approved = await client.approve('application-1')
    expect(new URL(sentRequest?.url ?? '').pathname).toBe(
      '/aggregate-applications/application-1/approve',
    )
    expect(sentRequest?.headers.get('authorization')).toBe('Bearer a-token')
    expect(approved.status).toBe('approved')
  })

  test('rejects an application with the reason in the body', async () => {
    let sentBody: unknown
    const client = createAggregateApplicationClient({
      apiBaseUrl: 'http://localhost:53001',
      fetch: (request: Request) =>
        request.text().then((body) => {
          sentBody = JSON.parse(body)
          return Response.json({
            data: {
              ...(APPLICATION as object),
              rejectionReason: 'CNH vencida',
              status: 'rejected',
            },
          })
        }),
      getAccessToken: () => Promise.resolve('token'),
    })

    const rejected = await client.reject({ id: 'application-1', rejectionReason: 'CNH vencida' })
    expect(sentBody).toEqual({ rejectionReason: 'CNH vencida' })
    expect(rejected.status).toBe('rejected')
  })

  test('a non-ok response or a network failure collapse to the same request error', async () => {
    const client = createAggregateApplicationClient({
      apiBaseUrl: 'http://localhost:53001',
      fetch: () => Promise.resolve(new Response(null, { status: 500 })),
      getAccessToken: () => Promise.resolve('token'),
    })

    const error = await client.list().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(AggregateApplicationRequestError)
  })
})

describe('parseDeclaredData', () => {
  test('an empty declaration parses as no driver and no vehicle', () => {
    const parsed = parseDeclaredData({})
    expect(parsed.driver).toBeNull()
    expect(parsed.vehicle).toBeNull()
  })

  test('reads the driver license and RNTRC, tolerating a malformed shape', () => {
    const parsed = parseDeclaredData({
      driver: { licenseCategory: 'E', licenseNumber: '12345678901', rntrc: '12345678' },
      vehicle: 'not-an-object',
    })

    expect(parsed.driver?.licenseNumber).toBe('12345678901')
    expect(parsed.driver?.licenseCategory).toBe('E')
    expect(parsed.driver?.rntrc).toBe('12345678')
    expect(parsed.vehicle).toBeNull()
  })

  test('a vehicle without a plate does not count as declared', () => {
    const parsed = parseDeclaredData({ vehicle: { brand: 'Volvo' } })
    expect(parsed.vehicle).toBeNull()
  })

  test('reads the declared vehicle once a plate is present', () => {
    const parsed = parseDeclaredData({
      vehicle: { brand: 'Volvo', model: 'FH 540', modelYear: 2022, plate: 'ABC1D23' },
    })

    expect(parsed.vehicle).toEqual({
      brand: 'Volvo',
      model: 'FH 540',
      modelYear: 2022,
      plate: 'ABC1D23',
      vehicleType: '',
    })
  })
})

describe('formatDeclaredAddress', () => {
  test('joins the parts that are present, skipping the rest', () => {
    const formatted = formatDeclaredAddress({
      city: 'São Paulo',
      complement: '',
      district: 'Centro',
      number: '100',
      postalCode: '01000-000',
      state: 'SP',
      street: 'Rua Um',
    })

    expect(formatted).toBe('Rua Um, 100 — Centro — São Paulo/SP — 01000-000')
  })
})
