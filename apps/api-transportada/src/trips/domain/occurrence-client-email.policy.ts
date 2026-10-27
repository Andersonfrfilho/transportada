/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 RF9: o tipo da ocorrência diz se o botão "Enviar ao cliente" existe e qual tipo de e-mail do cliente ele usa.
 * `off` (padrão) esconde o botão em todas as telas e a API recusa o envio com `409`.
 */
import {
  CLIENT_EMAIL_TYPE_OFF,
  type ClientEmailType,
  type DeliveryClientEmailPurpose,
} from '../../shared/delivery-client-email.constant.js'
import { OccurrenceClientEmailOffError } from './occurrence-client-email.error.js'

/** O tipo de e-mail do cliente que o envio usa; recusa (`409`) quando o tipo da ocorrência está `off`. */
export function resolveClientEmailPurpose(
  clientEmailType: ClientEmailType,
): DeliveryClientEmailPurpose {
  if (clientEmailType === CLIENT_EMAIL_TYPE_OFF) throw new OccurrenceClientEmailOffError()
  return clientEmailType
}
