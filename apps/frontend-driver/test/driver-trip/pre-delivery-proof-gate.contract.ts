/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import type {
  DriverDeliveryProofSettings,
  DriverFieldReport,
} from '@/modules/driver-trip/shared/driverTrip.types'
import { toDriverTripSnapshot } from '@/modules/driver-trip/shared/driverTripResponse.validation'
import { isDocumentSettled } from '@/modules/driver-trip/shared/driverTripView.service'
import {
  awaitingDeliveryAttachmentKey,
  drainQueueWithAttachments,
  enqueueAttachment,
  releaseAttachmentsAwaitingDelivery,
  type QueuedAttachment,
} from '@/modules/driver-trip/shared/offlineAttachments.service'
import type { QueuedReport } from '@/modules/driver-trip/shared/offlineQueue.service'
import { countPending } from '@/modules/driver-trip/shared/pendingQueue.service'
import {
  DEFAULT_PROOF_SETTINGS,
  listMissingProofFields,
  requiresProofBeforeDelivery,
  resolveProofFormPlan,
} from '@/modules/driver-trip/shared/proofFormPlan.service'

import { createMemoryAttachments, createMemoryQueue } from '../fixtures/memory-queue-stores.fixture'

const NOW = '2026-09-29T13:00:00.000Z'

function settings(
  overrides: Partial<DriverDeliveryProofSettings> = {},
): DriverDeliveryProofSettings {
  return { ...DEFAULT_PROOF_SETTINGS, ...overrides }
}

function photo(documentId = 'document-1', attachmentKey = 'anexo-1'): QueuedAttachment {
  return {
    attachmentKey,
    blob: new Blob([new Uint8Array(10)], { type: 'image/jpeg' }),
    capturedAt: NOW,
    documentId,
    fileName: 'canhoto.jpg',
    kind: 'photo',
  }
}

function deliverReport(key: string, documentId = 'document-1'): DriverFieldReport {
  return { documentId, idempotencyKey: key, kind: 'deliver', location: null }
}

function queuedDeliver(key: string, documentId = 'document-1'): QueuedReport {
  return { attempts: 0, createdAt: NOW, report: deliverReport(key, documentId) }
}

/**
 * Spec 218 (RF-A1, P2): "Entreguei" só espera o comprovante quando algum campo que **bloqueia** está
 * `required` — foto, assinatura, nome ou documento. Sem nenhum, nada muda (regressão zero); e
 * `receivedBy` nunca bloqueia (spec 193 R2), então sozinho em `required` também não abre o gate.
 */
describe('quando a entrega espera o comprovante (spec 218 RF-A1)', () => {
  it('nada required — sem configuração, padrão ou tudo opcional/off: o "Entreguei" de sempre', () => {
    expect(requiresProofBeforeDelivery(resolveProofFormPlan(null))).toBe(false)
    expect(requiresProofBeforeDelivery(resolveProofFormPlan(settings()))).toBe(false)
    expect(
      requiresProofBeforeDelivery(
        resolveProofFormPlan(
          settings({
            photo: 'off',
            receivedBy: 'off',
            receiverDocument: 'off',
            receiverName: 'off',
            signature: 'off',
          }),
        ),
      ),
    ).toBe(false)
  })

  it('quem recebeu em required sozinho nunca abre o gate — ele nunca bloqueia (spec 193)', () => {
    expect(
      requiresProofBeforeDelivery(resolveProofFormPlan(settings({ receivedBy: 'required' }))),
    ).toBe(false)
  })

  it.each([['photo'], ['signature'], ['receiverName'], ['receiverDocument']] as const)(
    '%s required abre o gate',
    (field) => {
      expect(
        requiresProofBeforeDelivery(resolveProofFormPlan(settings({ [field]: 'required' }))),
      ).toBe(true)
    },
  )

  /** RF-A4: o lançamento tardio passa pelo mesmo gate — a decisão só conhece o plano. */
  it('a decisão não recebe nada além do plano — "Registrar entrega depois" não tem exceção', () => {
    expect(requiresProofBeforeDelivery.length).toBe(1)
  })
})

