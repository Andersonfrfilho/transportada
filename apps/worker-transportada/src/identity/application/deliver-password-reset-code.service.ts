/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { PasswordResetDeliveryEnvelopeV1 } from '../../messaging/password-reset-delivery-envelope.schema.js'

export type PasswordResetContactChannel = 'email' | 'sms' | 'whatsapp'

export type PasswordResetDeliveryRecord = {
  readonly companyId: string
  readonly contactAddress: string
  readonly contactChannel: PasswordResetContactChannel
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

export type PasswordResetDeliveryDependencies = {
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
      readonly channel: PasswordResetContactChannel
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
      readonly requestId: string
    }) => Promise<string>
  }
  readonly logger: {
    readonly error: (message: string, meta?: Readonly<Record<string, unknown>>) => void
    readonly info: (message: string, meta?: Readonly<Record<string, unknown>>) => void
  }
  readonly resets: {
    readonly findForDelivery: (input: {
      readonly companyId: string
      readonly requestId: string
    }) => Promise<PasswordResetDeliveryRecord | undefined>
    readonly markDelivered: (input: {
      readonly companyId: string
      readonly deliveredAt: Date
      readonly requestId: string
    }) => Promise<void>
  }
}

const DELIVERY_SUBJECT = 'Seu código de recuperação de senha'
const PASSWORD_RESET_EMAIL_TEXT = {
  intro: 'Use o código abaixo para definir uma nova senha de acesso.',
  note: 'O código é de uso único e expira em 15 minutos. Se não foi você que pediu, ignore este e-mail.',
} as const

/**
 * Falha de entrega **não** invalida o código: o pedido segue válido e o transporte é que falhou. O
 * erro sobe para o consumidor rejeitar a mensagem e o trilho de retry cuidar do resto.
 *
 * Nada de código ou endereço em log, em nenhum nível: só identificadores opacos (`security.md` §1).
 */
export async function handlePasswordResetDelivery(
  message: PasswordResetDeliveryEnvelopeV1,
  dependencies: PasswordResetDeliveryDependencies,
): Promise<void> {
  const { channels, envelopeProvider, logger, resets } = dependencies
  const reset = await resets.findForDelivery({
    companyId: message.companyId,
    requestId: message.payload.requestId,
  })

  if (reset === undefined) {
    logger.info('password reset delivery skipped: request not found', {
      requestId: message.payload.requestId,
    })
    return
  }

  const code = await envelopeProvider.decrypt({
    companyId: reset.companyId,
    envelope: reset.sealedCode,
    requestId: reset.id,
  })

  try {
    await channels.send({
      address: reset.contactAddress,
      code,
      companyId: reset.companyId,
      body: buildPasswordResetMessageBody(code),
      channel: reset.contactChannel,
      recipient: {
        name: reset.recipientName,
        pictureToken: reset.recipientPictureToken,
      },
      email: PASSWORD_RESET_EMAIL_TEXT,
      subject: DELIVERY_SUBJECT,
    })
  } catch (error) {
    logger.error('password reset delivery failed', {
      channel: reset.contactChannel,
      requestId: reset.id,
    })
    throw error
  }

  await resets.markDelivered({
    companyId: reset.companyId,
    deliveredAt: new Date(),
    requestId: reset.id,
  })

  logger.info('password reset delivered', {
    channel: reset.contactChannel,
    requestId: reset.id,
  })
}

function buildPasswordResetMessageBody(code: string): string {
  return `Seu código de recuperação de senha é ${code}. Ele é de uso único e expira em 15 minutos.`
}
