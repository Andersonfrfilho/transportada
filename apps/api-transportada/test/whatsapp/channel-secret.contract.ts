/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import type { SecretEnvelopeProvider, SecretEnvelopeV1 } from '@adatechnology/secret-envelope'

import { createWhatsAppChannelSecretService } from '../../src/whatsapp/application/whatsapp-channel-secret.service.js'
import { WhatsAppChannelUnavailableError } from '../../src/whatsapp/domain/whatsapp-channel.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-000000000001'
const OTHER_COMPANY_ID = '00000000-0000-4000-8000-000000000002'
const CHANNEL_ID = '00000000-0000-4000-8000-000000000010'
const TEXT_DECODER = new TextDecoder()
const TEXT_ENCODER = new TextEncoder()

/**
 * Um cofre de mentira que **respeita o AAD**: ele guarda o dado autenticado junto do texto e recusa
 * abrir quando o pedido chega com outro. Sem isso o teste do vazamento entre empresas passaria por
 * acidente, e é justamente essa a propriedade que o AAD existe para dar.
 */
function createFakeProvider(): SecretEnvelopeProvider {
  const vault = new Map<string, { aad: string; plaintext: string }>()
  let sequence = 0

  return {
    async decrypt({ additionalAuthenticatedData, envelope }) {
      const stored = vault.get(envelope.ciphertext)
      if (stored === undefined) throw new Error('unknown ciphertext')
      if (stored.aad !== TEXT_DECODER.decode(additionalAuthenticatedData)) {
        throw new Error('aad mismatch')
      }

      return TEXT_ENCODER.encode(stored.plaintext)
    },
    async encrypt({ additionalAuthenticatedData, plaintext }) {
      sequence += 1
      const ciphertext = `cipher-${sequence}`
      vault.set(ciphertext, {
        aad: TEXT_DECODER.decode(additionalAuthenticatedData),
        plaintext: TEXT_DECODER.decode(plaintext),
      })

      return {
        algorithm: 'A256GCM',
        ciphertext,
        keyId: 'key-1',
        nonce: 'nonce-1',
        version: 1,
      } satisfies SecretEnvelopeV1
    },
  }
}

describe('o token do WhatsApp selado (spec 062 T001)', () => {
  test('sela e abre o token da própria linha', async () => {
    const service = createWhatsAppChannelSecretService({ envelopeProvider: createFakeProvider() })

    const envelope = await service.encrypt({
      accessToken: 'EAAG-token-da-meta',
      channelId: CHANNEL_ID,
      companyId: COMPANY_ID,
    })
    const opened = await service.decrypt({ channelId: CHANNEL_ID, companyId: COMPANY_ID, envelope })

    expect(opened.accessToken).toBe('EAAG-token-da-meta')
    /** O envelope guarda cifra, e não o token — o teste falha se alguém o serializar em claro. */
    expect(JSON.stringify(envelope)).not.toContain('EAAG-token-da-meta')
  })

  /**
   * ⚠️ A propriedade que o AAD compra: envelope copiado para **outra empresa** não abre, mesmo com a
   * chave certa. É a diferença entre "cifrado" e "cifrado para este uso".
   */
  test('o envelope de uma empresa não abre em outra', async () => {
    const service = createWhatsAppChannelSecretService({ envelopeProvider: createFakeProvider() })
    const envelope = await service.encrypt({
      accessToken: 'EAAG-token-da-meta',
      channelId: CHANNEL_ID,
      companyId: COMPANY_ID,
    })

    await expect(
      service.decrypt({ channelId: CHANNEL_ID, companyId: OTHER_COMPANY_ID, envelope }),
    ).rejects.toBeInstanceOf(WhatsAppChannelUnavailableError)
  })

  /** E nem em outro canal da mesma empresa: o AAD amarra a linha, não o tenant. */
  test('o envelope de um canal não abre em outro', async () => {
    const service = createWhatsAppChannelSecretService({ envelopeProvider: createFakeProvider() })
    const envelope = await service.encrypt({
      accessToken: 'EAAG-token-da-meta',
      channelId: CHANNEL_ID,
      companyId: COMPANY_ID,
    })

    await expect(
      service.decrypt({
        channelId: '00000000-0000-4000-8000-000000000011',
        companyId: COMPANY_ID,
        envelope,
      }),
    ).rejects.toBeInstanceOf(WhatsAppChannelUnavailableError)
  })

  /**
   * Chaveiro fora do ar e AAD que não casa respondem **igual**: distinguir contaria a quem tem
   * acesso à API se aquela empresa tem canal cadastrado. O motivo real fica no log.
   */
  test('falha do cofre vira indisponibilidade, sem dizer o motivo', async () => {
    const service = createWhatsAppChannelSecretService({
      envelopeProvider: {
        decrypt: () => Promise.reject(new Error('keyring down')),
        encrypt: () => Promise.reject(new Error('keyring down')),
      },
    })

    await expect(
      service.encrypt({ accessToken: 'x', channelId: CHANNEL_ID, companyId: COMPANY_ID }),
    ).rejects.toBeInstanceOf(WhatsAppChannelUnavailableError)
  })
})
