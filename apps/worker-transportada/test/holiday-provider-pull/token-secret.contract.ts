/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T4.1: o worker abre a chave da FeriadosAPI que a API selou. Qualquer falha na abertura — envelope
 * malformado (o Zod entra no `try`), id de outra linha, chaveiro de outra instalação, plaintext fora do formato —
 * vira o MESMO erro tipado, sem a chave nem o motivo.
 */
import { describe, expect, test } from 'bun:test'

import { createHolidayProviderTokenSecretService } from '../../src/holiday-provider-pull/application/holiday-provider-token-secret.service.js'
import { HolidayProviderTokenUnreadableError } from '../../src/holiday-provider-pull/domain/holiday-provider-token.error.js'
import {
  FIXTURE_HOLIDAY_TOKEN,
  FOREIGN_PROVIDER,
  INSTALLATION_PROVIDER,
  sealLikeTheApiWould,
} from '../fixtures/holiday-provider-token-seal.fixture.js'

const SETTINGS_ID = '00000000-0000-4000-8000-0000000000e1'
const OTHER_SETTINGS_ID = '00000000-0000-4000-8000-0000000000e2'

const service = createHolidayProviderTokenSecretService({ envelopeProvider: INSTALLATION_PROVIDER })

async function failureOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error: unknown) {
    return error
  }
  throw new Error('expected the decrypt to fail')
}

describe('o worker abre a chave selada pela API (spec 262 T4.1)', () => {
  test('abre o envelope montado como a API o monta, com o AAD da linha', async () => {
    const envelope = await sealLikeTheApiWould({ settingsId: SETTINGS_ID })

    expect(await service.decrypt({ envelope, settingsId: SETTINGS_ID })).toBe(FIXTURE_HOLIDAY_TOKEN)
  })

  test('não abre com o id de outra linha, nem com o chaveiro de outra instalação', async () => {
    const envelope = await sealLikeTheApiWould({ settingsId: SETTINGS_ID })
    const foreign = await sealLikeTheApiWould({
      provider: FOREIGN_PROVIDER,
      settingsId: SETTINGS_ID,
    })

    expect(
      await failureOf(service.decrypt({ envelope, settingsId: OTHER_SETTINGS_ID })),
    ).toBeInstanceOf(HolidayProviderTokenUnreadableError)
    expect(
      await failureOf(service.decrypt({ envelope: foreign, settingsId: SETTINGS_ID })),
    ).toBeInstanceOf(HolidayProviderTokenUnreadableError)
  })

  test('envelope malformado vira o erro tipado, inclusive o do Zod (o parse está dentro do try)', async () => {
    const valid = await sealLikeTheApiWould({ settingsId: SETTINGS_ID })
    const malformed: readonly unknown[] = [
      null,
      'texto',
      [],
      {},
      { ...valid, algorithm: 'A128GCM' },
      { ...valid, version: 2 },
      { ...valid, ciphertext: '' },
      { ...valid, extra: 'campo a mais' },
      {
        ...valid,
        ciphertext: `${valid.ciphertext.startsWith('A') ? 'B' : 'A'}${valid.ciphertext.slice(1)}`,
      },
    ]

    for (const envelope of malformed) {
      expect(
        await failureOf(service.decrypt({ envelope, settingsId: SETTINGS_ID })),
      ).toBeInstanceOf(HolidayProviderTokenUnreadableError)
    }
  })

  test('o plaintext fora do formato é recusado: campo a mais, chave curta, longa, com espaço ou acento, JSON torto', async () => {
    const bodies = [
      JSON.stringify({ extra: 1, token: FIXTURE_HOLIDAY_TOKEN }),
      JSON.stringify({ token: 'a'.repeat(15) }),
      JSON.stringify({ token: 'a'.repeat(513) }),
      JSON.stringify({ token: `${FIXTURE_HOLIDAY_TOKEN} x` }),
      JSON.stringify({ token: `${FIXTURE_HOLIDAY_TOKEN}é` }),
      JSON.stringify({ token: 1_234_567_890_123_456 }),
      JSON.stringify({}),
      '{"token":',
      'not json',
    ]

    for (const plaintext of bodies) {
      const envelope = await sealLikeTheApiWould({ plaintext, settingsId: SETTINGS_ID })

      expect(
        await failureOf(service.decrypt({ envelope, settingsId: SETTINGS_ID })),
      ).toBeInstanceOf(HolidayProviderTokenUnreadableError)
    }
  })

  test('aceita os limites da regra: 16 e 512 caracteres', async () => {
    for (const token of ['a'.repeat(16), 'a'.repeat(512)]) {
      const envelope = await sealLikeTheApiWould({ settingsId: SETTINGS_ID, token })

      expect(await service.decrypt({ envelope, settingsId: SETTINGS_ID })).toBe(token)
    }
  })

  test('o erro não carrega a chave, o id da linha nem o motivo', async () => {
    const envelope = await sealLikeTheApiWould({ settingsId: SETTINGS_ID })
    const caught = await failureOf(service.decrypt({ envelope, settingsId: OTHER_SETTINGS_ID }))

    const serialized = `${String(caught)}${JSON.stringify(caught, Object.getOwnPropertyNames(caught as object))}`
    for (const sensitive of [
      FIXTURE_HOLIDAY_TOKEN,
      SETTINGS_ID,
      OTHER_SETTINGS_ID,
      envelope.ciphertext,
    ]) {
      expect(serialized).not.toContain(sensitive)
    }
  })
})
