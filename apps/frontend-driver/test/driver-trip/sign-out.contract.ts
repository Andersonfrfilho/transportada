/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  discardStaleAttachments,
  type QueuedAttachment,
} from '@/modules/driver-trip/shared/offlineAttachments.service'
import type { QueuedReport } from '@/modules/driver-trip/shared/offlineQueue.service'
import { discardOwnPending } from '@/modules/driver-trip/shared/queueOwner.service'
import { signOutDriver } from '@/modules/driver-trip/shared/signOut.service'

import { createMemoryAttachments, createMemoryQueue } from '../fixtures/memory-queue-stores.fixture'

const OWNER = 'a'.repeat(64)
const OTHER = 'b'.repeat(64)
const NOW = new Date('2026-09-25T12:00:00.000Z')
const DAY_MS = 24 * 60 * 60 * 1000
const PROFILE = new URL(
  '../../src/modules/driver-trip/pages/DriverProfile.page.tsx',
  import.meta.url,
)

function queued(input: { daysAgo?: number; key: string; subHash?: string }): QueuedReport {
  return {
    attempts: 0,
    createdAt: new Date(NOW.getTime() - (input.daysAgo ?? 0) * DAY_MS).toISOString(),
    report: {
      documentId: 'document-1',
      idempotencyKey: input.key,
      kind: 'deliver',
      location: null,
    },
    subHash: input.subHash ?? OWNER,
  }
}

function photo(input: { daysAgo?: number; key: string; subHash?: string }): QueuedAttachment {
  return {
    attachmentKey: input.key,
    blob: new Blob(['x']),
    capturedAt: new Date(NOW.getTime() - (input.daysAgo ?? 0) * DAY_MS).toISOString(),
    documentId: 'document-1',
    fileName: 'foto.jpg',
    kind: 'photo',
    latitude: -23.55,
    longitude: -46.63,
    receiverDocument: '12345678909',
    receiverName: 'Recebedor',
    subHash: input.subHash ?? OWNER,
  }
}

/**
 * Spec 189 T9.2 (segurança M2): "Sair" com pendência própria deixava no aparelho o evento, a foto,
 * o documento e o nome do recebedor e a posição — e o próximo motorista os via como "de outra
 * conta", sem prazo. Descartar leva tudo, e só o do dono.
 */
describe('"Sair" com pendência própria', () => {
  it('descartar leva evento, blob, documento e posição — só os do dono', async () => {
    const store = createMemoryQueue([
      queued({ key: 'own' }),
      queued({ key: 'foreign', subHash: OTHER }),
    ])
    const attachmentStore = createMemoryAttachments([
      ['own', [photo({ key: 'own-photo' })]],
      [
        'document:document-9',
        [photo({ key: 'own-orphan' }), photo({ key: 'foreign-photo', subHash: OTHER })],
      ],
    ])

    const discarded = await discardOwnPending({ attachmentStore, ownerSubHash: OWNER, store })

    expect(discarded).toBe(3)
    expect(store.items().map((item) => item.report.idempotencyKey)).toEqual(['foreign'])
    expect(
      [...attachmentStore.entries()].map(([key, items]) => [
        key,
        items.map((item) => item.attachmentKey),
      ]),
    ).toEqual([['document:document-9', ['foreign-photo']]])
  })

  it('o Perfil avisa antes de sair com pendência e oferece enviar ou descartar', () => {
    const source = readFileSync(PROFILE, 'utf8')

    expect(source).toContain('ownPendingCount')
    expect(source).toContain("t('profile.signOutPending.send')")
    expect(source).toContain("t('profile.signOutPending.discard')")
    expect(source).toContain('signOutDriver(')
  })
})

/** Spec 189 T9.2 (M9): sem rede, o logout do Keycloak rejeita — o "Sair" não pode ficar parado. */
describe('signOutDriver (M9)', () => {
  it('apaga o snapshot antes do logout', async () => {
    const calls: string[] = []

    await signOutDriver({
      discardSnapshots: () => {
        calls.push('discard')
        return Promise.resolve()
      },
      logout: () => {
        calls.push('logout')
        return Promise.resolve()
      },
      reload: () => calls.push('reload'),
    })

    expect(calls).toEqual(['discard', 'logout'])
  })

  it('logout rejeitando (sem rede) recarrega — e o boot abre "sem viagem salva"', async () => {
    const calls: string[] = []

    await signOutDriver({
      discardSnapshots: () => Promise.reject(new Error('idb')),
      logout: () => Promise.reject(new TypeError('Failed to fetch')),
      reload: () => calls.push('reload'),
    })

    expect(calls).toEqual(['reload'])
  })
})

/** Spec 189 T9.2 (segurança M2): o evento parado ganha o mesmo prazo de 7 dias do anexo. */
describe('eventos parados vencem aos 7 dias, como os anexos', () => {
  it('evento de 8 dias sai com os anexos do grupo; o de 1 dia fica', async () => {
    const store = createMemoryQueue([
      queued({ daysAgo: 8, key: 'old' }),
      queued({ daysAgo: 1, key: 'recent' }),
    ])
    const attachmentStore = createMemoryAttachments([
      ['old', [photo({ daysAgo: 1, key: 'photo-of-old-event' })]],
      ['recent', [photo({ daysAgo: 1, key: 'photo-of-recent-event' })]],
    ])

    const discarded = await discardStaleAttachments({ attachmentStore, now: NOW, store })

    expect(discarded).toBe(2)
    expect(store.items().map((item) => item.report.idempotencyKey)).toEqual(['recent'])
    expect([...attachmentStore.entries().keys()]).toEqual(['recent'])
  })
})
