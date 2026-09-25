/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it, mock } from 'bun:test'

import {
  createDriverTripClient,
  DriverTripRequestError,
  toAttachmentSendOutcome,
} from '@/modules/driver-trip/shared/driverTripClient.service'
import {
  drainQueueWithAttachments,
  type AttachmentSendOutcome,
} from '@/modules/driver-trip/shared/offlineAttachments.service'
import {
  createKeycloakAuthProvider,
  IDENTITY_SESSION_EXPIRED,
  IdentityUnreachableError,
  type KeycloakClient,
} from '@/modules/shared/KeycloakAuthProvider.provider'

import { createMemoryAttachments, createMemoryQueue } from '../fixtures/memory-queue-stores.fixture'

const OWNER = 'owner-sub-hash'

function createClient(updateToken: KeycloakClient['updateToken']): KeycloakClient {
  return {
    clearToken: mock(() => undefined),
    init: mock(() => Promise.resolve(true)),
    login: mock(() => Promise.resolve()),
    logout: mock(() => Promise.resolve()),
    token: 'token',
    updateToken,
  }
}

/**
 * Spec 189 T9.2 (A1): o motorista toca "Entreguei" no subsolo, a drenagem tenta, e o refresh do
 * token morre no transporte. O toque tem de continuar drenável — nunca virar "recusado pelo
 * servidor", que só o envio manual destrava.
 */
describe('falha de identidade na drenagem é falha de rede, não recusa', () => {
  it('updateToken rejeitando com TypeError deixa o item drenável, sem causa de recusa', async () => {
    const provider = createKeycloakAuthProvider(
      createClient(mock(() => Promise.reject(new TypeError('Failed to fetch')))),
      'http://localhost/auth/callback',
    )
    const fetchSpy = mock(() => Promise.resolve(new Response('{}')))
    const client = createDriverTripClient({
      apiUrl: 'https://api.test',
      fetch: fetchSpy,
      getAccessToken: () => provider.getAccessToken(),
    })
    const store = createMemoryQueue([
      {
        attempts: 0,
        createdAt: '2026-09-25T10:00:00.000Z',
        report: {
          documentId: 'document-1',
          idempotencyKey: 'key-1',
          kind: 'deliver',
          location: null,
        },
        subHash: OWNER,
      },
    ])

    const result = await drainQueueWithAttachments({
      attachmentStore: createMemoryAttachments(),
      ownerSubHash: OWNER,
      send: async (report): Promise<AttachmentSendOutcome> => {
        try {
          await client.send(report)
          return { kind: 'sent' }
        } catch (error) {
          return toAttachmentSendOutcome(error)
        }
      },
      sendAttachment: () => Promise.resolve({ kind: 'sent' }),
      store,
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(result.rejected).toBe(0)
    expect(store.items()).toHaveLength(1)
    expect(store.items()[0]?.rejectionCause).toBeUndefined()
    expect(store.items()[0]?.attempts).toBe(1)
  })

  it('sessão vencida também espera: o item volta a subir depois de entrar de novo', () => {
    expect(toAttachmentSendOutcome(new Error(IDENTITY_SESSION_EXPIRED))).toEqual({
      kind: 'failed-network',
    })
    expect(toAttachmentSendOutcome(new IdentityUnreachableError())).toEqual({
      kind: 'failed-network',
    })
  })

  it('a rede caída continua falha de rede, e a recusa do servidor continua recusa', () => {
    expect(
      toAttachmentSendOutcome(new DriverTripRequestError({ code: 'OFFLINE', isOffline: true })),
    ).toEqual({ kind: 'failed-network' })
    expect(
      toAttachmentSendOutcome(
        new DriverTripRequestError({ code: 'TRIP_CLOSED', isOffline: false, status: 409 }),
      ),
    ).toEqual({ cause: '409 TRIP_CLOSED', kind: 'rejected' })
  })
})
