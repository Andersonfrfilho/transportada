/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A entrega em preparo de verdade (`createWhatsAppDeliveryPreparations`) sobre um repositório em memória, para os
 * contratos dos canais conferirem o texto exato que o motorista lê.
 */
import {
  createWhatsAppDeliveryPreparations,
  type WhatsAppDeliveryPreparation,
  type WhatsAppDeliveryPreparationRepositoryPort,
} from '../../src/whatsapp-commands/application/whatsapp-delivery-preparation.service.js'
import type {
  WhatsAppDocumentEventInput,
  WhatsAppDriverActor,
} from '../../src/whatsapp-commands/application/whatsapp-driver-events.service.js'
import type { DeliveryProofFieldSettings } from '../../src/trips/domain/delivery-proof-settings.policy.js'

export function createInMemoryDeliveryPreparations(
  settings: DeliveryProofFieldSettings,
  actor: WhatsAppDriverActor = { actorUserId: 'U1', companyId: 'C1', driverId: 'D1' },
) {
  const rows = new Map<string, WhatsAppDeliveryPreparation & { status: string }>()
  const delivered: WhatsAppDocumentEventInput[] = []
  let sequence = 0
  const repository: WhatsAppDeliveryPreparationRepositoryPort = {
    async close({ id, status, version }) {
      const row = rows.get(id)
      if (row === undefined || row.status !== 'open' || row.version !== version) return false
      rows.set(id, { ...row, awaiting: null, status, version: row.version + 1n })
      return true
    },
    async findOpenByDocument({ documentId }) {
      return (
        [...rows.values()].find((row) => row.documentId === documentId && row.status === 'open') ??
        null
      )
    },
    async listOpenForDriver({ driverId }) {
      return [...rows.values()]
        .filter((row) => row.driverId === driverId && row.status === 'open')
        .reverse()
    },
    async open(input) {
      sequence += 1
      const row = {
        ...input,
        awaiting: null,
        id: `P${sequence}`,
        location: null,
        photos: [],
        receivedBy: null,
        receiverName: null,
        skipped: [],
        status: 'open',
        version: 1n,
      }
      rows.set(row.id, row)
      return row
    },
    async save({ changes, id, version }) {
      const row = rows.get(id)
      if (row === undefined || row.status !== 'open' || row.version !== version) return false
      rows.set(id, { ...row, ...changes, version: row.version + 1n })
      return true
    },
  }
  const service = createWhatsAppDeliveryPreparations({
    attachProof: async () => undefined,
    deliver: async (input) => {
      delivered.push(input)
      return {
        details: { proofPending: false, stopCompleted: false, tripCompleted: false },
        event: 'deliver',
        kind: 'registered',
      }
    },
    describeResult: async ({ documentNumber, result }) => `${result.kind}:${documentNumber}`,
    media: {
      read: async () => new Uint8Array(),
      remove: async () => undefined,
      store: async ({ bytes, preparationId }) => ({
        objectKey: `${preparationId}/photo`,
        sha256: 'x',
        sizeBytes: bytes.byteLength,
      }),
    },
    repository,
    resolveSettings: async () => settings,
  })
  return {
    answer: (text: string) => service.answer({ actor, text }),
    begin: (documentId: string, documentNumber: string) =>
      service.begin({ actor, channel: 'group', documentId, documentNumber, location: null }),
    delivered,
    service,
    status: () => [...rows.values()].map((row) => row.status),
  }
}
