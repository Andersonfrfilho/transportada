/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import { PROOF_PUNCTUALITY_VALUES } from '@/modules/driver-trip/shared/driverTrip.types'
import {
  clampProofAccuracyMeters,
  createDriverTripClient,
  MAX_PROOF_ACCURACY_METERS,
} from '@/modules/driver-trip/shared/driverTripClient.service'

const HOOK = new URL('../../src/modules/driver-trip/hooks/useDriverTrip.hook.ts', import.meta.url)

function createCapturingClient(requests: Request[]) {
  return createDriverTripClient({
    apiUrl: 'https://api.test',
    fetch: (input) => {
      requests.push(input as Request)
      return Promise.resolve(
        new Response('{"data":{"id":"proof-1","punctuality":"not_required"}}', {
          headers: { 'content-type': 'application/json' },
        }),
      )
    },
    getAccessToken: () => Promise.resolve('token'),
  })
}

/**
 * Spec 159 (T11, item 2): `accuracyMeters` acima de 10 km agora dá `400` na API. O cliente nunca
 * manda um valor que ela recusa — nem na captura nova, nem ao drenar um anexo antigo da fila
 * offline com o valor sem teto de antes desta correção.
 */
describe('accuracyMeters acima de 10 km não sobe (T11, item 2)', () => {
  it('limita em 10.000', () => {
    expect(MAX_PROOF_ACCURACY_METERS).toBe(10_000)
  })

  it('mantém o valor dentro do teto', () => {
    expect(clampProofAccuracyMeters(500)).toBe(500)
    expect(clampProofAccuracyMeters(10_000)).toBe(10_000)
  })

  it('omite o valor acima do teto, em vez de mandar cru', () => {
    expect(clampProofAccuracyMeters(10_001)).toBeUndefined()
    expect(clampProofAccuracyMeters(50_000)).toBeUndefined()
  })

  it('sem accuracyMeters, permanece ausente', () => {
    expect(clampProofAccuracyMeters(undefined)).toBeUndefined()
  })

  it('o multipart do anexo nunca carrega accuracyMeters acima do teto', async () => {
    const requests: Request[] = []
    const client = createCapturingClient(requests)

    await client.attachProof({
      accuracyMeters: 25_000,
      documentId: 'document-1',
      file: new File([new Uint8Array(4)], 'canhoto.jpg', { type: 'image/jpeg' }),
      kind: 'photo',
    })

    const form = await requests[0]?.formData()
    expect(form?.has('accuracyMeters')).toBe(false)
  })

  it('o multipart carrega accuracyMeters dentro do teto normalmente', async () => {
    const requests: Request[] = []
    const client = createCapturingClient(requests)

    await client.attachProof({
      accuracyMeters: 300,
      documentId: 'document-1',
      file: new File([new Uint8Array(4)], 'canhoto.jpg', { type: 'image/jpeg' }),
      kind: 'photo',
    })

    const form = await requests[0]?.formData()
    expect(form?.get('accuracyMeters')).toBe('300')
  })

  /**
   * Item 4 da revisão: a fila offline drena pelo **mesmo** `attachProof` do cliente — anexo antigo
   * gravado com precisão sem teto (antes desta correção) passa pelo mesmo clamp ao subir.
   */
  it('a drenagem da fila usa o mesmo attachProof do cliente, sem caminho paralelo', () => {
    const hook = readFileSync(HOOK, 'utf8')
    expect(hook).toInclude('client.attachProof({')
  })
})

/** Spec 159 (T11, item 9): uma fonte só para os valores de pontualidade — sem redeclarar. */
describe('PROOF_PUNCTUALITY_VALUES tem uma fonte só (T11, item 9)', () => {
  it('driverTrip.types é a origem, e o cliente a importa em vez de redeclarar', () => {
    const CLIENT = new URL(
      '../../src/modules/driver-trip/shared/driverTripClient.service.ts',
      import.meta.url,
    )
    const client = readFileSync(CLIENT, 'utf8')

    expect(PROOF_PUNCTUALITY_VALUES).toEqual([
      'not_required',
      'on_time',
      'late',
      'away',
      'late_and_away',
    ])
    expect(client).toInclude('PROOF_PUNCTUALITY_VALUES')
    expect(client).not.toMatch(/const PROOF_PUNCTUALITY_VALUES = \[/u)
  })

  it('DriverProofOutcome não carrega mais o valor morto `sent`', () => {
    const hook = readFileSync(HOOK, 'utf8')
    expect(hook).toInclude(
      "export type DriverProofOutcome = 'count-limit' | 'queued' | 'size-limit'",
    )
  })
})
