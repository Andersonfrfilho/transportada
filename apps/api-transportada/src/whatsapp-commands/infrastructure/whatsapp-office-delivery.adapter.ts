/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 RF19: **a baixa do atendente pelo WhatsApp vai pelo caminho do escritório.** As funções são as
 * MESMAS das rotas `field-delivery` e `field-proof` (`reportDelivery`/`attachProof`, compostas em
 * `main.ts`): o `target` é resolvido para a viagem da nota, a autoria é `office`, o ator é o usuário do
 * atendente e o registro é em nome do motorista da viagem, com a trilha de auditoria do escritório.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq } from 'drizzle-orm'

import { tripDocuments } from '../../database/trip.schema.js'
import type { FieldTripTargetPort } from '../../trips/application/field-trip-target.port.js'
import { resolveFieldTripTarget } from '../../trips/application/resolve-field-trip-target.use-case.js'
import { FIELD_TRIP_TARGET_KIND } from '../../trips/application/field-trip-target.types.js'
import type { TripFieldOfficeDocumentDependencies } from '../../trips/presentation/trip-field-office-document.routes.js'
import { TripDocumentNotReachableError } from '../../trips/domain/trip.error.js'
import type { WhatsAppDriverEventResult } from '../application/whatsapp-driver-events.service.js'
import {
  deliverWhatsAppOfficeDocument,
  type WhatsAppOfficeDeliveryPorts,
} from '../application/whatsapp-office-delivery.service.js'
import type { WhatsAppDeliveryPreparationPorts } from '../application/whatsapp-delivery-preparation.service.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** O canal na trilha: o IP do escritório não existe aqui, o campo diz de onde veio. */
const WHATSAPP_AUDIT_ORIGIN = 'whatsapp'

const AUDIT_ACTION = {
  deliver: 'trip_field_office.document_deliver',
  proof: 'trip_field_office.document_proof',
} as const

export function createWhatsAppOfficeDelivery(dependencies: {
  readonly attachProof: TripFieldOfficeDocumentDependencies['attachProof']
  readonly database: Database
  readonly reportDelivery: TripFieldOfficeDocumentDependencies['reportDelivery']
  readonly targets: FieldTripTargetPort
}): {
  readonly attachProof: WhatsAppDeliveryPreparationPorts['attachProof']
  readonly deliver: WhatsAppDeliveryPreparationPorts['deliver']
  /** Conversa individual: sem motorista no pedido, vale o efetivo da viagem da nota. */
  readonly deliverByDocument: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly idempotencyKey: string
  }) => Promise<WhatsAppDriverEventResult>
} {
  async function resolveContext(input: {
    readonly action: string
    readonly actorUserId: string
    readonly companyId: string
    readonly documentId: string
    readonly driverId?: string
    readonly idempotencyKey: string
  }) {
    const [row] = await dependencies.database
      .select({ tripId: tripDocuments.tripId })
      .from(tripDocuments)
      .where(
        and(eq(tripDocuments.id, input.documentId), eq(tripDocuments.companyId, input.companyId)),
      )
      .limit(1)
    if (row === undefined) throw new TripDocumentNotReachableError()
    const target = await resolveFieldTripTarget({
      companyId: input.companyId,
      repository: dependencies.targets,
      target: {
        ...(input.driverId === undefined ? {} : { driverId: input.driverId }),
        kind: FIELD_TRIP_TARGET_KIND.trip,
        tripId: row.tripId,
      },
    })
    return {
      actorUserId: input.actorUserId,
      companyId: input.companyId,
      documentId: input.documentId,
      idempotencyKey: input.idempotencyKey,
      officeAudit: {
        action: input.action,
        correlationId: crypto.randomUUID(),
        ipAddress: WHATSAPP_AUDIT_ORIGIN,
      },
      target,
    }
  }

  const ports: WhatsAppOfficeDeliveryPorts = {
    reportDelivery: async (input) =>
      dependencies.reportDelivery({
        ...(await resolveContext({ ...input, action: AUDIT_ACTION.deliver })),
        deliveredAt: new Date(),
        proof: null,
      }),
  }

  return {
    attachProof: async (input) =>
      dependencies.attachProof({
        ...(await resolveContext({
          ...input,
          action: AUDIT_ACTION.proof,
          idempotencyKey: input.upload.attachmentKey,
        })),
        kind: input.upload.kind,
        proof: {
          attachmentKey: input.upload.attachmentKey,
          bytes: input.upload.bytes,
          mimeType: input.upload.mimeType,
          receivedBy: { receivedBy: input.upload.receivedBy, receivedByDetail: null },
          receiverDocument: '',
          receiverName: input.upload.receiverName,
        },
      }),
    deliver: (input) => deliverWhatsAppOfficeDocument(ports, input),
    deliverByDocument: (input) => deliverWhatsAppOfficeDocument(ports, input),
  }
}
