/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { COMPANY_ID } from '../fixtures/company-settings-application.fixture'
import {
  aggregateApplicationRequest,
  AGGREGATE_APPLICATIONS_PATH,
  createAggregateApplicationHttpFixture,
  PUBLIC_AGGREGATE_APPLICATIONS_PATH,
} from '../fixtures/aggregate-application-http.fixture'

function submitBody(taxId: string): string {
  return JSON.stringify({
    companyId: COMPANY_ID,
    declaredData: {},
    email: 'candidato@example.com',
    name: 'Fulano de Tal',
    phone: '11988887777',
    taxId,
  })
}

describe(`POST ${PUBLIC_AGGREGATE_APPLICATIONS_PATH} HTTP contract`, () => {
  test('answers 202 anonymously for a new document', async () => {
    const fixture = await createAggregateApplicationHttpFixture()

    const response = await fixture.handle(
      aggregateApplicationRequest({
        authenticated: false,
        body: submitBody('12345678901'),
        method: 'POST',
        pathname: PUBLIC_AGGREGATE_APPLICATIONS_PATH,
      }),
    )

    expect(response.status).toBe(202)
    expect(await response.text()).toBe('')
  })

  test('answers 202 the same way for a resend of an open document', async () => {
    const fixture = await createAggregateApplicationHttpFixture()
    const send = () =>
      fixture.handle(
        aggregateApplicationRequest({
          authenticated: false,
          body: submitBody('98765432100'),
          method: 'POST',
          pathname: PUBLIC_AGGREGATE_APPLICATIONS_PATH,
        }),
      )

    const first = await send()
    const second = await send()

    expect(first.status).toBe(202)
    expect(second.status).toBe(202)
    expect(fixture.repository.rows).toHaveLength(1)
  })

  test('rejects a malformed body before touching the use case', async () => {
    const fixture = await createAggregateApplicationHttpFixture()

    const response = await fixture.handle(
      aggregateApplicationRequest({
        authenticated: false,
        body: JSON.stringify({ companyId: COMPANY_ID }),
        method: 'POST',
        pathname: PUBLIC_AGGREGATE_APPLICATIONS_PATH,
      }),
    )

    expect(response.status).toBe(400)
    expect(fixture.repository.rows).toHaveLength(0)
  })

  test('rate limits repeated submissions from the same IP', async () => {
    const fixture = await createAggregateApplicationHttpFixture()
    const send = (taxId: string) =>
      fixture.handle(
        aggregateApplicationRequest({
          authenticated: false,
          body: submitBody(taxId),
          clientIp: '203.0.113.10',
          method: 'POST',
          pathname: PUBLIC_AGGREGATE_APPLICATIONS_PATH,
        }),
      )

    const taxIds = ['11111111111', '22222222222', '33333333333', '44444444444', '55555555555']
    for (const taxId of taxIds) {
      const response = await send(taxId)
      expect(response.status).toBe(202)
    }

    const sixth = await send('66666666666')
    expect(sixth.status).toBe(429)
    expect(sixth.headers.get('retry-after')).not.toBeNull()
  })

  test('does not rate limit a different IP once the first is exhausted', async () => {
    const fixture = await createAggregateApplicationHttpFixture()
    const send = (taxId: string, clientIp: string) =>
      fixture.handle(
        aggregateApplicationRequest({
          authenticated: false,
          body: submitBody(taxId),
          clientIp,
          method: 'POST',
          pathname: PUBLIC_AGGREGATE_APPLICATIONS_PATH,
        }),
      )

    for (const taxId of [
      '11111111112',
      '22222222223',
      '33333333334',
      '44444444445',
      '55555555556',
    ]) {
      await send(taxId, '203.0.113.20')
    }

    const otherIp = await send('66666666667', '203.0.113.21')
    expect(otherIp.status).toBe(202)
  })

  test('rejects submission when configured with Turnstile and the token fails verification', async () => {
    const fixture = await createAggregateApplicationHttpFixture({
      turnstileSecretKey: 'test-secret',
      verifyTurnstileToken: async () => false,
    })

    const response = await fixture.handle(
      aggregateApplicationRequest({
        authenticated: false,
        body: submitBody('77777777777'),
        method: 'POST',
        pathname: PUBLIC_AGGREGATE_APPLICATIONS_PATH,
      }),
    )

    expect(response.status).toBe(403)
    expect(fixture.repository.rows).toHaveLength(0)
  })

  test('accepts submission when configured with Turnstile and the token passes verification', async () => {
    const fixture = await createAggregateApplicationHttpFixture({
      turnstileSecretKey: 'test-secret',
      verifyTurnstileToken: async () => true,
    })

    const response = await fixture.handle(
      aggregateApplicationRequest({
        authenticated: false,
        body: submitBody('88888888888'),
        method: 'POST',
        pathname: PUBLIC_AGGREGATE_APPLICATIONS_PATH,
      }),
    )

    expect(response.status).toBe(202)
    expect(fixture.repository.rows).toHaveLength(1)
  })
})