/**
 * Spec 218 (P1): o botão "Confirmar entrega" nasce desabilitado e só habilita quando a lista de
 * obrigatórios faltantes esvazia — a mesma `listMissingProofFields` do formulário de depois.
 */
describe('"Confirmar entrega" habilita só com os obrigatórios completos (spec 218 P1)', () => {
  const plan = resolveProofFormPlan(settings({ photo: 'required' }))
  const empty = {
    cargoCount: 0,
    hasPhoto: false,
    hasSignature: false,
    receiverDocument: '',
    receiverName: '',
  }

  it('sem a foto, falta a foto — o botão fica desabilitado', () => {
    expect(listMissingProofFields({ plan, values: empty })).toEqual(['photo'])
  })

  it('com a foto anexada, nada falta — o botão habilita', () => {
    expect(listMissingProofFields({ plan, values: { ...empty, hasPhoto: true } })).toEqual([])
  })
})

function snapshotWith(input: {
  readonly deliveryProof: DriverDeliveryProofSettings
  readonly tripStatus: string
}) {
  return toDriverTripSnapshot({
    data: {
      isRegisteredDriver: true,
      trips: [
        {
          id: 'trip-aberta',
          manifest: null,
          status: input.tripStatus,
          stops: [
            {
              arrivedAt: '2026-09-29T12:00:00.000Z',
              completedAt: null,
              deliveryProof: null,
              documents: [
                {
                  deliveryProof: input.deliveryProof,
                  id: 'nota-em-aberto',
                  separationStatus: 'loaded',
                },
              ],
              id: 'stop-1',
              label: 'Rua A, 1',
              sequence: 1,
            },
          ],
          vehiclePlate: 'ABC1D23',
        },
      ],
    },
  })
}

/**
 * Pedido explícito do usuário (29/09): a nota "em aberto" — viagem já `dispatched`/`in_transit`,
 * motorista na rua — tem de obedecer à configuração nova assim que ela muda. O app não guarda nada
 * da criação da nota: o comprovante efetivo vem pronto em cada `GET /me/trips/current`, então a
 * próxima leitura já liga o gate, por construção.
 */
describe('a nota em aberto obedece à configuração do snapshot de agora (spec 218)', () => {
  it.each([['dispatched'], ['in_transit']])(
    'viagem %s: a leitura com photo required liga o gate na nota ainda não entregue',
    (tripStatus) => {
      const snapshot = snapshotWith({ deliveryProof: settings({ photo: 'required' }), tripStatus })
      const document = snapshot.trips[0]?.stops[0]?.documents[0]
      expect(document).toBeDefined()
      if (document === undefined) return
      expect(isDocumentSettled(document)).toBe(false)
      expect(requiresProofBeforeDelivery(resolveProofFormPlan(document.deliveryProof))).toBe(true)
    },
  )

  it('a mesma nota, lida antes e depois da configuração existir, muda de comportamento', () => {
    const before = snapshotWith({ deliveryProof: settings(), tripStatus: 'in_transit' })
    const after = snapshotWith({
      deliveryProof: settings({ photo: 'required' }),
      tripStatus: 'in_transit',
    })
    const documentBefore = before.trips[0]?.stops[0]?.documents[0]
    const documentAfter = after.trips[0]?.stops[0]?.documents[0]
    expect(documentBefore?.id).toBe(documentAfter?.id ?? '')
    expect(
      requiresProofBeforeDelivery(resolveProofFormPlan(documentBefore?.deliveryProof ?? null)),
    ).toBe(false)
    expect(
      requiresProofBeforeDelivery(resolveProofFormPlan(documentAfter?.deliveryProof ?? null)),
    ).toBe(true)
  })
})

/**
 * Spec 218 (RF-A3): o anexo do gate entra na fila na hora (spec 203) — mas a API só aceita canhoto de
 * nota com entrega registrada (`findDeliveryEventId` → `TRIP_DOCUMENT_NOT_REACHABLE`). Com rede, a
 * drenagem de 3 s depois da foto o mandaria antes do "Confirmar entrega" e ele ficaria recusado. Por
 * isso ele espera numa chave própria até a entrega entrar na fila, e então vai para o grupo dela —
 * "evento primeiro", como qualquer outro anexo.
 */
