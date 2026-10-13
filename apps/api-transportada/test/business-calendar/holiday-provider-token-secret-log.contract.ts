/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 262 T6.1b (revisão final): o cofre da chave responde sempre a mesma coisa ao cliente, mas o operador precisa
 * distinguir um chaveiro mal configurado de qualquer outra falha. O servidor loga só o NOME da classe do erro e a operação:
 * nunca a mensagem (que pode citar o id da chave de cifragem), nunca a chave da FeriadosAPI, nunca o id da linha.
 */
import { describe, expect, test } from 'bun:test'
import type { SecretEnvelopeProvider } from '@adatechnology/secret-envelope'

import { createHolidayProviderTokenSecretService } from '../../src/business-calendar/application/holiday-provider-token-secret.service.js'
import {
  HolidayProviderTokenFormatError,
  HolidayProviderTokenUnavailableError,
} from '../../src/business-calendar/domain/holiday-provider-settings.error.js'

const SETTINGS_ID = '00000000-0000-4000-8000-0000000262b1'
const TOKEN = 'fake-feriadosapi-key-0123456789'
const KEY_ID_IN_MESSAGE = 'keyring-primary-2026'
const LEAKY_MESSAGE = `unknown key ${KEY_ID_IN_MESSAGE} for ${TOKEN}`

class KeyringNotConfiguredError extends Error {
  public constructor() {
    super(LEAKY_MESSAGE)
    this.name = 'KeyringNotConfiguredError'
  }
}

type LoggedCall = { readonly level: string; readonly message: string; readonly meta: unknown }

function recordingLogger(): {
  readonly calls: LoggedCall[]
  readonly logger: { error: () => void; info: () => void; warn: () => void }
} {
  const calls: LoggedCall[] = []
  const record = (level: string) => (message: string, meta?: unknown) => {
    calls.push({ level, message, meta })
  }
  return {
    calls,
    logger: { error: record('error'), info: record('info'), warn: record('warn') } as never,
  }
}

function brokenProvider(failure: unknown): SecretEnvelopeProvider {
  return {
    async decrypt() {
      throw failure
    },
    async encrypt() {
      throw failure
    },
  }
}

function expectNothingSecretLogged(calls: readonly LoggedCall[]): void {
  const serialized = JSON.stringify(calls)
  expect(serialized).not.toContain(TOKEN)
  expect(serialized).not.toContain(KEY_ID_IN_MESSAGE)
  expect(serialized).not.toContain(LEAKY_MESSAGE)
  expect(serialized).not.toContain(SETTINGS_ID)
}

describe('holiday provider token vault failure log (spec 262 T6.1b)', () => {
  test('a falha ao selar loga só o nome do erro e a operação, e o cliente recebe a resposta de sempre', async () => {
    const { calls, logger } = recordingLogger()
    const service = createHolidayProviderTokenSecretService({
      envelopeProvider: brokenProvider(new KeyringNotConfiguredError()),
      logger,
    })

    await expect(service.encrypt({ settingsId: SETTINGS_ID, token: TOKEN })).rejects.toBeInstanceOf(
      HolidayProviderTokenUnavailableError,
    )

    expect(calls).toHaveLength(1)
    expect(calls[0]?.level).toBe('error')
    expect(calls[0]?.meta).toEqual({ errorName: 'KeyringNotConfiguredError', operation: 'encrypt' })
    expectNothingSecretLogged(calls)
  })

  test('a falha ao abrir loga só o nome do erro e a operação', async () => {
    const { calls, logger } = recordingLogger()
    const service = createHolidayProviderTokenSecretService({
      envelopeProvider: brokenProvider(new KeyringNotConfiguredError()),
      logger,
    })
    const envelope = {
      algorithm: 'A256GCM',
      ciphertext: 'Y2lwaGVy',
      keyId: 'k1',
      nonce: 'bm9uY2U',
      version: 1,
    }

    await expect(service.decrypt({ envelope, settingsId: SETTINGS_ID })).rejects.toBeInstanceOf(
      HolidayProviderTokenUnavailableError,
    )

    expect(calls[0]?.meta).toEqual({ errorName: 'KeyringNotConfiguredError', operation: 'decrypt' })
    expectNothingSecretLogged(calls)
  })

  test('falha que não é uma instância de Error loga o tipo, nunca o valor lançado', async () => {
    const { calls, logger } = recordingLogger()
    const service = createHolidayProviderTokenSecretService({
      envelopeProvider: brokenProvider(LEAKY_MESSAGE),
      logger,
    })

    await expect(service.encrypt({ settingsId: SETTINGS_ID, token: TOKEN })).rejects.toBeInstanceOf(
      HolidayProviderTokenUnavailableError,
    )

    expect(calls[0]?.meta).toEqual({ errorName: 'string', operation: 'encrypt' })
    expectNothingSecretLogged(calls)
  })

  test('chave fora do formato é recusa do cliente, não falha do cofre: nada é logado', async () => {
    const { calls, logger } = recordingLogger()
    const service = createHolidayProviderTokenSecretService({
      envelopeProvider: brokenProvider(new KeyringNotConfiguredError()),
      logger,
    })

    await expect(
      service.encrypt({ settingsId: SETTINGS_ID, token: 'curta' }),
    ).rejects.toBeInstanceOf(HolidayProviderTokenFormatError)

    expect(calls).toHaveLength(0)
  })

  test('sem logger o serviço funciona como antes', async () => {
    const service = createHolidayProviderTokenSecretService({
      envelopeProvider: brokenProvider(new KeyringNotConfiguredError()),
    })

    await expect(service.encrypt({ settingsId: SETTINGS_ID, token: TOKEN })).rejects.toBeInstanceOf(
      HolidayProviderTokenUnavailableError,
    )
  })
})
