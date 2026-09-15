/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MailTemplateContent } from '../../contractor-mail/domain/mail-template-catalog.constant.js'
import type { ProviderMatchLevel } from '../../database/address-comparison.schema.js'
import type { AddressFields } from '../application/address-correction.port.js'

export type AddressCorrectionMailReason = {
  readonly matchLevel: ProviderMatchLevel
  /** `null` é "endereço não localizado" — sem coordenada útil para medir distância (RF11). */
  readonly distanceMetres: number | null
}

export type AddressCorrectionMailItem = {
  /** `null` quando a nota não trouxe destinatário: o bloco abre pelo endereço, sem nome (T303). */
  readonly recipientName: string | null
  readonly reported: AddressFields
  readonly proposed: AddressFields
  readonly reason: AddressCorrectionMailReason
}

export type BuildAddressCorrectionMailParams = {
  readonly contractorName: string
  readonly carrierName: string
  readonly operatorName: string
  readonly items: readonly AddressCorrectionMailItem[]
  /** Spec 150 T402: o texto vem do modelo; o layout (`email-template.html`) segue fixo. */
  readonly template: MailTemplateContent
}

export type BuildAddressCorrectionMailResult = {
  readonly subject: string
  readonly html: string
  readonly text: string
}
