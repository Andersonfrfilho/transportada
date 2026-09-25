/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 159 T11 (itens 4 e 10): os quatro campos novos do multipart do `/proof` passam por Zod —
 * texto com teto e forma decimal antes de virar número, faixa de coordenada, teto da precisão
 * declarada e `capturedAt` ISO. Tudo opcional; o par incompleto é `400`.
 */
import { describe, expect, test } from 'bun:test'

import { ApiError } from '../../src/shared/api.error.js'
import { parseDeliveryProofUpload } from '../../src/trips/presentation/delivery-proof.schema.js'

function proofRequest(fields: Record<string, string>): Request {
  const form = new FormData()
  form.set('file', new File([new Uint8Array([1, 2, 3])], 'canhoto.jpg', { type: 'image/jpeg' }))
  form.set('kind', 'photo')
  for (const [name, value] of Object.entries(fields)) form.set(name, value)

  return new Request('http://api.test/me/trips/current/documents/x/proof', {
    body: form,
    method: 'POST',
  })
}

async function expectInvalid(fields: Record<string, string>): Promise<void> {
  const error = await parseDeliveryProofUpload(proofRequest(fields)).catch((cause) => cause)
  expect(error).toBeInstanceOf(ApiError)
  expect((error as ApiError).status).toBe(400)
}

describe('posição e horário da foto no multipart (spec 159 T11)', () => {
  test('sem posição nem horário é o caso normal', async () => {
    const upload = await parseDeliveryProofUpload(proofRequest({}))

    expect(upload.position).toBeUndefined()
    expect(upload.capturedAt).toBeUndefined()
  })

  test('campos vazios contam como ausentes', async () => {
    const upload = await parseDeliveryProofUpload(
      proofRequest({ accuracyMeters: '', capturedAt: '', latitude: '', longitude: '' }),
    )

    expect(upload.position).toBeUndefined()
    expect(upload.capturedAt).toBeUndefined()
  })

  test('par completo com precisão e horário', async () => {
    const upload = await parseDeliveryProofUpload(
      proofRequest({
        accuracyMeters: '12.5',
        capturedAt: '2026-09-18T12:10:00.000Z',
        latitude: '-23.5505199',
        longitude: '-46.6333094',
      }),
    )

    expect(upload.position).toEqual({
      accuracyMeters: 12.5,
      latitude: '-23.5505199',
      longitude: '-46.6333094',
    })
    expect(upload.capturedAt?.toISOString()).toBe('2026-09-18T12:10:00.000Z')
  })

  /** O PWA manda `String(number)` do GPS do navegador — até 17 casas decimais. */
  test('coordenada com todas as casas de um double entra', async () => {
    const upload = await parseDeliveryProofUpload(
      proofRequest({
        accuracyMeters: '14.927000045776367',
        latitude: '-23.550519912345678',
        longitude: '-46.633309412345678',
      }),
    )

    expect(upload.position).toEqual({
      accuracyMeters: 14.927000045776367,
      latitude: '-23.5505199',
      longitude: '-46.6333094',
    })
  })

  test('a precisão no teto (10000 m) ainda entra', async () => {
    const upload = await parseDeliveryProofUpload(
      proofRequest({ accuracyMeters: '10000', latitude: '-23.55', longitude: '-46.63' }),
    )

    expect(upload.position?.accuracyMeters).toBe(10000)
  })

  test.each([
    ['meia coordenada', { latitude: '-23.55' }],
    ['latitude fora da faixa', { latitude: '-90.5', longitude: '-46.63' }],
    ['longitude fora da faixa', { latitude: '-23.55', longitude: '180.1' }],
    ['notação científica', { latitude: '-2.3e1', longitude: '-46.63' }],
    ['texto que não é número', { latitude: 'abc', longitude: '-46.63' }],
    ['coordenada longa demais', { latitude: `-23.${'5'.repeat(40)}`, longitude: '-46.63' }],
    [
      'precisão de seis dígitos',
      { accuracyMeters: '100000', latitude: '-23.55', longitude: '-46.63' },
    ],
    [
      'precisão acima do teto',
      { accuracyMeters: '10001', latitude: '-23.55', longitude: '-46.63' },
    ],
    ['precisão negativa', { accuracyMeters: '-1', latitude: '-23.55', longitude: '-46.63' }],
    ['precisão Infinity', { accuracyMeters: 'Infinity', latitude: '-23.55', longitude: '-46.63' }],
    ['capturedAt que não é ISO', { capturedAt: 'ontem à tarde' }],
  ])('%s é 400', async (_label, fields) => {
    await expectInvalid(fields)
  })
})

/**
 * Revisão da spec 184 (ALTO): `TRIP_DELIVERY_PROOF_KINDS` ganhou `cargo`, e esta rota validava
 * contra aquela lista — o app do motorista passou a aceitar foto de carga sem o teto de cinco e sem
 * a deduplicação do escritório, e um retry em laço gravaria linhas e objetos sem fim. A foto de
 * carga pelo motorista está fora do escopo da 182: a rota dele conhece só canhoto e assinatura.
 */
describe('tipos que a rota do motorista aceita (spec 184)', () => {
  test.each(['photo', 'signature'])('aceita %s', async (kind) => {
    const upload = await parseDeliveryProofUpload(proofRequest({ kind }))

    expect(upload.kind).toBe(kind)
  })

  test('recusa cargo com 400', async () => {
    await expectInvalid({ kind: 'cargo' })
  })
})
