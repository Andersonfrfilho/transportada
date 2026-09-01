/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { InvitationDeliveryEnvelopeV1 } from '../../messaging/invitation-delivery-envelope.schema.js'

export type InvitationContactChannel = 'email' | 'sms' | 'whatsapp'

export type InvitationDeliveryRecord = {
  readonly companyId: string
  readonly contactAddress: string
  readonly contactChannel: InvitationContactChannel
  readonly id: string
  /** Nome de quem recebe, para o cabeçalho do e-mail. */
  readonly recipientName: string
  /**
   * Endereço público da foto de perfil, quando existe — o link é opaco e girado a cada troca de
   * imagem. Ausente é o caso comum: ficha sem retrato, e o cabeçalho fica só com a inicial.
   */
  readonly recipientPictureToken?: string
  readonly sealedCode: unknown
  readonly userId: string
}

export type InvitationDeliveryDependencies = {
  readonly channels: {
    readonly send: (input: {
      readonly address: string
      readonly body: string
      /**
       * O código sozinho, para o canal que envia por **template aprovado** — a Meta só aceita
       * mensagem livre dentro da janela de 24 h, e quem recebe um convite nunca escreveu antes.
       * O e-mail ignora este campo: lá o corpo inteiro é a mensagem.
       */
      readonly code: string
      readonly companyId: string
      readonly channel: InvitationContactChannel
      /** O texto em volta do código no e-mail; o WhatsApp continua mandando `body` em uma linha. */
      readonly email?: { readonly intro: string; readonly note: string }
      /** Quem recebe: o e-mail se dirige a uma pessoa, e é ela que aparece na identidade. */
      readonly recipient?: { readonly name: string; readonly pictureToken: string | undefined }
      readonly subject: string
    }) => Promise<void>
  }
  readonly envelopeProvider: {
    readonly decrypt: (input: {
      readonly companyId: string
      readonly envelope: unknown
      readonly userId: string
    }) => Promise<string>
  }
  readonly invitations: {
    readonly findForDelivery: (input: {
      readonly companyId: string
      readonly invitationId: string
    }) => Promise<InvitationDeliveryRecord | undefined>
    readonly markDelivered: (input: {
      readonly companyId: string
      readonly deliveredAt: Date
      readonly invitationId: string
    }) => Promise<void>
  }
  readonly logger: {
    readonly error: (message: string, meta?: Readonly<Record<string, unknown>>) => void
    readonly info: (message: string, meta?: Readonly<Record<string, unknown>>) => void
  }
}

const DELIVERY_SUBJECT = 'Seu código de ativação'
const INVITATION_EMAIL_TEXT = {
  intro: 'Use o código abaixo para ativar seu acesso e definir sua senha.',
  note: 'O código é de uso único. Se não reconhece este convite, ignore este e-mail.',
} as const

/**
 * Falha de entrega **não** invalida o código: o convite segue válido e reenviável, porque quem
 * falhou foi o transporte e não a regra. O erro sobe para o consumidor rejeitar a mensagem e o
 * trilho de retry cuidar do resto.
 *
 * Nada de código ou endereço em log, em nenhum nível: só identificadores opacos (`security.md` §1).
 */
export async function handleInvitationDelivery(
  message: InvitationDeliveryEnvelopeV1,
  dependencies: InvitationDeliveryDependencies,
): Promise<void> {
  const { channels, envelopeProvider, invitations, logger } = dependencies
  const invitation = await invitations.findForDelivery({
    companyId: message.companyId,
    invitationId: message.payload.invitationId,
  })

  if (invitation === undefined) {
    logger.info('invitation delivery skipped: invitation not found', {
      invitationId: message.payload.invitationId,
    })
    return
  }

  const code = await envelopeProvider.decrypt({
    companyId: invitation.companyId,
    envelope: invitation.sealedCode,
    userId: invitation.userId,
  })

  try {
    await channels.send({
      address: invitation.contactAddress,
      code,
      companyId: invitation.companyId,
      body: buildInvitationMessageBody(code),
      channel: invitation.contactChannel,
      recipient: {
        name: invitation.recipientName,
        pictureToken: invitation.recipientPictureToken,
      },
      email: INVITATION_EMAIL_TEXT,
      subject: DELIVERY_SUBJECT,
    })
  } catch (error) {
    logger.error('invitation delivery failed', {
      channel: invitation.contactChannel,
      invitationId: invitation.id,
    })
    throw error
  }

  await invitations.markDelivered({
    companyId: invitation.companyId,
    deliveredAt: new Date(),
    invitationId: invitation.id,
  })

  logger.info('invitation delivered', {
    channel: invitation.contactChannel,
    invitationId: invitation.id,
  })
}

function buildInvitationMessageBody(code: string): string {
  return `Seu código de ativação é ${code}. Ele é de uso único e expira em breve.`
}
