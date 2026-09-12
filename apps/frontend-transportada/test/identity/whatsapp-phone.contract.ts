/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { WHATSAPP_PHONE_ERROR } from '../../src/modules/identity/shared/whatsappPhone.constant'
import {
  toWhatsAppPhoneState,
  toWhatsAppPhoneVerification,
} from '../../src/modules/identity/shared/whatsappPhone.validation'
import { resolveWhatsAppPhoneViewModel } from '../../src/modules/identity/shared/whatsappPhoneViewModel.service'

const VERIFIED_AT = '2026-09-11T12:00:00.000Z'
const EXPIRES_AT = '2026-12-10T12:00:00.000Z'
const CODE_EXPIRES_AT = '2026-09-11T12:10:00.000Z'
const CODE_RESULT = {
  code: '123456',
  companyNumber: '551633334444',
  expiresAt: CODE_EXPIRES_AT,
}

describe('validação do corpo do GET /me/whatsapp-phone (spec 144 T017)', () => {
  test('lê o estado sem vínculo', () => {
    const state = toWhatsAppPhoneState({ status: 'none' })
    expect(state).toEqual({
      expiresAt: undefined,
      pendingRequest: undefined,
      phone: undefined,
      status: 'none',
      verifiedAt: undefined,
    })
  })

  test('lê o pedido pendente sem o código', () => {
    const state = toWhatsAppPhoneState({
      pendingRequest: { expiresAt: CODE_EXPIRES_AT },
      status: 'pending',
    })
    expect(state.pendingRequest).toEqual({ expiresAt: CODE_EXPIRES_AT })
    expect(JSON.stringify(state)).not.toContain('code')
  })

  test('lê o vínculo verificado, com o número mascarado', () => {
    const state = toWhatsAppPhoneState({
      expiresAt: EXPIRES_AT,
      phone: '****1234',
      status: 'verified',
      verifiedAt: VERIFIED_AT,
    })
    expect(state).toEqual({
      expiresAt: EXPIRES_AT,
      pendingRequest: undefined,
      phone: '****1234',
      status: 'verified',
      verifiedAt: VERIFIED_AT,
    })
  })

  test('status desconhecido é resposta inválida, nunca um quinto estado inventado', () => {
    expect(() => toWhatsAppPhoneState({ status: 'linked' })).toThrow(
      WHATSAPP_PHONE_ERROR.RESPONSE_INVALID,
    )
    expect(() => toWhatsAppPhoneState('não é objeto')).toThrow(
      WHATSAPP_PHONE_ERROR.RESPONSE_INVALID,
    )
  })
})

describe('validação do corpo do POST /me/whatsapp-phone/verification', () => {
  test('lê código, número da empresa e vencimento', () => {
    expect(toWhatsAppPhoneVerification(CODE_RESULT)).toEqual(CODE_RESULT)
  })

  test('corpo incompleto é resposta inválida', () => {
    expect(() => toWhatsAppPhoneVerification({ code: '123456' })).toThrow(
      WHATSAPP_PHONE_ERROR.RESPONSE_INVALID,
    )
  })
})

describe('estados do view-model do painel de WhatsApp (spec 144 T017)', () => {
  test('sem vínculo: nenhum código, nenhum estado do servidor ainda', () => {
    const viewModel = resolveWhatsAppPhoneViewModel({
      generatedCode: undefined,
      isChannelMissing: false,
      isLoading: false,
      state: {
        expiresAt: undefined,
        pendingRequest: undefined,
        phone: undefined,
        status: 'none',
        verifiedAt: undefined,
      },
    })
    expect(viewModel).toEqual({ kind: 'none' })
  })

  test('código gerado vence sobre qualquer status do servidor', () => {
    const viewModel = resolveWhatsAppPhoneViewModel({
      generatedCode: CODE_RESULT,
      isChannelMissing: false,
      isLoading: false,
      state: {
        expiresAt: undefined,
        pendingRequest: undefined,
        phone: undefined,
        status: 'none',
        verifiedAt: undefined,
      },
    })
    expect(viewModel).toEqual({ ...CODE_RESULT, kind: 'codeGenerated' })
  })

  test('vinculado: número mascarado e validade de 90 dias', () => {
    const viewModel = resolveWhatsAppPhoneViewModel({
      generatedCode: undefined,
      isChannelMissing: false,
      isLoading: false,
      state: {
        expiresAt: EXPIRES_AT,
        pendingRequest: undefined,
        phone: '****1234',
        status: 'verified',
        verifiedAt: VERIFIED_AT,
      },
    })
    expect(viewModel).toEqual({
      expiresAt: EXPIRES_AT,
      kind: 'linked',
      phone: '****1234',
      verifiedAt: VERIFIED_AT,
    })
  })

  test('vencido: o vínculo passou dos 90 dias', () => {
    const viewModel = resolveWhatsAppPhoneViewModel({
      generatedCode: undefined,
      isChannelMissing: false,
      isLoading: false,
      state: {
        expiresAt: '2026-01-01T00:00:00.000Z',
        pendingRequest: undefined,
        phone: '****1234',
        status: 'expired',
        verifiedAt: '2025-10-01T00:00:00.000Z',
      },
    })
    expect(viewModel).toEqual({
      kind: 'expired',
      phone: '****1234',
      verifiedAt: '2025-10-01T00:00:00.000Z',
    })
  })

  test('canal sem número: a empresa não configurou o WhatsApp', () => {
    const viewModel = resolveWhatsAppPhoneViewModel({
      generatedCode: undefined,
      isChannelMissing: true,
      isLoading: false,
      state: {
        expiresAt: undefined,
        pendingRequest: undefined,
        phone: undefined,
        status: 'none',
        verifiedAt: undefined,
      },
    })
    expect(viewModel).toEqual({ kind: 'channelMissing' })
  })

  test('carregando vence tudo, inclusive código gerado de uma tela anterior', () => {
    const viewModel = resolveWhatsAppPhoneViewModel({
      generatedCode: CODE_RESULT,
      isChannelMissing: false,
      isLoading: true,
      state: undefined,
    })
    expect(viewModel).toEqual({ kind: 'loading' })
  })
})
