/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import type {
  CteBatchStatus,
  CteBatchSummary,
} from '@/modules/cte-batch/shared/cteBatchClient.service'
import {
  canTransmitBatch,
  canTransmitSelection,
} from '@/modules/cte-batch/shared/cteBatchItemActions.service'

import { CTE_BATCH, CTE_SUBMIT, loadFutureModule } from './cte-batch.fixture'

const PROGRESS_MODULE = '../../src/modules/cte-batch/shared/cteBatchProgress.service'
const APPLICATION_ROOT = new URL('../..', import.meta.url)
const WORKSPACE_HOOK_PATH = 'src/modules/cte-batch/hooks/useCteBatchWorkspace.hook.ts'
const ITEMS_QUERY_PATH = 'src/modules/cte-batch/queries/cteBatchItems.query.ts'

const SETTLED_STATUSES: readonly CteBatchStatus[] = ['cancelled', 'done']
const COMMANDABLE_STATUSES: readonly CteBatchStatus[] = ['draft', 'error', 'in_flight', 'submitted']

type StatusPage = Readonly<{ items: readonly Readonly<{ status: string }>[] }>

type CteBatchProgressModule = Readonly<{
  CTE_BATCH_PROGRESS_INTERVAL_MS: number
  resolveCteBatchProgressInterval: (page: StatusPage | undefined) => false | number
  resolveCteItemProgressInterval: (page: StatusPage | undefined) => false | number
}>

function batchWithStatus(status: CteBatchStatus): CteBatchSummary {
  return { ...CTE_BATCH, status }
}

function pageOf(statuses: readonly string[]): StatusPage {
  return { items: statuses.map((status) => ({ status })) }
}

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('CT-e transmission progress contract', () => {
  /**
   * Lote concluído ou cancelado não volta atrás. Em voo e submetido continuam oferecendo o botão:
   * é onde para o lote que perdeu um item na emissão, e retransmitir é o conserto — quem impede a
   * segunda emissão do item já autorizado é o backend, por item.
   */
  test('stops offering transmission for a batch already settled', () => {
    for (const status of SETTLED_STATUSES) {
      expect(canTransmitBatch({ batch: batchWithStatus(status), permissions: [CTE_SUBMIT] })).toBe(
        false,
      )
    }
    for (const status of COMMANDABLE_STATUSES) {
      expect(canTransmitBatch({ batch: batchWithStatus(status), permissions: [CTE_SUBMIT] })).toBe(
        true,
      )
    }
  })

  test('stops offering transmission for a selection whose batch is settled', () => {
    const groups = [{ batchId: CTE_BATCH.id, itemIds: ['item-1'] }] as const

    for (const status of SETTLED_STATUSES) {
      expect(
        canTransmitSelection({
          batchStatuses: new Map([[CTE_BATCH.id, status]]),
          groups,
          permissions: [CTE_SUBMIT],
        }),
      ).toBe(false)
    }
    expect(
      canTransmitSelection({
        batchStatuses: new Map([[CTE_BATCH.id, CTE_BATCH.status]]),
        groups,
        permissions: [CTE_SUBMIT],
      }),
    ).toBe(true)
  })

  /** O estado seguinte vem do worker, não de um comando: sem releitura a tela morre em "Submetido". */
  test('rereads the batch list only while the worker still owes a transition', async () => {
    const { CTE_BATCH_PROGRESS_INTERVAL_MS, resolveCteBatchProgressInterval } =
      await loadFutureModule<CteBatchProgressModule>(PROGRESS_MODULE)

    expect(CTE_BATCH_PROGRESS_INTERVAL_MS).toBeGreaterThan(0)
    expect(resolveCteBatchProgressInterval(pageOf(['done', 'submitted']))).toBe(
      CTE_BATCH_PROGRESS_INTERVAL_MS,
    )
    expect(resolveCteBatchProgressInterval(pageOf(['in_flight']))).toBe(
      CTE_BATCH_PROGRESS_INTERVAL_MS,
    )
    expect(resolveCteBatchProgressInterval(pageOf(['done', 'error', 'draft', 'cancelled']))).toBe(
      false,
    )
    expect(resolveCteBatchProgressInterval(pageOf([]))).toBe(false)
    expect(resolveCteBatchProgressInterval(undefined)).toBe(false)
  })

  test('rereads the CT-e list only while an item is still in transit', async () => {
    const { CTE_BATCH_PROGRESS_INTERVAL_MS, resolveCteItemProgressInterval } =
      await loadFutureModule<CteBatchProgressModule>(PROGRESS_MODULE)

    for (const status of ['in_flight', 'pending', 'retry_scheduled']) {
      expect(resolveCteItemProgressInterval(pageOf(['authorized', status]))).toBe(
        CTE_BATCH_PROGRESS_INTERVAL_MS,
      )
    }
    expect(resolveCteItemProgressInterval(pageOf(['authorized', 'rejected', 'cancelled']))).toBe(
      false,
    )
    expect(resolveCteItemProgressInterval(undefined)).toBe(false)
  })

  test('wires the progress interval into both listing queries', async () => {
    const [workspaceHook, itemsQuery] = await Promise.all([
      readApplicationFile(WORKSPACE_HOOK_PATH),
      readApplicationFile(ITEMS_QUERY_PATH),
    ])

    expect(workspaceHook).toContain('resolveCteBatchProgressInterval')
    expect(workspaceHook).toContain('refetchInterval')
    expect(itemsQuery).toContain('resolveCteItemProgressInterval')
    expect(itemsQuery).toContain('refetchInterval')
  })
})
