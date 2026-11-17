/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 317 (Etapa 2): as recusas da cobrança no recebimento — vagas de foto, nota, valor, quem pagou e o
 * comprovante do PIX ao concluir. Nenhuma mensagem leva valor, chave PIX ou id de objeto (dado de cliente).
 */
import { ApiError } from '../../shared/api.error.js'

/** RF3/CA1: falta a foto de uma vaga obrigatória. `slotKey` diz qual, para o app mostrar o que falta. */
export class StopOccurrencePhotoSlotMissingError extends ApiError {
  public constructor(slotKey: string) {
    super({
      code: 'STOP_OCCURRENCE_PHOTO_SLOT_MISSING',
      details: [{ field: `photos.${slotKey}`, message: 'Required by the occurrence type.' }],
      extraBody: { slotKey },
      message: 'This occurrence type requires a photo for every required slot.',
      status: 422,
    })
  }
}

/** Vaga que o tipo não tem, vaga repetida ou o mesmo upload em duas vagas. */
export class StopOccurrencePhotoSlotInvalidError extends ApiError {
  public constructor(
    field: string,
    reason: 'duplicate_object' | 'duplicate_slot' | 'unknown_slot',
  ) {
    super({
      code: 'STOP_OCCURRENCE_PHOTO_SLOT_INVALID',
      details: [{ field, message: reason }],
      message: 'The photo does not match a slot of this occurrence type.',
      status: 400,
    })
  }
}

/** E8/CA1: sem nota resolvível a cobrança não nasce — sem ela não há cliente nem contratante. */
export class StopOccurrenceDocumentRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'STOP_OCCURRENCE_DOCUMENT_REQUIRED',
      details: [
        { field: 'receivingCharge.documents', message: 'Required by the occurrence type.' },
      ],
      message: 'This occurrence type requires the invoice the charge refers to.',
      status: 422,
    })
  }
}

/** E4: a nota informada não é desta parada (ou já saiu da viagem). */
export class StopOccurrenceDocumentNotInStopError extends ApiError {
  public constructor(field: string) {
    super({
      code: 'STOP_OCCURRENCE_DOCUMENT_NOT_IN_STOP',
      details: [{ field, message: 'Not an invoice of this stop.' }],
      message: 'The invoice is not part of this stop.',
      status: 422,
    })
  }
}

/** E4: a linha agrupada é uma linha só — um cliente e uma contratante. */
export class StopOccurrenceChargeGroupMixedPartiesError extends ApiError {
  public constructor() {
    super({
      code: 'STOP_OCCURRENCE_CHARGE_GROUP_MIXED_PARTIES',
      details: [{ field: 'receivingCharge.documents', message: 'Different client or contractor.' }],
      message: 'A grouped charge covers invoices of one client and one contractor only.',
      status: 422,
    })
  }
}

/** E11: "Quem pagou?" é obrigatório na cobrança no recebimento. */
export class StopOccurrencePaidByRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'STOP_OCCURRENCE_PAID_BY_REQUIRED',
      details: [{ field: 'receivingCharge.paidBy', message: 'Required by the occurrence type.' }],
      message: 'This occurrence type requires who paid the charge.',
      status: 422,
    })
  }
}

/** E11: o motorista pagou, então o PIX dele é obrigatório. */
export class StopOccurrenceDriverPixRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'STOP_OCCURRENCE_DRIVER_PIX_REQUIRED',
      details: [{ field: 'receivingCharge.driverPix', message: 'Required when the driver paid.' }],
      message: 'The driver paid the charge, so the driver PIX key is required.',
      status: 422,
    })
  }
}

/** O corpo da cobrança veio para um tipo que não é a cobrança no recebimento. */
export class StopOccurrenceReceivingChargeNotAcceptedError extends ApiError {
  public constructor() {
    super({
      code: 'STOP_OCCURRENCE_RECEIVING_CHARGE_NOT_ACCEPTED',
      details: [{ field: 'receivingCharge', message: 'Not accepted by the occurrence type.' }],
      message: 'This occurrence type does not record a receiving charge.',
      status: 400,
    })
  }
}

/** E13: o comprovante do PIX só existe quando o motorista pagou. */
export class StopOccurrencePayoutNotApplicableError extends ApiError {
  public constructor() {
    super({
      code: 'STOP_OCCURRENCE_PAYOUT_NOT_APPLICABLE',
      details: [
        { field: 'driverPayoutReceiptAttachmentId', message: 'Only when the driver paid.' },
      ],
      message: 'The PIX receipt applies only to a receiving charge paid by the driver.',
      status: 422,
    })
  }
}

/** E13: o anexo não é uma mensagem enviada ao motorista na conversa desta ocorrência. */
export class StopOccurrencePayoutReceiptNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'STOP_OCCURRENCE_PAYOUT_RECEIPT_NOT_FOUND',
      details: [{ field: 'driverPayoutReceiptAttachmentId', message: 'Not found.' }],
      message: 'The PIX receipt was not sent to the driver in this occurrence conversation.',
      status: 404,
    })
  }
}

/** D1/RF7 (T7): o tipo da cobrança no recebimento não avisa a contratante. */
export class ReceivingChargeContractorMailNotAllowedError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_TYPE_RECEIVING_CHARGE_CONTRACTOR_MAIL_NOT_ALLOWED',
      details: [
        { field: 'emailsContractor', message: 'Not allowed for the receiving charge type.' },
      ],
      message: 'The receiving charge is not sent to the contractor.',
      status: 400,
    })
  }
}

/** E13: o escritório pediu o envio ao WhatsApp, mas ainda não há comprovante registrado nesta ocorrência. */
export class DriverPayoutReceiptMissingError extends ApiError {
  public constructor() {
    super({
      code: 'DRIVER_PAYOUT_RECEIPT_MISSING',
      message: 'There is no transfer receipt registered for this occurrence yet.',
      status: 409,
    })
  }
}

/** E13: o motorista da viagem não tem WhatsApp verificado no cadastro. */
export class DriverPayoutReceiptWhatsAppPhoneMissingError extends ApiError {
  public constructor() {
    super({
      code: 'DRIVER_WHATSAPP_PHONE_MISSING',
      message: 'The driver of this trip has no verified WhatsApp number.',
      status: 422,
    })
  }
}

/** E13: o Evolution não levou o comprovante; `reason` é o motivo fechado, nunca o número nem o arquivo. */
export class DriverPayoutReceiptWhatsAppFailedError extends ApiError {
  public constructor(
    reason: 'attachment_too_large' | 'disconnected' | 'failed' | 'number_not_found',
  ) {
    super({
      code: 'DRIVER_PAYOUT_RECEIPT_WHATSAPP_FAILED',
      extraBody: { reason },
      message: 'The transfer receipt could not be sent through WhatsApp.',
      status: reason === 'failed' ? 502 : 409,
    })
  }
}
