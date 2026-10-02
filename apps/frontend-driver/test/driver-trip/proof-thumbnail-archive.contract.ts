/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  discardProofThumbnails,
  isStoredProofThumbnail,
  PROOF_THUMBNAIL_MAX_AGE_MS,
  readProofThumbnail,
  saveProofThumbnail,
  type ProofThumbnailStore,
  type StoredProofThumbnail,
} from '@/modules/driver-trip/shared/proofThumbnailArchive.service'

const NOW = new Date('2026-10-01T12:00:00.000Z')
const HOUR_MS = 60 * 60 * 1000
const DOCUMENT_ID = '00000000-0000-4000-8000-000000000001'
const OWNER = 'a'.repeat(64)
const OTHER_OWNER = 'b'.repeat(64)
const INDEXED_DB = new URL(
  '../../src/modules/driver-trip/shared/indexedDbQueue.service.ts',
  import.meta.url,
)
const PROFILE = new URL(
  '../../src/modules/driver-trip/pages/DriverProfile.page.tsx',
  import.meta.url,
)
const MAIN = new URL('../../src/main.tsx', import.meta.url)

function thumbnail(): Blob {
  return new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })
}

function hoursBefore(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR_MS)
}

/** O mesmo formato do IndexedDB: um registro por `documentId`, com o dono dentro. */
function createMemoryThumbnailStore(): ProofThumbnailStore & {
  readonly documents: () => readonly string[]
} {
  const records = new Map<string, StoredProofThumbnail>()

  return {
    clear: () => {
      records.clear()
      return Promise.resolve()
    },
    documents: () => [...records.keys()],
    read: (documentId) => Promise.resolve(records.get(documentId)),
    remove: (documentId) => {
      records.delete(documentId)
      return Promise.resolve()
    },
    retainOnly: (subHash) => {
      for (const [documentId, record] of [...records.entries()]) {
        if (record.subHash !== subHash) records.delete(documentId)
      }
      return Promise.resolve()
    },
    write: (input) => {
      records.set(input.documentId, input.record)
      return Promise.resolve()
    },
  }
}

describe('a miniatura do canhoto já enviado fica no aparelho', () => {
  it('guarda e devolve a miniatura da nota', async () => {
    const store = createMemoryThumbnailStore()
    const blob = thumbnail()
    await saveProofThumbnail({
      blob,
      documentId: DOCUMENT_ID,
      now: NOW,
      store,
      subHash: OWNER,
    })

    expect(
      await readProofThumbnail({ documentId: DOCUMENT_ID, now: NOW, store, subHash: OWNER }),
    ).toBe(blob)
  })

  it('nota sem miniatura guardada não devolve nada', async () => {
    const store = createMemoryThumbnailStore()
    expect(
      await readProofThumbnail({ documentId: DOCUMENT_ID, now: NOW, store, subHash: OWNER }),
    ).toBeUndefined()
  })

  it('a miniatura de outro motorista nunca é mostrada, e sai na leitura', async () => {
    const store = createMemoryThumbnailStore()
    await saveProofThumbnail({
      blob: thumbnail(),
      documentId: DOCUMENT_ID,
      now: NOW,
      store,
      subHash: OTHER_OWNER,
    })

    expect(
      await readProofThumbnail({ documentId: DOCUMENT_ID, now: NOW, store, subHash: OWNER }),
    ).toBeUndefined()
    expect(store.documents()).toEqual([])
  })

  it('passadas 24 h a miniatura sai do aparelho', async () => {
    const store = createMemoryThumbnailStore()
    await saveProofThumbnail({
      blob: thumbnail(),
      documentId: DOCUMENT_ID,
      now: hoursBefore(25),
      store,
      subHash: OWNER,
    })

    expect(
      await readProofThumbnail({ documentId: DOCUMENT_ID, now: NOW, store, subHash: OWNER }),
    ).toBeUndefined()
    expect(store.documents()).toEqual([])
    expect(PROOF_THUMBNAIL_MAX_AGE_MS).toBe(24 * HOUR_MS)
  })

  it('dentro do prazo continua valendo', async () => {
    const store = createMemoryThumbnailStore()
    await saveProofThumbnail({
      blob: thumbnail(),
      documentId: DOCUMENT_ID,
      now: hoursBefore(23),
      store,
      subHash: OWNER,
    })

    expect(
      await readProofThumbnail({ documentId: DOCUMENT_ID, now: NOW, store, subHash: OWNER }),
    ).toBeInstanceOf(Blob)
  })

  it('"Sair" leva as miniaturas junto', async () => {
    const store = createMemoryThumbnailStore()
    await saveProofThumbnail({
      blob: thumbnail(),
      documentId: DOCUMENT_ID,
      now: NOW,
      store,
      subHash: OWNER,
    })

    await discardProofThumbnails({ store })
    expect(store.documents()).toEqual([])
  })

  it('o que não tem a forma do registro não vira imagem', () => {
    expect(isStoredProofThumbnail(undefined)).toBe(false)
    expect(isStoredProofThumbnail({ savedAt: NOW.toISOString(), subHash: OWNER })).toBe(false)
    expect(isStoredProofThumbnail({ blob: thumbnail(), savedAt: 1, subHash: OWNER })).toBe(false)
    expect(
      isStoredProofThumbnail({ blob: thumbnail(), savedAt: NOW.toISOString(), subHash: OWNER }),
    ).toBe(true)
  })
})

describe('o arquivo de miniaturas está ligado ao ciclo de vida da sessão', () => {
  it('o IndexedDB cria a store e sobe de versão', () => {
    const source = readFileSync(INDEXED_DB, 'utf8')
    expect(source).toInclude("const PROOF_THUMBNAIL_STORE_NAME = 'proof-thumbnails'")
    expect(source).toInclude('const DATABASE_VERSION = 4')
    expect(source).toInclude('createIndexedDbProofThumbnailStore')
  })

  it('o "Sair" do Perfil descarta as miniaturas', () => {
    expect(readFileSync(PROFILE, 'utf8')).toInclude('discardProofThumbnails')
  })

  it('o boot autenticado solta as miniaturas de outro motorista', () => {
    expect(readFileSync(MAIN, 'utf8')).toInclude('proofThumbnailStore.retainOnly')
  })
})
