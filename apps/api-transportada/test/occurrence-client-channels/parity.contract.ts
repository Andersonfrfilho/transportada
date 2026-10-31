/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 T2 (RF2): o contrato de paridade entre os campos antigos do tipo (`client_channel`, `client_email_type`,
 * `client_email_send_mode`) e a matriz por canal. Escrito antes da gravação: o painel e o app já publicados leem só
 * `client_channel`, e o painel antigo ainda o grava — a matriz e ele nunca podem divergir.
 */
import { describe, expect, test } from 'bun:test'

import {
  CLIENT_CHANNELS,
  CLIENT_EMAIL_SEND_MODES,
  CLIENT_EMAIL_TYPES,
  type ClientChannel,
} from '../../src/shared/delivery-client-email.constant.js'
import {
  applyLegacyFieldsToClientChannelMatrix,
  deriveClientChannelFromMatrix,
  deriveClientChannelMatrixFromLegacy,
  deriveLegacyFieldsFromClientChannelMatrix,
  isEmailEnabledWithoutClientEmailType,
  mergeClientChannelMatrix,
  resolveClientChannelMatrix,
  type OccurrenceClientChannelMatrix,
} from '../../src/trips/domain/occurrence-client-channels.policy.js'

const OFF_MATRIX: OccurrenceClientChannelMatrix = {
  email: { enabled: false, sendMode: 'manual', templateKey: null },
  whatsapp: { enabled: false, sendMode: 'manual', templateKey: null },
}

function withChannels(email: boolean, whatsapp: boolean): OccurrenceClientChannelMatrix {
  return {
    email: { ...OFF_MATRIX.email, enabled: email },
    whatsapp: { ...OFF_MATRIX.whatsapp, enabled: whatsapp },
  }
}

describe('spec 286 T2: client_channel é derivado da matriz', () => {
  test.each([
    [false, false, 'off'],
    [true, false, 'email'],
    [false, true, 'whatsapp'],
    [true, true, 'both'],
  ] as const)('e-mail %p + WhatsApp %p = %p', (email, whatsapp, expected) => {
    expect(deriveClientChannelFromMatrix(withChannels(email, whatsapp))).toBe(expected)
  })

  test('o modo do e-mail da matriz vira o client_email_send_mode', () => {
    const matrix = {
      ...withChannels(true, false),
      email: { enabled: true, sendMode: 'automatic', templateKey: 'k' },
    } as const
    expect(deriveLegacyFieldsFromClientChannelMatrix(matrix)).toEqual({
      clientChannel: 'email',
      clientEmailSendMode: 'automatic',
    })
  })
})

describe('spec 286 T2: a matriz derivada dos campos antigos (preenchimento e leitura tolerante)', () => {
  test('ida e volta: todo client_channel com tipo de e-mail escolhido volta igual', () => {
    for (const clientChannel of CLIENT_CHANNELS) {
      for (const clientEmailSendMode of CLIENT_EMAIL_SEND_MODES) {
        const matrix = deriveClientChannelMatrixFromLegacy({
          clientChannel,
          clientEmailSendMode,
          clientEmailType: 'boleto',
        })
        expect(deriveClientChannelFromMatrix(matrix)).toBe(clientChannel)
        expect(matrix.email.sendMode).toBe(clientEmailSendMode)
      }
    }
  })

  test('client_email_type off desliga o e-mail (a 279 não manda nada), o WhatsApp segue o canal', () => {
    const expected: Record<ClientChannel, ClientChannel> = {
      both: 'whatsapp',
      email: 'off',
      off: 'off',
      whatsapp: 'whatsapp',
    }
    for (const clientChannel of CLIENT_CHANNELS) {
      const matrix = deriveClientChannelMatrixFromLegacy({
        clientChannel,
        clientEmailSendMode: 'manual',
        clientEmailType: 'off',
      })
      expect(deriveClientChannelFromMatrix(matrix)).toBe(expected[clientChannel])
    }
  })

  test('o WhatsApp antigo só tinha envio manual e nenhum canal nasce com modelo', () => {
    const matrix = deriveClientChannelMatrixFromLegacy({
      clientChannel: 'both',
      clientEmailSendMode: 'automatic',
      clientEmailType: 'boleto',
    })
    expect(matrix.whatsapp).toEqual({ enabled: true, sendMode: 'manual', templateKey: null })
    expect(matrix.email.templateKey).toBeNull()
  })

  test('tipo sem linha lê o derivado; com linha, o gravado vence por canal', () => {
    const legacy = {
      clientChannel: 'email',
      clientEmailSendMode: 'manual',
      clientEmailType: 'boleto',
    } as const
    expect(resolveClientChannelMatrix({ legacy, stored: undefined })).toEqual(
      deriveClientChannelMatrixFromLegacy(legacy),
    )
    const storedWhatsApp = { enabled: true, sendMode: 'automatic', templateKey: 'w' } as const
    const resolved = resolveClientChannelMatrix({ legacy, stored: { whatsapp: storedWhatsApp } })
    expect(resolved.whatsapp).toEqual(storedWhatsApp)
    expect(resolved.email.enabled).toBe(true)
  })
})

describe('spec 286 T2: gravação nova e gravação do painel antigo', () => {
  test('o canal mandado substitui o gravado inteiro; o ausente fica', () => {
    const current: OccurrenceClientChannelMatrix = {
      email: { enabled: true, sendMode: 'automatic', templateKey: 'e' },
      whatsapp: { enabled: false, sendMode: 'manual', templateKey: 'w' },
    }
    const merged = mergeClientChannelMatrix({
      change: { whatsapp: { enabled: true, sendMode: 'automatic', templateKey: null } },
      current,
    })
    expect(merged).toEqual({
      email: current.email,
      whatsapp: { enabled: true, sendMode: 'automatic', templateKey: null },
    })
  })

  test('o painel antigo liga e desliga as caixas, sem apagar modelo nem o modo do WhatsApp', () => {
    const current: OccurrenceClientChannelMatrix = {
      email: { enabled: true, sendMode: 'manual', templateKey: 'e' },
      whatsapp: { enabled: true, sendMode: 'automatic', templateKey: 'w' },
    }
    for (const clientChannel of CLIENT_CHANNELS) {
      for (const clientEmailType of CLIENT_EMAIL_TYPES) {
        const legacy = { clientChannel, clientEmailSendMode: 'automatic', clientEmailType } as const
        const applied = applyLegacyFieldsToClientChannelMatrix({ current, legacy })
        expect(applied.email.templateKey).toBe('e')
        expect(applied.whatsapp.templateKey).toBe('w')
        expect(applied.whatsapp.sendMode).toBe('automatic')
        expect(applied.email.sendMode).toBe('automatic')
        expect(deriveClientChannelFromMatrix(applied)).toBe(
          deriveClientChannelFromMatrix(deriveClientChannelMatrixFromLegacy(legacy)),
        )
      }
    }
  })

  test('e-mail ligado com client_email_type off é a divergência que a gravação recusa', () => {
    const matrix = withChannels(true, false)
    expect(isEmailEnabledWithoutClientEmailType({ clientEmailType: 'off', matrix })).toBe(true)
    expect(isEmailEnabledWithoutClientEmailType({ clientEmailType: 'boleto', matrix })).toBe(false)
    expect(
      isEmailEnabledWithoutClientEmailType({ clientEmailType: 'off', matrix: OFF_MATRIX }),
    ).toBe(false)
  })
})
