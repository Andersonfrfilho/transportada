/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF19: a baixa do atendente pelo caminho do escritório, traduzida no mesmo resultado tipado
 * dos eventos do motorista — as falas e a preparação da entrega não distinguem os dois caminhos.
 */
import type {
  WhatsAppDocumentEventInput,
  WhatsAppDriverEventResult,
} from './whatsapp-driver-events.service.js'
import {
  settleWhatsAppDriverEvent,
  toWhatsAppDocumentResult,
  WHATSAPP_DRIVER_EVENT,
} from './whatsapp-driver-events.service.js'

export type WhatsAppOfficeDeliveryPorts = {
  /** A função do escritório (`field-delivery`) já com o alvo da viagem da nota resolvido. */
  readonly reportDelivery: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    /** Ausente (conversa individual): o motorista efetivo da viagem da nota. */
    readonly driverId?: string
    readonly idempotencyKey: string
  }) => Promise<{
    readonly alreadySettled: boolean
    readonly proofPending?: boolean
    readonly stopCompleted?: boolean
    readonly tripCompleted?: boolean
  }>
}

export async function deliverWhatsAppOfficeDocument(
  ports: WhatsAppOfficeDeliveryPorts,
  input: Omit<WhatsAppDocumentEventInput, 'driverId' | 'location'> & {
    readonly driverId?: string
    readonly location?: WhatsAppDocumentEventInput['location']
  },
): Promise<WhatsAppDriverEventResult> {
  const event = WHATSAPP_DRIVER_EVENT.deliver
  return settleWhatsAppDriverEvent(event, async () =>
    toWhatsAppDocumentResult(
      event,
      await ports.reportDelivery({
        actorUserId: input.actorUserId,
        companyId: input.companyId,
        documentId: input.documentId,
        ...(input.driverId === undefined ? {} : { driverId: input.driverId }),
        idempotencyKey: input.idempotencyKey,
      }),
    ),
  )
}
