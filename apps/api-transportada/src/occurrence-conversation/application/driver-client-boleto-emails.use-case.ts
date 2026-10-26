/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T4 (RF2/RF3/RF11, D4/D5): o motorista lista os e-mails do cliente (mascarados, por `emailId`) e leva o
 * boleto da contratante a eles ou a um endereço novo, que só entra no cadastro com `save`. Só a ocorrência da
 * viagem em que ele está na tripulação é alcançada; o tipo da ocorrência manda (`client_email_type`, 409 quando
 * `off`) e o encaminhamento da 248 precisa estar ligado. O motorista só adiciona: editar e remover é do painel.
 * O envio é o `forwardToClient` do trilho da 248, com o mesmo teto por ocorrência.
 *
 * Spec 279 T4b (RF8): o cartão do e-mail que o motorista escreveu na conversa passa pela mesma régua (tripulação, tipo
 * ligado, encaminhamento ligado) antes de ler ou enviar.
 */
import { CLIENT_EMAIL_TYPE_OFF } from '../../shared/delivery-client-email.constant.js'
import { OccurrenceClientEmailOffError } from '../../trips/domain/occurrence-client-email.error.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'
import { ContractorReplyEmailForwardDisabledError } from '../domain/contractor-reply-email.error.js'
import type {
  DetectedClientEmailUseCase,
  PendingDetectedClientEmail,
} from './detected-client-email.use-case.js'
import type { DriverConversationUnitOfWorkPort } from './driver-conversation.port.js'
import type {
  ContractorReplyEmailOptions,
  ContractorReplyEmailReaderPort,
} from './forward-contractor-reply-by-email.port.js'
import type {
  ForwardContractorReplyByEmailUseCase,
  ForwardContractorReplyToClientOutcome,
} from './forward-contractor-reply-by-email.use-case.js'

export type DriverClientBoletoEmailsScope = {
  readonly companyId: string
  readonly driverId: string
  readonly driverUserId: string
  readonly occurrenceId: string
}

/**
 * Spec 279 T6b (RF12): o estado do envio ao cliente. O motorista vê o endereço por inteiro porque a conversa dele já o
 * mostra no aviso do sistema; a lista só traz o envio ao cliente, e nunca o motivo da recusa do provedor. `skipped`
 * (sem endereço) é o envio automático que não achou e-mail do cliente (T3c): a única entrega pulada que aparece.
 */
export type DriverClientBoletoEmailDelivery = {
  readonly address: null | string
  readonly id: string
  readonly sentAt: null | string
  readonly status: 'failed' | 'queued' | 'sent' | 'skipped'
}

export type DriverClientBoletoEmails = Pick<
  ContractorReplyEmailOptions,
  'clientEmailType' | 'clientEmails' | 'sentCount' | 'sentLimit'
> & { readonly deliveries: readonly DriverClientBoletoEmailDelivery[] }

const CLIENT_WITHOUT_EMAIL_REASON = 'client_without_email'
const DRIVER_VISIBLE_DELIVERY_STATUSES = ['failed', 'queued', 'sent'] as const

function toDriverDeliveries(
  options: ContractorReplyEmailOptions,
): readonly DriverClientBoletoEmailDelivery[] {
  return options.deliveries.flatMap((delivery): readonly DriverClientBoletoEmailDelivery[] => {
    if (delivery.target !== 'client_boleto_emails') return []
    if (delivery.address === null) {
      const isWithoutClientEmail =
        delivery.status === 'skipped' && delivery.reason === CLIENT_WITHOUT_EMAIL_REASON
      return isWithoutClientEmail
        ? [{ address: null, id: delivery.id, sentAt: null, status: 'skipped' as const }]
        : []
    }
    const status = DRIVER_VISIBLE_DELIVERY_STATUSES.find((known) => known === delivery.status)
    if (status === undefined) return []
    return [{ address: delivery.address, id: delivery.id, sentAt: delivery.sentAt, status }]
  })
}

