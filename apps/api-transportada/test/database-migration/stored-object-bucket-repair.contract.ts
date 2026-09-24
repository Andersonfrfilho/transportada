/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 161: unidade do serviço de reparo, sem Postgres — a porta é uma fake em memória. Prova só
 * que `repairStoredObjectBuckets` repassa o bucket configurado à porta e devolve a contagem dela,
 * sem tocar em `objectKey` nem em qualquer outro dado sensível.
 */
import { describe, expect, test } from 'bun:test'

import {
  createDrizzleStoredObjectBucketRepairPort,
  repairStoredObjectBuckets,
  type StoredObjectBucketRepairPort,
} from '../../src/database/stored-object-bucket-repair.service.js'

/** Fake mínima da cadeia `update().set().where().returning()` do Drizzle, sem Postgres. */
function createFakeQueryable(returning: readonly { readonly id: string }[]) {
  const calls: { set?: unknown; table?: unknown; where?: unknown } = {}

  return {
    calls,
    update(table: unknown) {
      calls.table = table
      return {
        set(values: unknown) {
          calls.set = values
          return {
            where(condition: unknown) {
              calls.where = condition
              return { returning: async () => returning }
            },
          }
        },
      }
    },
  }
}

describe('repairStoredObjectBuckets', () => {
  test('repassa o bucket configurado à porta e devolve a contagem corrigida', async () => {
    let received: { readonly bucket: string } | undefined

    const port: StoredObjectBucketRepairPort = {
      async repairStaleBucket(input) {
        received = input
        return 5
      },
    }

    const repaired = await repairStoredObjectBuckets({
      bucket: 'transportada-staging-zjeaet',
      port,
    })

    expect(repaired).toBe(5)
    expect(received).toEqual({ bucket: 'transportada-staging-zjeaet' })
  })

  test('idempotente: sem linha para corrigir devolve 0, nunca falha', async () => {
    const port: StoredObjectBucketRepairPort = {
      async repairStaleBucket() {
        return 0
      },
    }

    const repaired = await repairStoredObjectBuckets({
      bucket: 'transportada-staging-zjeaet',
      port,
    })

    expect(repaired).toBe(0)
  })
})

describe('createDrizzleStoredObjectBucketRepairPort', () => {
  test('monta o UPDATE com o bucket novo no `set` e devolve a contagem das linhas retornadas', async () => {
    const fakeQueryable = createFakeQueryable([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const port = createDrizzleStoredObjectBucketRepairPort(fakeQueryable as never)

    const repaired = await port.repairStaleBucket({ bucket: 'transportada-staging-zjeaet' })

    expect(repaired).toBe(3)
    expect(fakeQueryable.calls.set).toEqual({ bucket: 'transportada-staging-zjeaet' })
    expect(fakeQueryable.calls.where).toBeDefined()
  })

  test('zero linha corrigida (segunda rodada do deploy) devolve 0, sem erro', async () => {
    const fakeQueryable = createFakeQueryable([])
    const port = createDrizzleStoredObjectBucketRepairPort(fakeQueryable as never)

    const repaired = await port.repairStaleBucket({ bucket: 'transportada-staging-zjeaet' })

    expect(repaired).toBe(0)
  })
})
