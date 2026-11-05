/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 091 T019 / P4: substituir apaga o documento anterior **do bucket**. O que se confere aqui é o
 * bucket — um `Map` de chaves, não a lista de linhas —, porque linha apagada com objeto esquecido é
 * PII que ninguém sabe que existe.
 */
import { describe, expect, test } from 'bun:test'

import type {
  CreateFleetDriverAttachmentInput,
  FleetDriverAttachment,
  FleetDriverAttachmentRepositoryPort,
} from '../../src/fleet/application/fleet-driver-attachment.port.js'
import { createFleetDriverAttachmentUseCase } from '../../src/fleet/application/fleet-driver-attachment.use-case.js'
import { FleetDriverAttachmentTypeTakenError } from '../../src/fleet/domain/fleet-driver-attachment.error.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const DRIVER_ID = '00000000-0000-4000-8000-0000000000d1'
const USER_ID = '00000000-0000-4000-8000-0000000000a1'
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34])
const BUCKET = 'bucket'

type Row = Readonly<{ id: string; key: string; type: string }>

/** O bucket e a tabela em memória, para a asserção olhar os dois lados. */
function buildWorld(
  options: Readonly<{ createError?: Error; failDeletingOldObject?: boolean }> = {},
) {
  const bucket = new Set<string>()
  const rows: Row[] = []
  const events: string[] = []
  let sequence = 0
  let firstStoredKey = ''

  const repository: FleetDriverAttachmentRepositoryPort = {
    async create(input: CreateFleetDriverAttachmentInput): Promise<FleetDriverAttachment> {
      events.push('create')
      if (options.createError !== undefined) throw options.createError
      if (input.replaceAttachmentId !== undefined) {
        const index = rows.findIndex((row) => row.id === input.replaceAttachmentId)
        if (index >= 0) rows.splice(index, 1)
      }
      sequence += 1
      const id = `attachment-${sequence}`
      rows.push({ id, key: input.objectKey, type: input.type })
      return { createdAt: 'now', id, type: input.type, uploadedBy: input.uploadedBy }
    },
    async decideSuggestion() {
      return 'not_found'
    },
    async driverExists() {
      return true
    },
    async findByType({ type }) {
      const row = rows.find((candidate) => candidate.type === type)
      return row === undefined
        ? null
        : {
            id: row.id,
            location: { bucket: BUCKET, objectKey: row.key, storedObjectId: `object-${row.id}` },
          }
    },
    async findLocation() {
      return null
    },
    async list() {
      return []
    },
    async readSuggestion() {
      return { fields: null, isFound: false }
    },
    async remove() {
      return false
    },
  }
  const useCase = createFleetDriverAttachmentUseCase({
    bucket: BUCKET,
    repository,
    storage: {
      async createSignedDownload() {
        return new URL('https://bucket.example.test/signed')
      },
      async deleteObject({ key }) {
        events.push('delete-object')
        // Só o objeto que já estava no bucket falha ao sair; o cleanup do recém-subido funciona.
        if (options.failDeletingOldObject === true && key === firstStoredKey) {
          throw new Error('bucket fora do ar')
        }
        bucket.delete(key)
      },
      async storeObject({ key }) {
        events.push('store')
        if (firstStoredKey === '') firstStoredKey = key
        bucket.add(key)
      },
    },
  })

  return { bucket, events, rows, useCase }
}

function attach(world: ReturnType<typeof buildWorld>, type: 'cnh' | 'other' = 'cnh') {
  return world.useCase.attach({
    bytes: PDF_BYTES,
    companyId: COMPANY_ID,
    correlationId: 'correlation-091',
    declaredMimeType: 'application/pdf',
    driverId: DRIVER_ID,
    fileName: 'documento.pdf',
    type,
    uploadedBy: USER_ID,
  })
}

describe('substituir o documento do motorista (spec 091 T019)', () => {
  test('o objeto anterior sai do bucket e só o novo fica, linha e objeto na mesma conta', async () => {
    const world = buildWorld()
    await attach(world)
    const first = [...world.bucket]

    await attach(world)

    expect(first).toHaveLength(1)
    expect(world.bucket.size).toBe(1)
    expect(world.bucket.has(first[0] ?? '')).toBe(false)
    expect(world.rows).toHaveLength(1)
    expect([...world.bucket]).toEqual(world.rows.map((row) => row.key))
  })

  test('o novo sobe antes de o antigo sair: se o envio falha, o documento antigo continua', async () => {
    const world = buildWorld()
    await attach(world)

    const events = world.events.length
    await attach(world)

    expect(world.events.slice(events)).toEqual(['store', 'delete-object', 'create'])
  })

  test('só o outro aceita vários: substituir não vale para ele', async () => {
    const world = buildWorld()

    await attach(world, 'other')
    await attach(world, 'other')

    expect(world.bucket.size).toBe(2)
    expect(world.rows).toHaveLength(2)
    expect(world.events).not.toContain('delete-object')
  })

  test('a corrida perdida apaga o objeto novo, sem deixar órfão', async () => {
    const world = buildWorld({ createError: new FleetDriverAttachmentTypeTakenError() })

    await expect(attach(world)).rejects.toBeInstanceOf(FleetDriverAttachmentTypeTakenError)

    expect(world.bucket.size).toBe(0)
  })

  /** Apagar o antigo falhou: nada trocou, e o objeto novo não fica sozinho no bucket. */
  test('falha ao apagar o anterior desfaz o novo e a troca não acontece', async () => {
    const world = buildWorld({ failDeletingOldObject: true })
    await attach(world)
    const previousKey = [...world.bucket][0]

    await expect(attach(world)).rejects.toThrow('bucket fora do ar')

    expect(world.rows).toHaveLength(1)
    expect([...world.bucket]).toEqual([previousKey ?? 'missing'])
    expect(world.rows[0]?.key).toBe(previousKey ?? 'missing')
  })
})
