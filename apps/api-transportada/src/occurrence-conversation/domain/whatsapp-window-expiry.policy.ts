/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** A janela de atendimento da Meta: texto livre só até 24 h depois da última mensagem recebida. */
export const WHATSAPP_WINDOW_MS = 24 * 3_600_000

/** A última hora da janela é "fechando" (RF20): a caixa de envio avisa e oferece a troca. */
export const WHATSAPP_WINDOW_CLOSING_MS = 3_600_000

export type WhatsAppWindowState = 'closed' | 'closing' | 'none' | 'open'

/** Para onde a conversa vai quando o WhatsApp fecha. `template` é "só modelo aprovado". */
export type WhatsAppWindowNextChannel = 'app' | 'email' | 'portal' | 'template'

export type WhatsAppWindowExpiryInput = {
  /** Só conta para a contratante: portal exige usuário ativo **e** a ocorrência visível lá (D9). */
  readonly contractor: { readonly hasEmail: boolean; readonly hasPortalAccess: boolean }
  readonly lastInboundWhatsAppAt: Date | null
  readonly lastOutboundWhatsAppAt: Date | null
  readonly now: Date
  /** O início da janela cujo aviso já saiu (`window_expiry_notice_sent_for`). */
  readonly noticeSentFor: Date | null
  readonly participant: 'contractor' | 'driver'
  readonly settings: {
    readonly noticeMinutes: number
    readonly notifyContractor: boolean
    readonly notifyDriver: boolean
  }
}

export type WhatsAppWindowExpiryDecision = {
  readonly closesAt: Date | null
  readonly nextChannel: WhatsAppWindowNextChannel
  /** `null` quando o aviso não se aplica a esta janela (sem janela, desligado, sem fala nossa). */
  readonly notice: {
    readonly due: boolean
    readonly dueAt: Date
    readonly windowStartedAt: Date
  } | null
  readonly state: WhatsAppWindowState
  readonly switchDefaultChannel: boolean
}

/**
 * Spec 183 T605 (RF20): o estado da janela do WhatsApp de uma conversa, se o aviso automático é
 * devido agora e para onde a conversa vai quando ela fecha.
 *
 * - A janela começa na última mensagem **recebida** pelo WhatsApp. A resposta que chega antes do
 *   aviso reabre a janela, e o aviso passa a valer para o fim da nova — é assim que ela "cancela".
 * - A chave idempotente do aviso é o início da janela: com `noticeSentFor` igual a ele, não repete.
 * - "Houve mensagem pelo WhatsApp naquela janela" é a **operação** ter falado por lá depois da
 *   abertura: a recebida que abre a janela sempre existe, e contratante que só recebeu e-mail nosso
 *   não precisa saber que um WhatsApp fecha.
 * - Fechada a janela, o aviso não sai (texto livre fora dela a Meta recusa) e o canal padrão troca.
 */
export function decideWhatsAppWindowExpiry(
  input: WhatsAppWindowExpiryInput,
): WhatsAppWindowExpiryDecision {
  const nextChannel = resolveNextChannel(input)
  const startedAt = input.lastInboundWhatsAppAt
  if (startedAt === null) {
    return { closesAt: null, nextChannel, notice: null, state: 'none', switchDefaultChannel: false }
  }

  const closesAt = new Date(startedAt.getTime() + WHATSAPP_WINDOW_MS)
  const remaining = closesAt.getTime() - input.now.getTime()
  const state: WhatsAppWindowState =
    remaining <= 0 ? 'closed' : remaining < WHATSAPP_WINDOW_CLOSING_MS ? 'closing' : 'open'

  return {
    closesAt,
    nextChannel,
    notice: decideNotice({ closesAt, input, startedAt, state }),
    state,
    switchDefaultChannel: state === 'closed',
  }
}

function decideNotice(context: {
  readonly closesAt: Date
  readonly input: WhatsAppWindowExpiryInput
  readonly startedAt: Date
  readonly state: WhatsAppWindowState
}): WhatsAppWindowExpiryDecision['notice'] {
  const { closesAt, input, startedAt, state } = context
  const enabled =
    input.participant === 'driver' ? input.settings.notifyDriver : input.settings.notifyContractor
  const spokeInWindow =
    input.lastOutboundWhatsAppAt !== null &&
    input.lastOutboundWhatsAppAt.getTime() >= startedAt.getTime()
  if (!enabled || !spokeInWindow) return null

  const dueAt = new Date(closesAt.getTime() - input.settings.noticeMinutes * 60_000)
  const alreadySent = input.noticeSentFor?.getTime() === startedAt.getTime()
  const due = state !== 'closed' && !alreadySent && input.now.getTime() >= dueAt.getTime()
  return { due, dueAt, windowStartedAt: startedAt }
}

function resolveNextChannel(input: WhatsAppWindowExpiryInput): WhatsAppWindowNextChannel {
  if (input.participant === 'driver') return 'app'
  if (input.contractor.hasPortalAccess) return 'portal'
  return input.contractor.hasEmail ? 'email' : 'template'
}
