/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import en from '../../src/modules/pickup-requests/locales/pickupRequests.en.locale.json'
import pt from '../../src/modules/pickup-requests/locales/pickupRequests.locale.json'
import { PICKUP_REQUEST_STATUSES } from '../../src/modules/pickup-requests/shared/pickupRequest.types'

function keysOf(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    keysOf(child, prefix === '' ? key : `${prefix}.${key}`),
  )
}

describe('pedidos de coleta — textos', () => {
  test('pt-BR e en têm as mesmas chaves', () => {
    expect(keysOf(en).sort()).toEqual(keysOf(pt).sort())
  })

  test('toda situação tem rótulo nos dois idiomas', () => {
    for (const status of PICKUP_REQUEST_STATUSES) {
      expect(Object.keys(pt.status)).toContain(status)
      expect(Object.keys(en.status)).toContain(status)
    }
  })
})
