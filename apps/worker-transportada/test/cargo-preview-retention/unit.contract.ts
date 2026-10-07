/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { applyCargoPreviewRetentionUnit } from '../../src/cargo-preview-retention/application/cargo-preview-retention-unit.service.js'
import type {
  CargoPreviewRetentionGateway,
  CargoPreviewRetentionObject,
  CargoPreviewRetentionPreview,
  CargoPreviewRetentionRecord,
} from '../../src/cargo-preview-retention/application/cargo-preview-retention-unit.port.js'
import {
  CARGO_PREVIEW_RETENTION_DELETE_TIMEOUT_MS,
  CARGO_PREVIEW_RETENTION_MAX_OBJECTS_PER_PREVIEW,
} from '../../src/cargo-preview-retention/domain/cargo-preview-retention.constant.js'

const NOW = new Date('2026-12-31T12:00:00.000Z')
const PREVIEW: CargoPreviewRetentionPreview = { companyId: 'company-1', id: 'preview-1' }

function buildObject(index: number): CargoPreviewRetentionObject {
  const id = `object-${String(index).padStart(3, '0')}`
  return { bucket: 'bucket', id, key: `tenants/company-1/${id}` }
}

type FakeOptions = {
  readonly eligible?: boolean
  readonly itemsAnonymized?: number
  readonly objects?: readonly CargoPreviewRetentionObject[]
}

function buildGateway(options: FakeOptions = {}) {
  const calls: string[] = []
  const records: CargoPreviewRetentionRecord[] = []
  const marked: string[][] = []
  let limitAsked: number | undefined
  const gateway: CargoPreviewRetentionGateway = {
    anonymizeItems: async () => {
      calls.push('anonymize')
      return options.itemsAnonymized ?? 3
    },
    lockEligiblePreview: async () => {
      calls.push('lock-preview')
      return options.eligible === false ? undefined : PREVIEW
    },
    lockLiveObjects: async ({ limit }) => {
      calls.push('lock-objects')
      limitAsked = limit
      return (options.objects ?? [buildObject(1), buildObject(2)]).slice(0, limit + 1)
    },
    markObjectsDeleted: async (ids) => {
      calls.push('mark')
      marked.push([...ids])
    },
    recordRetention: async ({ record }) => {
      calls.push('record')
      records.push(record)
    },
    // Sem rollback real: o contrato afirma o que NÃO foi chamado antes da falha.
    runInTransaction: (work) => work(gateway),
  }
  return { calls, gateway, limitAsked: () => limitAsked, marked, records }
}

function buildDelete(failingKeys: readonly string[] = []) {
  const deleted: string[] = []
  const deleteObject = async (input: { readonly bucket: string; readonly key: string }) => {
    if (failingKeys.includes(input.key)) throw new Error('bucket offline')
    deleted.push(input.key)
  }
  return { deleteObject, deleted }
}

