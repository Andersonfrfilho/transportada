/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { expireOccurrenceUploadUnit } from '../../src/trip-occurrence-upload-expire/application/trip-occurrence-upload-expire-unit.service.js'
import type {
  PendingOccurrenceUpload,
  TripOccurrenceUploadExpireGateway,
} from '../../src/trip-occurrence-upload-expire/application/trip-occurrence-upload-expire-unit.port.js'

const BEFORE = new Date('2026-09-24T00:00:00.000Z')

type FakeState = {
  readonly candidate?: PendingOccurrenceUpload
  /** `true` simula `skip locked` perdendo o lock para outra execução ou um `confirm` concorrente. */
  readonly lockedElsewhere?: boolean
}

function buildFakeGateway(state: FakeState, calls: string[]): TripOccurrenceUploadExpireGateway {
  const gateway: TripOccurrenceUploadExpireGateway = {
    async lockExpiredPendingUpload({ id }) {
      calls.push(`lockExpiredPendingUpload:${id}`)
      if (state.lockedElsewhere === true) return undefined
      return state.candidate
    },
    async markExpired(id) {
      calls.push(`markExpired:${id}`)
    },
    async runInTransaction(work) {
      return work(gateway)
    },
  }
  return gateway
}

describe('unidade de expiração do pedido de upload de ocorrência (achado [3], spec 179)', () => {
  test('apaga os bytes antes de marcar expired, na ordem: lock → delete → update', async () => {
    const calls: string[] = []
    const gateway = buildFakeGateway(
      { candidate: { bucket: 'transportada-private', id: 'upload-1', key: 'key-1' } },
      calls,
    )
    const deletedKeys: string[] = []

    const outcome = await expireOccurrenceUploadUnit({
      before: BEFORE,
      deleteObject: async ({ key }) => {
        deletedKeys.push(key)
      },
      gateway,
      id: 'upload-1',
    })

    expect(outcome).toEqual({ result: 'expired' })
    expect(deletedKeys).toEqual(['key-1'])
    expect(calls).toEqual(['lockExpiredPendingUpload:upload-1', 'markExpired:upload-1'])
  })

  test('converge sem apagar nada quando o lock vai para outra execução (ou um confirm concorrente)', async () => {
    const calls: string[] = []
    const gateway = buildFakeGateway({ lockedElsewhere: true }, calls)

    const outcome = await expireOccurrenceUploadUnit({
      before: BEFORE,
      deleteObject: async () => {
        throw new Error('não deveria chamar deleteObject sem lock')
      },
      gateway,
      id: 'upload-1',
    })

    expect(outcome).toEqual({ result: 'missing' })
    expect(calls).toEqual(['lockExpiredPendingUpload:upload-1'])
  })

  /**
   * A exclusão é idempotente do lado do storage — a rotina não precisa saber se o objeto já não
   * existia (motorista nunca chegou a subir nada). `deleteObject` resolver sem erro basta.
   */
  test('marca expired mesmo quando o objeto já não existe no bucket', async () => {
    const calls: string[] = []
    const gateway = buildFakeGateway(
      { candidate: { bucket: 'transportada-private', id: 'upload-2', key: 'key-2' } },
      calls,
    )

    const outcome = await expireOccurrenceUploadUnit({
      before: BEFORE,
      deleteObject: async () => {},
      gateway,
      id: 'upload-2',
    })

    expect(outcome).toEqual({ result: 'expired' })
    expect(calls).toEqual(['lockExpiredPendingUpload:upload-2', 'markExpired:upload-2'])
  })

  test('falha de storage não toca o banco', async () => {
    const calls: string[] = []
    const gateway = buildFakeGateway(
      { candidate: { bucket: 'transportada-private', id: 'upload-3', key: 'key-3' } },
      calls,
    )

    const outcome = await expireOccurrenceUploadUnit({
      before: BEFORE,
      deleteObject: async () => {
        throw new Error('bucket unreachable')
      },
      gateway,
      id: 'upload-3',
    })

    expect(outcome).toEqual({ result: 'failed' })
    expect(calls).toEqual(['lockExpiredPendingUpload:upload-3'])
  })
})