describe(`${AGGREGATE_APPLICATIONS_PATH} HTTP contract`, () => {
  test('lists applications for the authenticated company', async () => {
    const fixture = await createAggregateApplicationHttpFixture()
    await fixture.handle(
      aggregateApplicationRequest({
        authenticated: false,
        body: submitBody('11122233344'),
        method: 'POST',
        pathname: PUBLIC_AGGREGATE_APPLICATIONS_PATH,
      }),
    )

    const response = await fixture.handle(
      aggregateApplicationRequest({ method: 'GET', pathname: AGGREGATE_APPLICATIONS_PATH }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: readonly unknown[] }
    expect(body.data).toHaveLength(1)
  })

  test('rejects listing without fleet.manage', async () => {
    const fixture = await createAggregateApplicationHttpFixture({ permissions: new Set() })

    const response = await fixture.handle(
      aggregateApplicationRequest({ method: 'GET', pathname: AGGREGATE_APPLICATIONS_PATH }),
    )

    expect(response.status).toBe(403)
  })

  test('approves a pending application and creates the driver link', async () => {
    const fixture = await createAggregateApplicationHttpFixture()
    await fixture.handle(
      aggregateApplicationRequest({
        authenticated: false,
        body: submitBody('55566677788'),
        method: 'POST',
        pathname: PUBLIC_AGGREGATE_APPLICATIONS_PATH,
      }),
    )
    const applicationId = fixture.repository.rows[0]?.id
    if (applicationId === undefined) throw new Error('application was not inserted')

    const response = await fixture.handle(
      aggregateApplicationRequest({
        method: 'POST',
        pathname: `${AGGREGATE_APPLICATIONS_PATH}/${applicationId}/approve`,
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { driverId: string | null; status: string } }
    expect(body.data.status).toBe('approved')
    expect(body.data.driverId).not.toBeNull()
  })

  test('rejects with a reason and records it', async () => {
    const fixture = await createAggregateApplicationHttpFixture()
    await fixture.handle(
      aggregateApplicationRequest({
        authenticated: false,
        body: submitBody('99988877766'),
        method: 'POST',
        pathname: PUBLIC_AGGREGATE_APPLICATIONS_PATH,
      }),
    )
    const applicationId = fixture.repository.rows[0]?.id
    if (applicationId === undefined) throw new Error('application was not inserted')

    const response = await fixture.handle(
      aggregateApplicationRequest({
        body: JSON.stringify({ rejectionReason: 'CNH vencida' }),
        method: 'POST',
        pathname: `${AGGREGATE_APPLICATIONS_PATH}/${applicationId}/reject`,
      }),
    )

    expect(response.status).toBe(200)
    const body = (await response.json()) as { data: { rejectionReason: string; status: string } }
    expect(body.data.status).toBe('rejected')
    expect(body.data.rejectionReason).toBe('CNH vencida')
  })

  test('rejects a rejection without a reason', async () => {
    const fixture = await createAggregateApplicationHttpFixture()
    await fixture.handle(
      aggregateApplicationRequest({
        authenticated: false,
        body: submitBody('44455566677'),
        method: 'POST',
        pathname: PUBLIC_AGGREGATE_APPLICATIONS_PATH,
      }),
    )
    const applicationId = fixture.repository.rows[0]?.id
    if (applicationId === undefined) throw new Error('application was not inserted')

    const response = await fixture.handle(
      aggregateApplicationRequest({
        body: JSON.stringify({ rejectionReason: '' }),
        method: 'POST',
        pathname: `${AGGREGATE_APPLICATIONS_PATH}/${applicationId}/reject`,
      }),
    )

    expect(response.status).toBe(400)
  })
})
