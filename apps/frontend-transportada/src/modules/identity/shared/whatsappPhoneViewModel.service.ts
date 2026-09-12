/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { WhatsAppPhoneState, WhatsAppPhoneVerification } from './whatsappPhone.types'

export type WhatsAppPhoneViewModel =
  | Readonly<{ kind: 'channelMissing' }>
  | Readonly<{
      code: string
      companyNumber: string
      expiresAt: string
      kind: 'codeGenerated'
    }>
  | Readonly<{ kind: 'expired'; phone: string | undefined; verifiedAt: string | undefined }>
  | Readonly<{
      expiresAt: string | undefined
      kind: 'linked'
      phone: string | undefined
      verifiedAt: string | undefined
    }>
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'none' }>

export type ResolveWhatsAppPhoneViewModelInput = Readonly<{
  /** O código só existe em memória, entre o `POST` e a expiração — o `GET` nunca o devolve. */
  generatedCode: WhatsAppPhoneVerification | undefined
  /** A última tentativa de gerar código recusou por `WHATSAPP_CHANNEL_NUMBER_MISSING`. */
  isChannelMissing: boolean
  isLoading: boolean
  state: WhatsAppPhoneState | undefined
}>

/**
 * Spec 144 T017. O código gerado tem prioridade sobre qualquer status do servidor: gerar um novo
 * substitui o pedido anterior (a API fecha o antigo), então mostrar o código que acabou de sair da
 * tela é sempre a verdade mais recente, mesmo que o `GET` ainda não tenha sido refeito.
 */
export function resolveWhatsAppPhoneViewModel(
  input: ResolveWhatsAppPhoneViewModelInput,
): WhatsAppPhoneViewModel {
  if (input.isLoading) return { kind: 'loading' }

  if (input.generatedCode !== undefined) {
    return {
      code: input.generatedCode.code,
      companyNumber: input.generatedCode.companyNumber,
      expiresAt: input.generatedCode.expiresAt,
      kind: 'codeGenerated',
    }
  }

  if (input.state?.status === 'verified') {
    return {
      expiresAt: input.state.expiresAt,
      kind: 'linked',
      phone: input.state.phone,
      verifiedAt: input.state.verifiedAt,
    }
  }

  if (input.state?.status === 'expired') {
    return { kind: 'expired', phone: input.state.phone, verifiedAt: input.state.verifiedAt }
  }

  if (input.isChannelMissing) return { kind: 'channelMissing' }

  return { kind: 'none' }
}
