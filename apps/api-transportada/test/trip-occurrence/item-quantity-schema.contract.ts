/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 166 T203/T207: o parser multipart lê `productQuantities`/`productQuantityUnits`
 * alinhados por índice a `productCodes`, e o cadastro do tipo aceita o interruptor
 * `allowsMultipleItems`.
 */
import { describe, expect, test } from 'bun:test'

import {
  parseOccurrenceTypeRequest,
  parseRegisterOccurrenceMultipartRequest,
} from '../../src/trips/presentation/occurrence.schema.js'

const TIPO = '00000000-0000-4000-8000-0000000000e1'

function multipart(fields: Record<string, string | readonly string[]>): Request {
  const form = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) for (const entry of value) form.append(key, entry)
    else form.set(key, value as string)
  }
  form.append(
    'file',
    new File([new Uint8Array([1, 2, 3])], 'ocorrencia.jpg', {
      type: 'image/jpeg',
    }),
  )
  return new Request('http://localhost/trips/x', {
    body: form,
    headers: { 'Idempotency-Key': 'k1' },
    method: 'POST',
  })
}

describe('o parser multipart lê as quantidades alinhadas a productCodes (spec 166 RF4)', () => {
  test('sem os campos, as duas listas saem vazias', async () => {
    const parsed = await parseRegisterOccurrenceMultipartRequest(
      multipart({ occurrenceTypeId: TIPO }),
    )
    expect(parsed.productQuantities).toEqual([])
    expect(parsed.productQuantityUnits).toEqual([])
  })

  test('lê os dois campos repetidos, na mesma ordem, preservando branco', async () => {
    const parsed = await parseRegisterOccurrenceMultipartRequest(
      multipart({
        occurrenceTypeId: TIPO,
        productCodes: ['ZG-4410', 'ZG-4411'],
        productQuantities: ['3.5', ''],
        productQuantityUnits: ['box', ''],
      }),
    )
    expect(parsed.productCodes).toEqual(['ZG-4410', 'ZG-4411'])
    expect(parsed.productQuantities).toEqual(['3.5', ''])
    expect(parsed.productQuantityUnits).toEqual(['box', ''])
  })
})

describe('o cadastro do tipo aceita o interruptor de multi-item (spec 166 RF9)', () => {
  function baseBody() {
    return JSON.stringify({
      active: true,
      emailBody: '',
      emailSubject: '',
      emailTemplateKey: null,
      name: 'Item avariado',
      notifies: false,
      occurrenceTypeId: null,
      stage: 'separation',
    })
  }

  test('sem o campo, o padrão é true — nenhuma instalação muda de comportamento', async () => {
    const request = new Request('http://localhost/company-settings/occurrence-types', {
      body: baseBody(),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect((await parseOccurrenceTypeRequest(request)).allowsMultipleItems).toBe(true)
  })

  test('false é aceito e preservado', async () => {
    const request = new Request('http://localhost/company-settings/occurrence-types', {
      body: JSON.stringify({ ...JSON.parse(baseBody()), allowsMultipleItems: false }),
      headers: { 'content-type': 'application/json' },
      method: 'PUT',
    })
    expect((await parseOccurrenceTypeRequest(request)).allowsMultipleItems).toBe(false)
  })
})
