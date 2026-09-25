/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { readDriverAppMode } from '@/modules/driver-trip/shared/driverAppEntry.service'
import type { AttachmentStore } from '@/modules/driver-trip/shared/offlineAttachments.service'
import type { OfflineQueueStore } from '@/modules/driver-trip/shared/offlineQueue.service'

/** Nunca resolve nem rejeita — o mesmo formato de um IndexedDB preso (outra aba, disco cheio). */
function createHangingQueueStore(): OfflineQueueStore {
  return {
    read: () => new Promise(() => undefined),
    update: () => new Promise(() => undefined),
  }
}

function createHangingAttachmentStore(): AttachmentStore {
  return {
    read: () => new Promise(() => undefined),
    readAll: () => new Promise(() => undefined),
    readTotals: () => new Promise(() => undefined),
    remove: () => new Promise(() => undefined),
    update: () => new Promise(() => undefined),
  }
}

/**
 * ADR-0075 §6, revisão LOW: um armazenamento preso não rejeita, então o `catch` do
 * `readDriverAppMode` não pega — sem teto, o boot travaria antes de qualquer tela aparecer. O
 * caminho de sucesso usa `window` (via `isStandaloneDisplay`/`location.pathname`), então só o
 * caminho do teto é coberto aqui, sem DOM (os contratos rodam sem DOM).
 */
describe('readDriverAppMode — teto do IndexedDB no boot (revisão LOW)', () => {
  it('IndexedDB preso além do teto vira stay, não trava o boot', async () => {
    const mode = await readDriverAppMode({
      createAttachmentStore: createHangingAttachmentStore,
      createQueueStore: createHangingQueueStore,
      driverAppUrl: 'https://motorista.staging.example.com.br',
      isFieldOnlyUser: true,
      timeoutMs: 20,
    })

    expect(mode).toBe('stay')
  })

  /**
   * A leitura rápida não espera o teto — ela resolve o `Promise.race` primeiro. O caminho de
   * sucesso completo (`resolveDriverAppRedirect`) usa `window`, fora do escopo deste arquivo sem
   * DOM; o que se prova aqui é só que a corrida termina antes do teto, pelo tempo decorrido.
   */
  it('lê rápido, dentro do teto: termina bem antes dele, não espera o timer', async () => {
    const queueStore: OfflineQueueStore = {
      read: () => Promise.resolve([]),
      update: () => Promise.resolve([]),
    }
    const attachmentStore: AttachmentStore = {
      read: () => Promise.resolve([]),
      readAll: () => Promise.resolve([]),
      readTotals: () => Promise.resolve({ count: 0, totalBytes: 0 }),
      remove: () => Promise.resolve(),
      update: () => Promise.resolve([]),
    }
    const startedAt = Date.now()

    // Sem `window`, o caminho de sucesso lança ao final — a corrida contra o teto já terminou
    // antes disso, e é essa a parte que este teste mede.
    await readDriverAppMode({
      createAttachmentStore: () => attachmentStore,
      createQueueStore: () => queueStore,
      driverAppUrl: 'https://motorista.staging.example.com.br',
      isFieldOnlyUser: false,
      timeoutMs: 3_000,
    }).catch(() => undefined)

    expect(Date.now() - startedAt).toBeLessThan(200)
  })
})
