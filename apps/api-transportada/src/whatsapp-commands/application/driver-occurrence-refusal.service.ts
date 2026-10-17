/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (RF13, T2.6): o WhatsApp do motorista registra pela mesma `registerDriverOccurrence` do app,
 * mas **não colhe foto, assinatura nem produtos** — só a observação (nem número e valor pago, 247). Quando o tipo efetivo da nota exige
 * um desses campos, o servidor recusa com o erro estável do campo, e a conversa traduz a recusa na frase
 * que diz o que falta (a lista de tipos do canal não é filtrada por exigência: o erro é o aviso).
 */
import {
  OccurrenceItemQuantityAboveDocumentError,
  TripOccurrenceAttachmentRequiredError,
  TripOccurrenceDeclaredAmountRequiredError,
  TripOccurrenceItemsMinimumNotMetError,
  TripOccurrenceItemsRequiredError,
  TripOccurrenceNoteRequiredError,
  TripOccurrencePhotoMinimumNotMetError,
  TripOccurrenceReferenceNumberRequiredError,
  TripOccurrenceSignatureRequiredError,
} from '../../trips/domain/trip.error.js'
import { OccurrenceTypeNotAvailableForContractorError } from '../../trips/domain/occurrence-type-contractor-scope.error.js'
import { DRIVER_FLOW_NODE } from '../domain/whatsapp-driver-flow.constant.js'

export type DriverOccurrenceRefusal = {
  readonly message: string
  readonly next: string
}

const USE_THE_APP = 'Registre pelo aplicativo.'

/** Spec 270 (R3): a frase dos dois canais do WhatsApp quando o servidor recusa o tipo pela contratante. */
export const OCCURRENCE_TYPE_NOT_AVAILABLE_MESSAGE =
  'Este tipo não vale para a contratante desta nota. Escolha outro tipo.'

/** `undefined` quando o erro não é uma exigência de campo — quem chama segue o tratamento de sempre. */
export function describeOccurrenceRequirementRefusal(
  error: unknown,
): DriverOccurrenceRefusal | undefined {
  if (error instanceof TripOccurrenceNoteRequiredError) {
    return {
      message: 'Essa ocorrência exige a observação. Digite o que aconteceu.',
      next: DRIVER_FLOW_NODE.notePrompt,
    }
  }
  if (error instanceof TripOccurrenceSignatureRequiredError) {
    return {
      message: `Essa ocorrência exige a assinatura de quem recebeu, e o WhatsApp não envia assinatura. ${USE_THE_APP}`,
      next: DRIVER_FLOW_NODE.tripMenu,
    }
  }
  if (
    error instanceof TripOccurrenceAttachmentRequiredError ||
    error instanceof TripOccurrencePhotoMinimumNotMetError
  ) {
    return {
      message: `Essa ocorrência exige foto, e o WhatsApp não envia foto. ${USE_THE_APP}`,
      next: DRIVER_FLOW_NODE.tripMenu,
    }
  }
  if (
    error instanceof TripOccurrenceItemsRequiredError ||
    error instanceof TripOccurrenceItemsMinimumNotMetError
  ) {
    return {
      message: `Essa ocorrência exige apontar os produtos da nota, e o WhatsApp não aponta produtos. ${USE_THE_APP}`,
      next: DRIVER_FLOW_NODE.tripMenu,
    }
  }
  /** Spec 247 (T4.4): o WhatsApp não colhe número do documento, valor pago nem quantidade. */
  if (error instanceof TripOccurrenceReferenceNumberRequiredError) {
    return {
      message: `Essa ocorrência exige o número do documento do cliente, e o WhatsApp não o envia. ${USE_THE_APP}`,
      next: DRIVER_FLOW_NODE.tripMenu,
    }
  }
  if (
    error instanceof TripOccurrenceDeclaredAmountRequiredError ||
    error instanceof OccurrenceItemQuantityAboveDocumentError
  ) {
    return {
      message: `Essa ocorrência exige o valor pago e as quantidades, e o WhatsApp não os envia. ${USE_THE_APP}`,
      next: DRIVER_FLOW_NODE.tripMenu,
    }
  }
  /** Spec 270 (R3): volta à lista de tipos, nunca relança e nunca fica no passo da observação. */
  if (error instanceof OccurrenceTypeNotAvailableForContractorError) {
    return {
      message: OCCURRENCE_TYPE_NOT_AVAILABLE_MESSAGE,
      next: DRIVER_FLOW_NODE.listOccurrenceTypes,
    }
  }
  return undefined
}