describe('o anexo de antes da entrega espera a entrega na fila (spec 218 RF-A3)', () => {
  it('sem entrega na fila, o anexo do gate entra numa chave de espera, não na do documento', async () => {
    const store = createMemoryQueue()
    const attachmentStore = createMemoryAttachments()

    const result = await enqueueAttachment({
      attachment: photo(),
      attachmentStore,
      awaitingDelivery: true,
      store,
    })

    expect(result).toEqual({
      accepted: true,
      eventKey: awaitingDeliveryAttachmentKey('document-1'),
    })
    expect(attachmentStore.entries().get('document:document-1')).toBeUndefined()
  })

  it('a entrega já na fila recebe o anexo direto — não há o que esperar', async () => {
    const store = createMemoryQueue([queuedDeliver('entrega-1')])
    const attachmentStore = createMemoryAttachments()

    const result = await enqueueAttachment({
      attachment: photo(),
      attachmentStore,
      awaitingDelivery: true,
      store,
    })

    expect(result).toEqual({ accepted: true, eventKey: 'entrega-1' })
  })

  it('a drenagem nunca manda o anexo que espera — nem no envio manual daquela chave', async () => {
    const store = createMemoryQueue()
    const attachmentStore = createMemoryAttachments()
    await enqueueAttachment({ attachment: photo(), attachmentStore, awaitingDelivery: true, store })
    const sentAttachments: string[] = []
    const sendAttachment = (attachment: QueuedAttachment) => {
      sentAttachments.push(attachment.attachmentKey)
      return Promise.resolve({ kind: 'sent' as const })
    }

    await drainQueueWithAttachments({
      origin: 'immediate',
      attachmentStore,
      send: () => Promise.resolve({ kind: 'sent' }),
      sendAttachment,
      store,
    })
    await drainQueueWithAttachments({
      origin: 'immediate',
      attachmentStore,
      only: awaitingDeliveryAttachmentKey('document-1'),
      send: () => Promise.resolve({ kind: 'sent' }),
      sendAttachment,
      store,
    })

    expect(sentAttachments).toEqual([])
    expect(attachmentStore.entries().get(awaitingDeliveryAttachmentKey('document-1'))).toHaveLength(
      1,
    )
  })

  it('a entrega enfileirada solta o anexo para o grupo dela, e a drenagem manda entrega e depois foto', async () => {
    const store = createMemoryQueue()
    const attachmentStore = createMemoryAttachments()
    await enqueueAttachment({ attachment: photo(), attachmentStore, awaitingDelivery: true, store })
    await store.update((items) => [...items, queuedDeliver('entrega-1')])

    const released = await releaseAttachmentsAwaitingDelivery({
      attachmentStore,
      documentId: 'document-1',
      eventKey: 'entrega-1',
    })

    expect(released).toBe(1)
    expect(
      attachmentStore.entries().get(awaitingDeliveryAttachmentKey('document-1')),
    ).toBeUndefined()
    expect(attachmentStore.entries().get('entrega-1')).toHaveLength(1)

    const order: string[] = []
    await drainQueueWithAttachments({
      origin: 'immediate',
      attachmentStore,
      send: ({ report }) => {
        order.push(report.kind)
        return Promise.resolve({ kind: 'sent' })
      },
      sendAttachment: (attachment) => {
        order.push(attachment.kind)
        return Promise.resolve({ kind: 'sent' })
      },
      store,
    })
    expect(order).toEqual(['deliver', 'photo'])
  })

  it('soltar sem nada esperando não mexe na fila', async () => {
    const attachmentStore = createMemoryAttachments()
    const released = await releaseAttachmentsAwaitingDelivery({
      attachmentStore,
      documentId: 'document-1',
      eventKey: 'entrega-1',
    })
    expect(released).toBe(0)
    expect(attachmentStore.entries().size).toBe(0)
  })

  it('o anexo que espera conta como pendente, mas não liga o relógio da drenagem', () => {
    const counts = countPending({
      attachments: [[awaitingDeliveryAttachmentKey('document-1'), [photo()]]],
      now: new Date(NOW),
      reports: [],
    })
    expect(counts.drainable).toBe(0)
    expect(counts.total).toBe(1)
  })
})
