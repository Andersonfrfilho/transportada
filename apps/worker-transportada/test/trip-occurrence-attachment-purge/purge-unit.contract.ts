/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { purgeOccurrenceAttachmentUnit } from '../../src/trip-occurrence-attachment-purge/application/trip-occurrence-attachment-purge-unit.service.js'
import type {
  OccurrenceAttachmentPurgeAttachment,
  OccurrenceAttachmentPurgeGateway,
  OccurrenceAttachmentPurgeStoredObject,
} from '../../src/trip-occurrence-attachment-purge/application/trip-occurrence-attachment-purge-unit.port.js'

type FakeState = {
  readonly attachment?: OccurrenceAttachmentPurgeAttachment
  readonly objects: readonly OccurrenceAttachmentPurgeStoredObject[]
  /** Ids que o lock **não** consegue pegar — simula `skip locked` perdendo para outra execução. */
  readonly lockedElsewhere?: readonly string[]
}

function buildFakeGateway(state: FakeState, calls: string[]): OccurrenceAttachmentPurgeGateway {
  const gateway: OccurrenceAttachmentPurgeGateway = {
    async deleteAttachment(attachmentId) {
      calls.push(`deleteAttachment:${attachmentId}`)
    },
    async findAttachmentByObjectId() {
      return state.attachment
    },
    async lockStoredObjects(ids) {
      calls.push(`lockStoredObjects:${[...ids].sort().join(',')}`)
      const locked = state.objects.filter(
        (object) => ids.includes(object.id) && !(state.lockedElsewhere ?? []).includes(object.id),
      )
      return [...locked].sort((left, right) => (left.id < right.id ? -1 : 1))
    },
    async markObjectsDeleted(ids) {
      calls.push(`markObjectsDeleted:${[...ids].sort().join(',')}`)
    },
    async runInTransaction(work) {
      return work(gateway)
    },
  }
  return gateway
}

describe('unidade de expurgo do anexo de ocorrência (ajustes 1–6)', () => {
  test('apaga os bytes dos dois objetos antes de tocar o banco, na ordem: delete → delete → update', async () => {
    const calls: string[] = []
    const gateway = buildFakeGateway(
      {
        attachment: {
          id: 'attachment-1',
          storedObjectId: 'object-a',
          thumbnailObjectId: 'object-b',
        },
        objects: [
          { bucket: 'transportada-private', id: 'object-a', key: 'key-a' },
          { bucket: 'transportada-private', id: 'object-b', key: 'key-b' },
        ],
      },
      calls,
    )
    const deletedKeys: string[] = []

    const outcome = await purgeOccurrenceAttachmentUnit({
      deleteObject: async ({ key }) => {
        deletedKeys.push(key)
      },
      gateway,
      objectId: 'object-a',
    })

    expect(outcome).toEqual({ result: 'deleted' })
    expect(deletedKeys).toEqual(['key-a', 'key-b'])
    // Ordem invariante em código (ajuste 2): os dois `deleteObject` terminam antes de o `DELETE` do
    // anexo e o `UPDATE` dos objetos aparecerem na trilha de chamadas.
    expect(calls).toEqual([
      'lockStoredObjects:object-a,object-b',
      'deleteAttachment:attachment-1',
      'markObjectsDeleted:object-a,object-b',
    ])
  })

  /** Ajuste 6: objeto vencido sem linha de anexo — apaga os bytes e marca `deleted`, sem `DELETE`. */
  test('objeto órfão sai sozinho: apaga os bytes e marca deleted, sem linha de anexo a remover', async () => {
    const calls: string[] = []
    const gateway = buildFakeGateway(
      { objects: [{ bucket: 'transportada-private', id: 'object-orphan', key: 'key-orphan' }] },
      calls,
    )

    const outcome = await purgeOccurrenceAttachmentUnit({
      deleteObject: async () => {},
      gateway,
      objectId: 'object-orphan',
    })

    expect(outcome).toEqual({ result: 'deleted' })
    expect(calls).toEqual(['lockStoredObjects:object-orphan', 'markObjectsDeleted:object-orphan'])
  })

  /** CA13: objeto ausente (lock perdido para outra execução) converge, não falha o ciclo. */
  test('converge quando o lock do objeto órfão vai para outra execução', async () => {
    const calls: string[] = []
    const gateway = buildFakeGateway(
      {
        lockedElsewhere: ['object-orphan'],
        objects: [{ bucket: 'transportada-private', id: 'object-orphan', key: 'key-orphan' }],
      },
      calls,
    )

    const outcome = await purgeOccurrenceAttachmentUnit({
      deleteObject: async () => {
        throw new Error('não deveria chamar deleteObject sem lock')
      },
      gateway,
      objectId: 'object-orphan',
    })

    expect(outcome).toEqual({ result: 'missing' })
  })

  /** A miniatura perdeu o lock: a unidade inteira converge, nunca apaga só o original. */
  test('converge a unidade inteira quando um dos dois objetos perde o lock', async () => {
    const calls: string[] = []
    const gateway = buildFakeGateway(
      {
        attachment: {
          id: 'attachment-1',
          storedObjectId: 'object-a',
          thumbnailObjectId: 'object-b',
        },
        lockedElsewhere: ['object-b'],
        objects: [
          { bucket: 'transportada-private', id: 'object-a', key: 'key-a' },
          { bucket: 'transportada-private', id: 'object-b', key: 'key-b' },
        ],
      },
      calls,
    )
    const deletedKeys: string[] = []

    const outcome = await purgeOccurrenceAttachmentUnit({
      deleteObject: async ({ key }) => {
        deletedKeys.push(key)
      },
      gateway,
      objectId: 'object-a',
    })

    expect(outcome).toEqual({ result: 'missing' })
    expect(deletedKeys).toEqual([])
    expect(calls).toEqual(['lockStoredObjects:object-a,object-b'])
  })

  /** Ajuste 4: a segunda exclusão de bucket falha — rollback da unidade inteira, nada no banco. */
  test('falha de storage na segunda exclusão não toca o banco', async () => {
    const calls: string[] = []
    const gateway = buildFakeGateway(
      {
        attachment: {
          id: 'attachment-1',
          storedObjectId: 'object-a',
          thumbnailObjectId: 'object-b',
        },
        objects: [
          { bucket: 'transportada-private', id: 'object-a', key: 'key-a' },
          { bucket: 'transportada-private', id: 'object-b', key: 'key-b' },
        ],
      },
      calls,
    )

    const outcome = await purgeOccurrenceAttachmentUnit({
      deleteObject: async ({ key }) => {
        if (key === 'key-b') throw new Error('bucket unreachable')
      },
      gateway,
      objectId: 'object-a',
    })

    expect(outcome).toEqual({ result: 'failed' })
    expect(calls).toEqual(['lockStoredObjects:object-a,object-b'])
  })

  test('miniatura ausente (foto do WhatsApp, D14): só o original é travado e apagado', async () => {
    const calls: string[] = []
    const gateway = buildFakeGateway(
      {
        attachment: { id: 'attachment-1', storedObjectId: 'object-a', thumbnailObjectId: null },
        objects: [{ bucket: 'transportada-private', id: 'object-a', key: 'key-a' }],
      },
      calls,
    )

    const outcome = await purgeOccurrenceAttachmentUnit({
      deleteObject: async () => {},
      gateway,
      objectId: 'object-a',
    })

    expect(outcome).toEqual({ result: 'deleted' })
    expect(calls).toEqual([
      'lockStoredObjects:object-a',
      'deleteAttachment:attachment-1',
      'markObjectsDeleted:object-a',
    ])
  })
})
