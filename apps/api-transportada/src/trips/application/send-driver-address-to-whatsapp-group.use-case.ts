/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 343 (T6a): o escritório manda o endereço correto da entrega ao motorista no grupo de WhatsApp dele (spec 292),
 * pelo Evolution da empresa. O grupo é o da ficha do motorista da viagem da ocorrência; o texto é montado aqui, nunca
 * recebido pronto. Nada vai a log além de ids e do motivo fechado da falha.
 */
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import { ContractorReplyWhatsAppSendError } from '../../occurrence-conversation/application/forward-contractor-reply-by-whatsapp.port.js'
import type { ApiLogger } from '../../shared/api.types.js'
import { withGroupMention } from '../../whatsapp/application/whatsapp-group-mention.service.js'
import {
  DriverAddressWhatsAppFailedError,
  DriverAddressWhatsAppGroupMissingError,
} from '../domain/driver-address-message.error.js'
import { TripOccurrenceNotFoundError } from '../domain/trip.error.js'

const DRIVER_ADDRESS_PIN_NAME = 'Endereço correto da entrega'

export type DriverAddressGroupTarget = {
  /** O telefone do cadastro do motorista, só para marcá-lo no grupo; `null` sem número. */
  readonly driverPhone: null | string
  /** O grupo da ficha do motorista da viagem; `null` sem vínculo. */
  readonly groupJid: null | string
}

export type DriverAddressGroupReaderPort = {
  findTarget(input: {
    readonly companyId: string
    readonly occurrenceId: string
    readonly occurrenceKind: 'document' | 'stop'
  }): Promise<DriverAddressGroupTarget | null>
}

export type DriverAddressTextSender = {
  sendText(input: {
    readonly body: string
    readonly companyId: string
    readonly mentionNumber?: string
    readonly number: string
  }): Promise<unknown>
}

export type DriverAddressLocationSender = {
  sendLocation(input: {
    readonly address: string
    readonly companyId: string
    readonly latitude: number
    readonly longitude: number
    readonly name: string
    readonly number: string
  }): Promise<unknown>
}

export type DriverAddressPoint = { readonly latitude: number; readonly longitude: number }

export type SendDriverAddressToWhatsAppGroupUseCase = {
  readonly execute: (input: {
    readonly addressText: string
    readonly context: CompanyContext
    readonly occurrenceId: string
    readonly occurrenceKind: 'document' | 'stop'
    readonly point?: DriverAddressPoint | undefined
  }) => Promise<{ readonly pinSent: boolean; readonly sentAt: string }>
}

/** O texto que o motorista lê: o endereço e o link do mapa (ponto, senão a busca pelo texto). */
export function buildDriverAddressMessage(input: {
  readonly addressText: string
  readonly point?: DriverAddressPoint | undefined
}): string {
  const query =
    input.point === undefined
      ? encodeURIComponent(input.addressText)
      : `${input.point.latitude},${input.point.longitude}`
  return [
    '📍 Endereço correto da entrega:',
    input.addressText,
    '',
    `Abrir no mapa: https://maps.google.com/?q=${query}`,
  ].join('\n')
}

export function createSendDriverAddressToWhatsAppGroupUseCase(dependencies: {
  readonly logger: ApiLogger
  readonly now?: () => Date
  readonly reader: DriverAddressGroupReaderPort
  readonly sender: DriverAddressLocationSender & DriverAddressTextSender
}): SendDriverAddressToWhatsAppGroupUseCase {
  const now = dependencies.now ?? (() => new Date())
  return {
    async execute(input) {
      const { companyId } = input.context
      const target = await dependencies.reader.findTarget({
        companyId,
        occurrenceId: input.occurrenceId,
        occurrenceKind: input.occurrenceKind,
      })
      if (target === null) throw new TripOccurrenceNotFoundError()
      if (target.groupJid === null) throw new DriverAddressWhatsAppGroupMissingError()
      const mention = withGroupMention({
        body: buildDriverAddressMessage({ addressText: input.addressText, point: input.point }),
        mentionNumber: target.driverPhone?.replace(/\D/gu, ''),
      })
      try {
        await dependencies.sender.sendText({
          body: mention.body,
          companyId,
          ...(mention.mentionNumber === undefined ? {} : { mentionNumber: mention.mentionNumber }),
          number: target.groupJid,
        })
      } catch (error) {
        const reason = error instanceof ContractorReplyWhatsAppSendError ? error.failure : 'failed'
        dependencies.logger.warn('occurrence.driver-address.whatsapp_group_failed', {
          occurrenceId: input.occurrenceId,
          reason,
        })
        throw new DriverAddressWhatsAppFailedError(
          reason === 'disconnected' || reason === 'number_not_found' ? reason : 'failed',
        )
      }
      /** O pino é um complemento: o texto já chegou, então falhar nele não desfaz o envio. */
      let pinSent = false
      if (input.point !== undefined) {
        try {
          await dependencies.sender.sendLocation({
            address: input.addressText,
            companyId,
            latitude: input.point.latitude,
            longitude: input.point.longitude,
            name: DRIVER_ADDRESS_PIN_NAME,
            number: target.groupJid,
          })
          pinSent = true
        } catch (error) {
          dependencies.logger.warn('occurrence.driver-address.whatsapp_pin_failed', {
            occurrenceId: input.occurrenceId,
            reason: error instanceof ContractorReplyWhatsAppSendError ? error.failure : 'failed',
          })
        }
      }
      dependencies.logger.info('occurrence.driver-address.whatsapp_group_sent', {
        actorUserId: input.context.userId,
        occurrenceId: input.occurrenceId,
        pinSent,
      })
      return { pinSent, sentAt: now().toISOString() }
    },
  }
}
