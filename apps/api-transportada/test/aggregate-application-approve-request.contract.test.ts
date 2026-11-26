/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { parseApproveAggregateApplicationRequest } from '../src/fleet/presentation/aggregate-application.schema.js'

const APPROVE_URL = 'https://api.example.test/aggregate-applications/id/approve'

describe('parseApproveAggregateApplicationRequest', () => {
  test('accepts a POST without body — the panel approves a CPF application this way', async () => {
    const request = new Request(APPROVE_URL, { method: 'POST' })

    expect(await parseApproveAggregateApplicationRequest(request)).toBeUndefined()
  })

  test('accepts an empty JSON body', async () => {
    const request = new Request(APPROVE_URL, {
      body: '',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    expect(await parseApproveAggregateApplicationRequest(request)).toBeUndefined()
  })

  test('reads the driver CPF of a legal-entity application', async () => {
    const request = new Request(APPROVE_URL, {
      body: JSON.stringify({ driverTaxId: '529.982.247-25' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    expect(await parseApproveAggregateApplicationRequest(request)).toBe('52998224725')
  })

  test('rejects a body with an invalid CPF', async () => {
    const request = new Request(APPROVE_URL, {
      body: JSON.stringify({ driverTaxId: '123' }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    })

    await expect(parseApproveAggregateApplicationRequest(request)).rejects.toMatchObject({
      status: 400,
    })
  })
})
