/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  FleetRequestError,
  readErrorDetails,
  toInvalidFields,
} from '../../src/modules/fleet/shared/fleetRequestError.service'
import { toDriverInvalidFieldLabels } from '../../src/modules/fleet/shared/driverInvalidFields.service'

describe('fleet request error details', () => {
  test('reads the field of every issue the api returned', () => {
    const payload = {
      error: {
        code: 'INVALID_REQUEST',
        details: [
          { field: 'birthDate', message: 'invalid' },
          { field: 'address.postalCode', message: 'invalid' },
        ],
      },
    }

    expect(readErrorDetails(payload)).toEqual([
      { field: 'birthDate', message: 'invalid' },
      { field: 'address.postalCode', message: 'invalid' },
    ])
  })

  test('ignores malformed issues instead of failing the error path', () => {
    expect(readErrorDetails({ error: { details: [{ field: 'taxId' }, 7, null] } })).toEqual([])
    expect(readErrorDetails({ error: { code: 'X' } })).toEqual([])
    expect(readErrorDetails('boom')).toEqual([])
  })

  test('keeps the code as the message, because the module picks the text by it', () => {
    const error = new FleetRequestError('INVALID_REQUEST', [{ field: 'taxId', message: 'i' }])

    expect(error.message).toBe('INVALID_REQUEST')
    expect(toInvalidFields(error)).toEqual(['taxId'])
  })

  test('reports no field for an error that is not a fleet request error', () => {
    expect(toInvalidFields(new Error('INVALID_REQUEST'))).toEqual([])
  })

  test('does not repeat a field that failed more than one rule', () => {
    const error = new FleetRequestError('INVALID_REQUEST', [
      { field: 'taxId', message: 'too short' },
      { field: 'taxId', message: 'not a cpf' },
    ])

    expect(toInvalidFields(error)).toEqual(['taxId'])
  })
})

describe('driver invalid field labels', () => {
  test('names the field with the label printed on the form', () => {
    const error = new FleetRequestError('INVALID_REQUEST', [
      { field: 'birthDate', message: 'invalid' },
      { field: 'licenseNumber', message: 'invalid' },
      { field: 'address.postalCode', message: 'invalid' },
    ])

    expect(toDriverInvalidFieldLabels(error)).toEqual([
      'driverBirthDate',
      'driverLicense',
      'driverAddressPostalCode',
    ])
  })

  test('falls back to the api name so an unmapped field still reaches the operator', () => {
    const error = new FleetRequestError('INVALID_REQUEST', [
      { field: 'somethingNew', message: 'invalid' },
    ])

    expect(toDriverInvalidFieldLabels(error)).toEqual(['somethingNew'])
  })
})
