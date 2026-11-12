/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 (RF13, T2.6): o WhatsApp do motorista registra pela mesma `registerDriverOccurrence` do app,
 * mas **não colhe foto, assinatura nem produtos** — só a observação (nem número e valor pago, 247). Quando o tipo efetivo da nota exige
 * um desses campos, o servidor recusa com o erro estável do campo, e a conversa traduz a recusa na frase
 * que diz o que falta (a lista de tipos do canal não é filtrada por exigência: o erro é o aviso).
 *
 * Spec 293 T11: a classificação do erro e as frases moram na camada comum dos eventos
 * (`whatsapp-driver-events.service.ts` e `whatsapp-driver-event-speech.service.ts`); aqui fica só para
 * onde a conversa individual volta depois da recusa.
 */
import { DRIVER_FLOW_NODE } from '../domain/whatsapp-driver-flow.constant.js'
import { OCCURRENCE_REQUIREMENT_MESSAGES } from './whatsapp-driver-event-speech.service.js'
import {
  classifyWhatsAppDriverEventError,
  type OccurrenceRequirementField,
} from './whatsapp-driver-events.service.js'

export { OCCURRENCE_TYPE_NOT_AVAILABLE_MESSAGE } from './whatsapp-driver-event-speech.service.js'

export type DriverOccurrenceRefusal = {
  readonly message: string
  readonly next: string
}

type DriverFlowNode = (typeof DRIVER_FLOW_NODE)[keyof typeof DRIVER_FLOW_NODE]

/** Observação volta a pedir a observação; contratante volta à lista; o resto, ao menu da viagem. */
export function occurrenceRequirementNextNode(field: OccurrenceRequirementField): DriverFlowNode {
  if (field === 'note') return DRIVER_FLOW_NODE.notePrompt
  if (field === 'contractor_scope') return DRIVER_FLOW_NODE.listOccurrenceTypes
  return DRIVER_FLOW_NODE.tripMenu
}

/** `undefined` quando o erro não é uma exigência de campo — quem chama segue o tratamento de sempre. */
export function describeOccurrenceRequirementRefusal(
  error: unknown,
): DriverOccurrenceRefusal | undefined {
  const refusal = classifyWhatsAppDriverEventError(error)
  if (refusal?.code !== 'occurrence_requirement') return undefined
  return {
    message: OCCURRENCE_REQUIREMENT_MESSAGES[refusal.field],
    next: occurrenceRequirementNextNode(refusal.field),
  }
}
