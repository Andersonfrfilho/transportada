/* Copyright (c) 2026 Ada Technology. MIT License. */
import { WHATSAPP_PHONE_POLL_INTERVAL_MS } from './whatsappPhone.constant'
import type {
  WhatsAppPhoneState,
  WhatsAppPhoneStatus,
  WhatsAppPhoneVerification,
} from './whatsappPhone.types'

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
  /** T020 (B6): há código à espera no servidor, mas não nesta tela — o `GET` nunca o devolve. */
  | Readonly<{ expiresAt: string | undefined; kind: 'pending' }>

export type ResolveWhatsAppPhoneViewModelInput = Readonly<{
  /** O código só existe em memória, entre o `POST` e a expiração — o `GET` nunca o devolve. */
  generatedCode: WhatsAppPhoneVerification | undefined
  /** A última tentativa de gerar código recusou por `WHATSAPP_CHANNEL_NUMBER_MISSING`. */
  isChannelMissing: boolean
  isLoading: boolean
  state: WhatsAppPhoneState | undefined
}>

/**
 * Spec 144 T017. O código gerado tem prioridade sobre o status do servidor: gerar um novo substitui
 * o pedido anterior (a API fecha o antigo), então o código que acabou de sair é a verdade mais
 * recente enquanto o `GET` não é refeito.
 *
 * T020 (B6): **menos** sobre `verified`. Código só se gera sem vínculo, então `verified` com código na
 * tela é a verificação que acabou de acontecer no WhatsApp — e a tela tem de sair do código.
 */
export function resolveWhatsAppPhoneViewModel(
  input: ResolveWhatsAppPhoneViewModelInput,
): WhatsAppPhoneViewModel {
  if (input.isLoading) return { kind: 'loading' }

  if (input.state?.status === 'verified') {
    return {
      expiresAt: input.state.expiresAt,
      kind: 'linked',
      phone: input.state.phone,
      verifiedAt: input.state.verifiedAt,
    }
  }

  if (input.generatedCode !== undefined) {
    return {
      code: input.generatedCode.code,
      companyNumber: input.generatedCode.companyNumber,
      expiresAt: input.generatedCode.expiresAt,
      kind: 'codeGenerated',
    }
  }

  if (input.state?.status === 'expired') {
    return { kind: 'expired', phone: input.state.phone, verifiedAt: input.state.verifiedAt }
  }

  if (input.isChannelMissing) return { kind: 'channelMissing' }

  if (input.state?.status === 'pending') {
    return { expiresAt: input.state.pendingRequest?.expiresAt, kind: 'pending' }
  }

  return { kind: 'none' }
}

/** T020 (B6): relê o `GET` enquanto há código à espera; o número verificado encerra a espera. */
export function resolveWhatsAppPhoneRefetchInterval(input: {
  readonly hasGeneratedCode: boolean
  readonly status: WhatsAppPhoneStatus | undefined
}): number | false {
  if (input.status === 'verified') return false
  const isAwaiting = input.status === 'pending' || input.hasGeneratedCode
  return isAwaiting ? WHATSAPP_PHONE_POLL_INTERVAL_MS : false
}

/**
 * T020 (B6): o fim da contagem só descartava o código, e a tela caía no cache antigo. Descartar e
 * reler faz o servidor dizer o que aconteceu enquanto o código estava na tela.
 */
export function buildWhatsAppCodeExpiryHandler(input: {
  readonly invalidate: () => void
  readonly reset: () => void
}): () => void {
  return () => {
    input.reset()
    input.invalidate()
  }
}
