/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (E13): o escritório manda o comprovante da transferência ao WhatsApp do motorista pelo Evolution da empresa
 * (o mesmo trilho do boleto do cliente). O arquivo é o que já foi registrado na ocorrência; o número é o WhatsApp
 * **verificado** do motorista da viagem. Nada daqui vai a log além de ids e do motivo fechado da falha.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  ContractorReplyWhatsAppSendError,
  type ContractorReplyWhatsAppSenderPort,
} from '../../occurrence-conversation/application/forward-contractor-reply-by-whatsapp.port.js'
import type { ApiLogger } from '../../shared/api.types.js'
import {
  DriverPayoutReceiptMissingError,
  DriverPayoutReceiptWhatsAppFailedError,
  DriverPayoutReceiptWhatsAppPhoneMissingError,
} from '../domain/receiving-charge.error.js'
import { TripOccurrenceNotFoundError } from '../domain/trip.error.js'

/** O teto do WhatsApp para documento: acima disso o Evolution recusa. */
const WHATSAPP_DOCUMENT_MAX_BYTES = 25 * 1024 * 1024

const WHATSAPP_CAPTION = 'Comprovante da transferência (PIX) da cobrança no recebimento.'

export type DriverPayoutReceiptWhatsAppTarget = {
  /** O WhatsApp verificado do motorista da viagem; `null` sem vínculo ativo ou sem número verificado. */
  readonly driverWhatsappPhone: null | string
  readonly receipt: null | {
    readonly bucket: string
    readonly fileName: string
    readonly mimeType: string
    readonly objectKey: string
    readonly sizeBytes: number
  }
}

export type DriverPayoutReceiptWhatsAppReaderPort = {
  findTarget(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<DriverPayoutReceiptWhatsAppTarget | null>
}

export type SendDriverPayoutReceiptByWhatsAppUseCase = {
  readonly execute: (input: {
    readonly context: CompanyContext
    readonly occurrenceId: string
  }) => Promise<{ readonly sentAt: string }>
}

export function createSendDriverPayoutReceiptByWhatsAppUseCase(dependencies: {
  readonly logger: ApiLogger
  readonly now?: () => Date
  readonly readBytes: (location: {
    readonly bucket: string
    readonly key: string
  }) => Promise<Uint8Array>
  readonly reader: DriverPayoutReceiptWhatsAppReaderPort
  readonly sender: Pick<ContractorReplyWhatsAppSenderPort, 'sendDocument'>
}): SendDriverPayoutReceiptByWhatsAppUseCase {
  const now = dependencies.now ?? (() => new Date())
  return {
    async execute(input) {
      const { companyId } = input.context
      const target = await dependencies.reader.findTarget({
        companyId,
        occurrenceId: input.occurrenceId,
      })
      if (target === null) throw new TripOccurrenceNotFoundError()
      if (target.receipt === null) throw new DriverPayoutReceiptMissingError()
      if (target.driverWhatsappPhone === null) {
        throw new DriverPayoutReceiptWhatsAppPhoneMissingError()
      }
      if (target.receipt.sizeBytes > WHATSAPP_DOCUMENT_MAX_BYTES) {
        throw new DriverPayoutReceiptWhatsAppFailedError('attachment_too_large')
      }
      const bytes = await dependencies.readBytes({
        bucket: target.receipt.bucket,
        key: target.receipt.objectKey,
      })
      try {
        await dependencies.sender.sendDocument({
          bytes,
          caption: WHATSAPP_CAPTION,
          companyId,
          fileName: target.receipt.fileName,
          mimeType: target.receipt.mimeType,
          number: target.driverWhatsappPhone.replace(/\D/gu, ''),
        })
      } catch (error) {
        const reason = error instanceof ContractorReplyWhatsAppSendError ? error.failure : 'failed'
        dependencies.logger.warn('occurrence.driver-payout-receipt.whatsapp_failed', {
          occurrenceId: input.occurrenceId,
          reason,
        })
        throw new DriverPayoutReceiptWhatsAppFailedError(reason)
      }
      dependencies.logger.info('occurrence.driver-payout-receipt.whatsapp_sent', {
        actorUserId: input.context.userId,
        occurrenceId: input.occurrenceId,
      })
      return { sentAt: now().toISOString() }
    },
  }
}
