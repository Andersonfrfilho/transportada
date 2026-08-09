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
const SELECTION_BAR_PATH = 'src/modules/cte-batch/components/CteBatchSelectionBar.component.tsx'
const SUBMISSION_HOOK_PATH = 'src/modules/cte-batch/hooks/useCteBatchSubmission.hook.ts'
const COUNTDOWN_PATH = 'src/modules/cte-batch/components/RefreshCountdown.component.tsx'
const WORKSPACE_PAGE_PATH = 'src/modules/cte-batch/pages/CteBatchWorkspace.page.tsx'
const LOCALE_PATH = 'src/modules/cte-batch/locales/cteBatch.locale.json'

const SETTLED_STATUSES: readonly CteBatchStatus[] = ['cancelled', 'done']
const COMMANDABLE_STATUSES: readonly CteBatchStatus[] = ['draft', 'error', 'in_flight', 'submitted']

type StatusPage = Readonly<{ items: readonly Readonly<{ status: string }>[] }>

type TransmissionSummary = Readonly<{
  isComplete: boolean
  percent: number
  settled: number
  total: number
  transmitting: number
}>

type CteBatchProgressModule = Readonly<{
  CTE_BATCH_PROGRESS_INTERVAL_MS: number
  resolveCteBatchProgressInterval: (page: StatusPage | undefined) => false | number
  resolveCteBatchTransmissionSummary: (
    input: Readonly<{
      batchIds: readonly string[]
      batches: readonly Readonly<{ id: string; status: string }>[]
    }>,
  ) => TransmissionSummary
  resolveCteItemProgressInterval: (page: StatusPage | undefined) => false | number
  resolveSecondsUntilNextRefresh: (
    input: Readonly<{ intervalMs: number; now: number; updatedAt: number }>,
  ) => number
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

  /**
   * O que o worker deve à SEFAZ não é o que a fila de submissão já entregou. Enquanto um lote
   * responder "em voo" ou "submetido", a barra não pode dizer 100% — foi assim que a tela anunciou
   * transmissão concluída com três CT-es ainda presos em "Transmitindo".
   */
  test('never reaches 100% while a batch is still in transit', async () => {
    const { resolveCteBatchTransmissionSummary } =
      await loadFutureModule<CteBatchProgressModule>(PROGRESS_MODULE)

    expect(
      resolveCteBatchTransmissionSummary({
        batchIds: ['batch-1', 'batch-2'],
        batches: [
          { id: 'batch-1', status: 'done' },
          { id: 'batch-2', status: 'in_flight' },
        ],
      }),
    ).toEqual({ isComplete: false, percent: 50, settled: 1, total: 2, transmitting: 1 })

    for (const status of ['in_flight', 'submitted']) {
      expect(
        resolveCteBatchTransmissionSummary({
          batchIds: ['batch-1'],
          batches: [{ id: 'batch-1', status }],
        }),
      ).toEqual({ isComplete: false, percent: 0, settled: 0, total: 1, transmitting: 1 })
    }
  })

  /** Lote que não veio na página lida é desconhecido, não concluído: contar como pronto era mentir. */
  test('treats a batch missing from the polled page as still in transit', async () => {
    const { resolveCteBatchTransmissionSummary } =
      await loadFutureModule<CteBatchProgressModule>(PROGRESS_MODULE)

    expect(
      resolveCteBatchTransmissionSummary({
        batchIds: ['batch-1', 'batch-2'],
        batches: [{ id: 'batch-1', status: 'done' }],
      }),
    ).toEqual({ isComplete: false, percent: 50, settled: 1, total: 2, transmitting: 1 })
  })

  /**
   * Entre o POST e a primeira releitura a lista ainda devolve o lote em "Rascunho". Ler ausência de
   * transmissão como conclusão fazia a barra piscar 100% no instante seguinte ao clique — só um
   * estado terminal encerra o lote; qualquer outro é notícia velha.
   */
  test('treats the stale pre-submission status as still in transit', async () => {
    const { resolveCteBatchTransmissionSummary } =
      await loadFutureModule<CteBatchProgressModule>(PROGRESS_MODULE)

    expect(
      resolveCteBatchTransmissionSummary({
        batchIds: ['batch-1'],
        batches: [{ id: 'batch-1', status: 'draft' }],
      }),
    ).toEqual({ isComplete: false, percent: 0, settled: 0, total: 1, transmitting: 1 })
  })

  test('completes only when every batch left the transmission statuses', async () => {
    const { resolveCteBatchTransmissionSummary } =
      await loadFutureModule<CteBatchProgressModule>(PROGRESS_MODULE)

    expect(
      resolveCteBatchTransmissionSummary({
        batchIds: ['batch-1', 'batch-2'],
        batches: [
          { id: 'batch-1', status: 'done' },
          { id: 'batch-2', status: 'error' },
        ],
      }),
    ).toEqual({ isComplete: true, percent: 100, settled: 2, total: 2, transmitting: 0 })

    expect(resolveCteBatchTransmissionSummary({ batchIds: [], batches: [] })).toEqual({
      isComplete: false,
      percent: 0,
      settled: 0,
      total: 0,
      transmitting: 0,
    })
  })

  /** Sem contador a tela parece travada: o usuário não sabe se a releitura vem em 1s ou nunca. */
  test('counts the seconds left until the next reread', async () => {
    const { CTE_BATCH_PROGRESS_INTERVAL_MS, resolveSecondsUntilNextRefresh } =
      await loadFutureModule<CteBatchProgressModule>(PROGRESS_MODULE)

    const updatedAt = 1_000_000

    expect(
      resolveSecondsUntilNextRefresh({
        intervalMs: CTE_BATCH_PROGRESS_INTERVAL_MS,
        now: updatedAt,
        updatedAt,
      }),
    ).toBe(Math.ceil(CTE_BATCH_PROGRESS_INTERVAL_MS / 1_000))
    expect(
      resolveSecondsUntilNextRefresh({ intervalMs: 3_000, now: updatedAt + 1_200, updatedAt }),
    ).toBe(2)
    expect(
      resolveSecondsUntilNextRefresh({ intervalMs: 3_000, now: updatedAt + 9_000, updatedAt }),
    ).toBe(0)
    expect(resolveSecondsUntilNextRefresh({ intervalMs: 3_000, now: 0, updatedAt: 0 })).toBe(3)
  })

  test('shows the real transmission progress on the selection bar', async () => {
    const [selectionBar, submissionHook] = await Promise.all([
      readApplicationFile(SELECTION_BAR_PATH),
      readApplicationFile(SUBMISSION_HOOK_PATH),
    ])

    expect(selectionBar).toContain('resolveCteBatchTransmissionSummary')
    expect(selectionBar).toContain('transmission.awaiting')
    expect(submissionHook).toContain('submittedBatchIds')
  })

  /** Releitura silenciosa parece tela congelada: o contador é o que prova que a página está viva. */
  test('shows a countdown to the next reread while something is in transit', async () => {
    const [countdown, page, locale] = await Promise.all([
      readApplicationFile(COUNTDOWN_PATH),
      readApplicationFile(WORKSPACE_PAGE_PATH),
      readApplicationFile(LOCALE_PATH),
    ])

    expect(countdown).toContain('resolveSecondsUntilNextRefresh')
    expect(countdown).toContain('clearInterval')
    expect(page).toContain('RefreshCountdown')
    expect(page).toContain('dataUpdatedAt')

    const sections = JSON.parse(locale) as Record<string, Record<string, string>>
    const refresh = sections['refresh'] ?? {}
    expect(refresh['countdown']).toContain('{{seconds}}')
    expect(refresh['now']).toBeDefined()
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