describe('a unidade da retenção: uma prévia (spec 237 T4.8)', () => {
  test('apaga os bytes ANTES de tocar o banco, e o evento fecha a unidade', async () => {
    const fake = buildGateway()
    const bucket = buildDelete()
    const order: string[] = []
    const result = await applyCargoPreviewRetentionUnit({
      deleteObject: async (input) => {
        order.push(`delete:${fake.calls.join('>')}`)
        await bucket.deleteObject(input)
      },
      gateway: fake.gateway,
      now: NOW,
      previewId: PREVIEW.id,
    })

    expect(result).toBe('retained')
    expect(order).toEqual(['delete:lock-preview>lock-objects', 'delete:lock-preview>lock-objects'])
    expect(fake.calls).toEqual(['lock-preview', 'lock-objects', 'anonymize', 'mark', 'record'])
    expect(fake.marked).toEqual([['object-001', 'object-002']])
    expect(fake.records).toEqual([{ itemsAnonymized: 3, objectsDeleted: 2, occurredAt: NOW }])
  })

  test('prévia que outro ciclo já tratou ou travou é pulada sem tocar em nada', async () => {
    const fake = buildGateway({ eligible: false })
    const bucket = buildDelete()

    const result = await applyCargoPreviewRetentionUnit({
      deleteObject: bucket.deleteObject,
      gateway: fake.gateway,
      now: NOW,
      previewId: PREVIEW.id,
    })

    expect(result).toBe('skipped')
    expect(fake.calls).toEqual(['lock-preview'])
    expect(bucket.deleted).toEqual([])
  })

  test('objeto já apagado converge: anonimiza e registra com zero objetos', async () => {
    const fake = buildGateway({ objects: [] })
    const bucket = buildDelete()

    const result = await applyCargoPreviewRetentionUnit({
      deleteObject: bucket.deleteObject,
      gateway: fake.gateway,
      now: NOW,
      previewId: PREVIEW.id,
    })

    expect(result).toBe('retained')
    expect(bucket.deleted).toEqual([])
    expect(fake.records).toEqual([{ itemsAnonymized: 3, objectsDeleted: 0, occurredAt: NOW }])
  })

  test('falha de bucket numa prévia: nada é anonimizado, marcado nem registrado', async () => {
    const fake = buildGateway()
    const bucket = buildDelete([buildObject(2).key])

    const result = await applyCargoPreviewRetentionUnit({
      deleteObject: bucket.deleteObject,
      gateway: fake.gateway,
      now: NOW,
      previewId: PREVIEW.id,
    })

    expect(result).toBe('failed')
    expect(fake.calls).toEqual(['lock-preview', 'lock-objects'])
    expect(fake.records).toEqual([])
    expect(fake.marked).toEqual([])
  })

  test('o delete do bucket tem prazo: pendurar vira falha, não trava a transação', async () => {
    const originalSetTimeout = globalThis.setTimeout
    const delays: unknown[] = []
    globalThis.setTimeout = ((handler: () => void, delay?: number) => {
      delays.push(delay)
      if (delay !== CARGO_PREVIEW_RETENTION_DELETE_TIMEOUT_MS)
        return originalSetTimeout(handler, delay)
      queueMicrotask(handler)
      return 0
    }) as unknown as typeof setTimeout
    try {
      const fake = buildGateway({ objects: [buildObject(1)] })

      const result = await applyCargoPreviewRetentionUnit({
        deleteObject: () => new Promise<void>(() => undefined),
        gateway: fake.gateway,
        now: NOW,
        previewId: PREVIEW.id,
      })

      expect(result).toBe('failed')
      expect(delays).toContain(CARGO_PREVIEW_RETENTION_DELETE_TIMEOUT_MS)
      expect(fake.records).toEqual([])
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }
  })

  test('acima do teto por prévia apaga só o teto, anonimiza e NÃO registra: continua depois', async () => {
    const total = CARGO_PREVIEW_RETENTION_MAX_OBJECTS_PER_PREVIEW + 5
    const objects = Array.from({ length: total }, (_unused, index) => buildObject(index + 1))
    const fake = buildGateway({ objects })
    const bucket = buildDelete()

    const result = await applyCargoPreviewRetentionUnit({
      deleteObject: bucket.deleteObject,
      gateway: fake.gateway,
      now: NOW,
      previewId: PREVIEW.id,
    })

    expect(result).toBe('partial')
    expect(fake.limitAsked()).toBe(CARGO_PREVIEW_RETENTION_MAX_OBJECTS_PER_PREVIEW)
    expect(bucket.deleted).toHaveLength(CARGO_PREVIEW_RETENTION_MAX_OBJECTS_PER_PREVIEW)
    expect(fake.marked[0]).toHaveLength(CARGO_PREVIEW_RETENTION_MAX_OBJECTS_PER_PREVIEW)
    expect(fake.calls).toEqual(['lock-preview', 'lock-objects', 'anonymize', 'mark'])
    expect(fake.records).toEqual([])
  })

  test('erro que não é do bucket sobe: não é engolido como falha de storage', async () => {
    const fake = buildGateway()
    const gateway: CargoPreviewRetentionGateway = {
      ...fake.gateway,
      anonymizeItems: async () => {
        throw new Error('deadlock detected')
      },
      runInTransaction: (work) => work(gateway),
    }

    await expect(
      applyCargoPreviewRetentionUnit({
        deleteObject: buildDelete().deleteObject,
        gateway,
        now: NOW,
        previewId: PREVIEW.id,
      }),
    ).rejects.toThrow('deadlock detected')
  })
})
