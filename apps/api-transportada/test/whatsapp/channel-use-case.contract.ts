/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import type { SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import type { CompanyContext } from '../../src/identity/domain/tenant-context.js'
import type {
  WhatsAppChannelRecord,
  WhatsAppChannelRepositoryPort,
  WhatsAppChannelSummary,
} from '../../src/whatsapp/application/whatsapp-channel.port.js'
import { createWhatsAppChannelUseCase } from '../../src/whatsapp/application/whatsapp-channel.use-case.js'
import {
  WhatsAppChannelNotFoundError,
  WhatsAppChannelTokenRequiredError,
} from '../../src/whatsapp/domain/whatsapp-channel.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const CHANNEL_ID = '00000000-0000-4000-8000-000000000030'
const NEW_CHANNEL_ID = '00000000-0000-4000-8000-000000000031'
const CONTEXT = { companyId: COMPANY_ID } as unknown as CompanyContext

const ENVELOPE: SecretEnvelopeV1 = {
  algorithm: 'A256GCM',
  ciphertext: 'cipher',
  keyId: 'key-1',
  nonce: 'nonce-1',
  version: 1,
}

const SUMMARY: WhatsAppChannelSummary = {
  createdAt: '2026-08-28T12:00:00.000Z',
  displayPhoneNumber: '5516999998888',
  id: CHANNEL_ID,
  phoneNumberId: '123456789012345',
  status: 'active',
  tokenConfigured: true,
  updatedAt: '2026-08-28T12:00:00.000Z',
  version: '1',
  wabaId: '987654321098765',
}

const VALUES = {
  displayPhoneNumber: '5516999998888',
  phoneNumberId: '123456789012345',
  status: 'active' as const,
  wabaId: '987654321098765',
}

function buildFixture(input: { readonly existing?: WhatsAppChannelSummary | null } = {}) {
  const saved: WhatsAppChannelRecord[] = []
  const sealed: { channelId: string; companyId: string }[] = []
  let removed = 0

  const repository: WhatsAppChannelRepositoryPort = {
    find: async () => input.existing ?? null,
    findSecret: async () => null,
    remove: async () => {
      removed += 1
      return input.existing != null
    },
    save: async (record) => {
      saved.push(record)
      return SUMMARY
    },
  }

  const useCase = createWhatsAppChannelUseCase({
    newChannelId: () => NEW_CHANNEL_ID,
    repository,
    secrets: {
      decrypt: async () => ({ accessToken: 'x' }),
      encrypt: async (request) => {
        sealed.push({ channelId: request.channelId, companyId: request.companyId })
        return ENVELOPE
      },
    },
  })

  return { removedCount: () => removed, saved, sealed, useCase }
}

describe('o cadastro do canal (spec 062 T003)', () => {
  /**
   * Cadastro novo **exige** token: sem esta regra, salvar o número sem enviá-lo gravaria envelope
   * vazio e o canal falharia no primeiro envio — com a tela mostrando "configurado", porque a linha
   * existe.
   */
  test('canal novo sem token é recusado, e nada é gravado', async () => {
    const fixture = buildFixture({ existing: null })

    await expect(fixture.useCase.save({ context: CONTEXT, values: VALUES })).rejects.toBeInstanceOf(
      WhatsAppChannelTokenRequiredError,
    )
    expect(fixture.saved).toEqual([])
  })

  /**
   * O id do canal entra no AAD, então ele é decidido **antes** de a linha existir: o envelope é
   * selado para a linha, e a linha nasce com o id que o selo prometeu.
   */
  test('o canal novo sela com o id que a linha vai ter', async () => {
    const fixture = buildFixture({ existing: null })

    await fixture.useCase.save({
      context: CONTEXT,
      values: { ...VALUES, accessToken: 'EAAG-token' },
    })

    expect(fixture.sealed).toEqual([{ channelId: NEW_CHANNEL_ID, companyId: COMPANY_ID }])
    expect(fixture.saved[0]?.secretEnvelope).toEqual(ENVELOPE)
  })

  /**
   * Atualizar sem token **mantém o que está selado** — e o repositório sabe disso porque recebe
   * `undefined`, não um envelope vazio. Ninguém relê o token para redigitá-lo.
   */
  test('a atualização sem token não mexe no segredo', async () => {
    const fixture = buildFixture({ existing: SUMMARY })

    await fixture.useCase.save({ context: CONTEXT, values: { ...VALUES, status: 'disabled' } })

    expect(fixture.sealed).toEqual([])
    expect(fixture.saved[0]?.secretEnvelope).toBeUndefined()
    expect(fixture.saved[0]?.status).toBe('disabled')
  })

  /** Token novo em canal existente sela com o **id existente**, não com um id inventado. */
  test('o token trocado sela com o id do canal que já existe', async () => {
    const fixture = buildFixture({ existing: SUMMARY })

    await fixture.useCase.save({
      context: CONTEXT,
      values: { ...VALUES, accessToken: 'EAAG-token-novo' },
    })

    expect(fixture.sealed).toEqual([{ channelId: CHANNEL_ID, companyId: COMPANY_ID }])
  })

  /** Apagar o que não existe é `404`: a resposta distingue "apaguei" de "não havia o que apagar". */
  test('remover canal inexistente é ausência declarada', async () => {
    const fixture = buildFixture({ existing: null })

    await expect(fixture.useCase.remove({ context: CONTEXT })).rejects.toBeInstanceOf(
      WhatsAppChannelNotFoundError,
    )
  })
})