export type SendDriverClientBoletoEmailsInput = DriverClientBoletoEmailsScope & {
  readonly correlationId: string
  readonly emailIds: readonly string[]
  readonly idempotencyKey: string
  readonly newAddress?: string
  readonly save: boolean
}

export type SendDriverDetectedClientEmailInput = DriverClientBoletoEmailsScope & {
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly messageId: string
  readonly save: boolean
}

export type DriverClientBoletoEmailsUseCase = Readonly<{
  /** Spec 279 T4b (RF8): o cartão "Enviar o boleto para a***@…?" do e-mail que ele escreveu na conversa. */
  detected: (input: DriverClientBoletoEmailsScope) => Promise<PendingDetectedClientEmail | null>
  list: (input: DriverClientBoletoEmailsScope) => Promise<DriverClientBoletoEmails>
  send: (input: SendDriverClientBoletoEmailsInput) => Promise<ForwardContractorReplyToClientOutcome>
  sendDetected: (
    input: SendDriverDetectedClientEmailInput,
  ) => Promise<ForwardContractorReplyToClientOutcome>
}>

export function createDriverClientBoletoEmailsUseCase(dependencies: {
  readonly detectedClientEmail: Pick<DetectedClientEmailUseCase, 'readPending' | 'send'>
  readonly emailOptions: ContractorReplyEmailReaderPort
  readonly forwardByEmail: Pick<ForwardContractorReplyByEmailUseCase, 'forwardToClient'>
  readonly unitOfWork: DriverConversationUnitOfWorkPort
}): DriverClientBoletoEmailsUseCase {
  /** A tripulação da viagem, o tipo ligado (RF9) e o encaminhamento ligado (D5); nada disso vaza o motivo da recusa. */
  async function readAllowedOptions(
    scope: DriverClientBoletoEmailsScope,
  ): Promise<ContractorReplyEmailOptions> {
    const { companyId, driverId, occurrenceId } = scope
    const occurrence = await dependencies.unitOfWork.execute((transaction) =>
      transaction.findMyOccurrence({ companyId, driverId, occurrenceId }),
    )
    if (occurrence === null) throw new TripOccurrenceNotFoundError()
    const options = await dependencies.emailOptions.read({ companyId, occurrenceId })
    if (options === null) throw new TripOccurrenceNotFoundError()
    if (options.clientEmailType === CLIENT_EMAIL_TYPE_OFF) throw new OccurrenceClientEmailOffError()
    if (options.forwardToInformedEmail === 'off' && options.forwardToNoteRecipient === 'off') {
      throw new ContractorReplyEmailForwardDisabledError()
    }
    return options
  }

  return {
    async detected(input) {
      await readAllowedOptions(input)
      return dependencies.detectedClientEmail.readPending({
        companyId: input.companyId,
        occurrenceId: input.occurrenceId,
      })
    },

    async list(input) {
      const options = await readAllowedOptions(input)
      return {
        clientEmailType: options.clientEmailType,
        clientEmails: options.clientEmails,
        deliveries: toDriverDeliveries(options),
        sentCount: options.sentCount,
        sentLimit: options.sentLimit,
      }
    },

    async send(input) {
      await readAllowedOptions(input)
      return dependencies.forwardByEmail.forwardToClient({
        actorUserId: input.driverUserId,
        ...(input.newAddress === undefined ? {} : { address: input.newAddress }),
        authorKind: 'driver',
        companyId: input.companyId,
        correlationId: input.correlationId,
        emailIds: input.emailIds,
        idempotencyKey: input.idempotencyKey,
        occurrenceId: input.occurrenceId,
        save: input.save,
      })
    },

    async sendDetected(input) {
      await readAllowedOptions(input)
      return dependencies.detectedClientEmail.send({
        actorUserId: input.driverUserId,
        authorKind: 'driver',
        companyId: input.companyId,
        correlationId: input.correlationId,
        idempotencyKey: input.idempotencyKey,
        messageId: input.messageId,
        occurrenceId: input.occurrenceId,
        save: input.save,
      })
    },
  }
}
