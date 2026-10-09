/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T3.3 (RF2, RF4, E6): o caso de uso gera o `settingsId` ANTES de selar, sela com o id que a porta vai
 * gravar, não sela quando não há chave nova, recusa atualizar o que não existe e nunca entrega o texto da chave
 * à porta.
 */
import { describe, expect, test } from 'bun:test'
import { createSecretEnvelopeProvider } from '@adatechnology/secret-envelope'

import type {
  HolidayProviderSettingsPort,
  HolidayProviderSettingsRecord,
  SaveHolidayProviderSettingsInput,
} from '../../src/business-calendar/application/holiday-provider-settings.port.js'
import { createHolidayProviderSettingsUseCases } from '../../src/business-calendar/application/holiday-provider-settings.use-case.js'
import { createHolidayProviderTokenSecretService } from '../../src/business-calendar/application/holiday-provider-token-secret.service.js'

const ACTOR = {
  companyId: '00000000-0000-4000-8000-0000000262d1',
  correlationId: 'correlation-use-case',
  ipAddress: '203.0.113.9',
  userId: '00000000-0000-4000-8000-0000000262d2',
} as const
const EXISTING_ID = '00000000-0000-4000-8000-0000000262d3'
const TOKEN = 'FAKE-feriadosapi-key-do-not-leak-0042'

const EXISTING: HolidayProviderSettingsRecord = {
  id: EXISTING_ID,
  monthlyRequestBudget: 4500,
  tokenConfigured: false,
  tokenHint: null,
  tokenUpdatedAt: null,
  updatedAt: new Date('2026-10-09T12:00:00.000Z'),
  version: 2n,
}

function harness(existing: HolidayProviderSettingsRecord | null) {
  const saved: SaveHolidayProviderSettingsInput[] = []
  const removed: unknown[] = []
  const port: HolidayProviderSettingsPort = {
    find: async () => existing,
    removeToken: async (input) => {
      removed.push(input)
    },
    save: async (input) => {
      saved.push(input)
      return { ...EXISTING, id: input.settingsId }
    },
  }
  const envelopeProvider = createSecretEnvelopeProvider({
    activeKeyId: 'test-v1',
    keys: { 'test-v1': Uint8Array.from({ length: 32 }, (_value, index) => index + 1) },
  })
  const secrets = createHolidayProviderTokenSecretService({ envelopeProvider })
  const useCases = createHolidayProviderSettingsUseCases({ port, secrets })
  return { removed, saved, secrets, useCases }
}

describe('holiday provider settings use case (spec 262 RF4)', () => {
  test('creating: generates the id first and seals the key for that same id, with the last 4 as the hint', async () => {
    const { saved, secrets, useCases } = harness(null)

    await useCases.save.execute({
      ...ACTOR,
      expectedVersion: undefined,
      monthlyRequestBudget: undefined,
      token: TOKEN,
    })

    const call = saved[0]
    expect(call?.expectedVersion).toBeUndefined()
    expect(call?.settingsId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-/u)
    expect(call?.settingsId).not.toBe(EXISTING_ID)
    expect(call?.sealedToken?.hint).toBe('0042')
    expect(
      await secrets.decrypt({
        envelope: call?.sealedToken?.envelope,
        settingsId: call?.settingsId ?? '',
      }),
    ).toBe(TOKEN)
  })

  test('updating: seals for the id of the stored row, not for a new one', async () => {
    const { saved, secrets, useCases } = harness(EXISTING)

    await useCases.save.execute({
      ...ACTOR,
      expectedVersion: 2n,
      monthlyRequestBudget: 100,
      token: TOKEN,
    })

    const call = saved[0]
    expect(call).toMatchObject({
      expectedVersion: 2n,
      monthlyRequestBudget: 100,
      settingsId: EXISTING_ID,
    })
    expect(
      await secrets.decrypt({ envelope: call?.sealedToken?.envelope, settingsId: EXISTING_ID }),
    ).toBe(TOKEN)
  })

  test('without a new key it seals nothing and leaves the stored envelope alone', async () => {
    const { saved, useCases } = harness(EXISTING)

    await useCases.save.execute({
      ...ACTOR,
      expectedVersion: 2n,
      monthlyRequestBudget: 100,
      token: undefined,
    })

    expect(saved[0]?.sealedToken).toBeUndefined()
  })

  test('updating a row that does not exist is a version conflict, with nothing sealed or saved', async () => {
    const { saved, useCases } = harness(null)

    await expect(
      useCases.save.execute({
        ...ACTOR,
        expectedVersion: 1n,
        monthlyRequestBudget: 100,
        token: TOKEN,
      }),
    ).rejects.toMatchObject({ code: 'HOLIDAY_PROVIDER_SETTINGS_VERSION_CONFLICT', status: 409 })
    expect(saved).toHaveLength(0)
  })

  test('the port never receives the plain key, only the envelope and the hint', async () => {
    const { saved, useCases } = harness(null)

    await useCases.save.execute({
      ...ACTOR,
      expectedVersion: undefined,
      monthlyRequestBudget: 100,
      token: TOKEN,
    })

    expect(
      JSON.stringify(saved, (_key, value) => (typeof value === 'bigint' ? `${value}` : value)),
    ).not.toContain(TOKEN)
  })

  test('reads through the port and removes the key through the port', async () => {
    const { removed, useCases } = harness(EXISTING)

    expect(await useCases.get.execute()).toBe(EXISTING)
    await useCases.removeToken.execute(ACTOR)

    expect(removed).toEqual([ACTOR])
  })
})
