/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './cte-batch.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const SUBMISSION_MODULE = '../../src/modules/cte-batch/shared/cteBatchSubmissionQueue.service'

const SELECTION_BAR = 'src/modules/cte-batch/components/CteBatchSelectionBar.component.tsx'
const SUBMISSION_HOOK = 'src/modules/cte-batch/hooks/useCteBatchSubmission.hook.ts'
const WORKSPACE_PAGE = 'src/modules/cte-batch/pages/CteBatchWorkspace.page.tsx'

const BATCHES = [
  { id: '00000000-0000-4000-8000-000000000801', name: 'Lote CT-e A' },
  { id: '00000000-0000-4000-8000-000000000802', name: 'Lote CT-e B' },
  { id: '00000000-0000-4000-8000-000000000803', name: 'Lote CT-e C' },
  { id: '00000000-0000-4000-8000-000000000804', name: 'Lote CT-e D' },
  { id: '00000000-0000-4000-8000-000000000805', name: 'Lote CT-e E' },
] as const

const REJECTED_BATCH_ERROR_CODE = 'CTE_BATCH_NOT_SUBMITTABLE'

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

/** Segura o lote por alguns microtasks para que a fila precise decidir quantos correm juntos. */
async function tick(times: number): Promise<void> {
  for (let index = 0; index < times; index += 1) await Promise.resolve()
}

describe('cte batch submission progress contract', () => {
  test('the queue keeps only a few batches in flight instead of firing every request at once', async () => {
    const { CTE_BATCH_SUBMIT_CONCURRENCY, submitCteBatches } =
      await loadFutureModule<CteBatchSubmissionModule>(SUBMISSION_MODULE)
    const submitted: string[] = []
    let inFlight = 0
    let maxInFlight = 0

    await submitCteBatches({
      batches: BATCHES,
      submitBatch: async (batchId) => {
        submitted.push(batchId)
        inFlight += 1
        maxInFlight = Math.max(maxInFlight, inFlight)
        await tick(3)
        inFlight -= 1
      },
    })

    expect(CTE_BATCH_SUBMIT_CONCURRENCY).toBeLessThan(BATCHES.length)
    expect(maxInFlight).toBe(CTE_BATCH_SUBMIT_CONCURRENCY)
    expect(submitted).toHaveLength(BATCHES.length)
    expect([...submitted].sort()).toEqual(BATCHES.map((batch) => batch.id).toSorted())
  })

  test('every finished batch is announced with its own result and the running counter', async () => {
    const { submitCteBatches } = await loadFutureModule<CteBatchSubmissionModule>(SUBMISSION_MODULE)
    const events: { batchName: string; completed: number; total: number }[] = []

    await submitCteBatches({
      batches: BATCHES.slice(0, 3),
      onProgress: (event) => {
        events.push({
          batchName: event.outcome.batchName,
          completed: event.completed,
          total: event.total,
        })
      },
      submitBatch: () => Promise.resolve(),
    })

    expect(events.map((event) => event.completed)).toEqual([1, 2, 3])
    expect(events.every((event) => event.total === 3)).toBeTrue()
    expect(events.map((event) => event.batchName).toSorted()).toEqual([
      'Lote CT-e A',
      'Lote CT-e B',
      'Lote CT-e C',
    ])
  })

  test('a refused batch keeps its own error code without stopping the rest of the queue', async () => {
    const { submitCteBatches } = await loadFutureModule<CteBatchSubmissionModule>(SUBMISSION_MODULE)
    const refusedId = BATCHES[1].id

    const outcomes = await submitCteBatches({
      batches: BATCHES.slice(0, 3),
      submitBatch: (batchId) =>
        batchId === refusedId
          ? Promise.reject(new Error(REJECTED_BATCH_ERROR_CODE))
          : Promise.resolve(),
    })

    /** A ordem é a da seleção: o resultado fica na posição do lote, não na de quem terminou antes. */
    expect(outcomes.map((outcome) => outcome.batchId)).toEqual([
      BATCHES[0].id,
      BATCHES[1].id,
      BATCHES[2].id,
    ])
    expect(outcomes[0]?.errorCode).toBeUndefined()
    expect(outcomes[1]?.errorCode).toBe(REJECTED_BATCH_ERROR_CODE)
    expect(outcomes[2]?.errorCode).toBeUndefined()
  })

  test('the summary separates what was queued from what failed and keeps the percentage whole', async () => {
    const { resolveCteBatchSubmissionProgress } =
      await loadFutureModule<CteBatchSubmissionModule>(SUBMISSION_MODULE)

    expect(
      resolveCteBatchSubmissionProgress({
        completed: 1,
        outcomes: [{ batchId: BATCHES[0].id, batchName: BATCHES[0].name }],
        total: 3,
      }),
    ).toEqual({ errorCount: 0, isComplete: false, percent: 33, successCount: 1 })
    expect(
      resolveCteBatchSubmissionProgress({
        completed: 2,
        outcomes: [
          { batchId: BATCHES[0].id, batchName: BATCHES[0].name },
          {
            batchId: BATCHES[1].id,
            batchName: BATCHES[1].name,
            errorCode: REJECTED_BATCH_ERROR_CODE,
          },
        ],
        total: 2,
      }),
    ).toEqual({ errorCount: 1, isComplete: true, percent: 100, successCount: 1 })
  })

  test('the bulk bar reports the queue with the same progress bar the invoicing uses', async () => {
    const [selectionBar, hook, page] = await Promise.all([
      readModule(SELECTION_BAR),
      readModule(SUBMISSION_HOOK),
      readModule(WORKSPACE_PAGE),
    ])

    expect(selectionBar).toContain('ProgressBar')
    expect(selectionBar).toContain('transmission.progress')
    /** Disparar tudo de uma vez é justamente o que a fila veio impedir. */
    expect(selectionBar).not.toContain('forEach(onSubmit)')
    expect(hook).toContain('submitCteBatches')
    expect(hook).toContain('resolveCteBatchSubmissionProgress')
    expect(hook).toContain('onProgress')
    expect(page).toContain('useCteBatchSubmission')
  })
})

type CteBatchSubmissionOutcome = Readonly<{
  batchId: string
  batchName: string
  errorCode?: string
}>

type CteBatchSubmissionModule = {
  readonly CTE_BATCH_SUBMIT_CONCURRENCY: number
  readonly resolveCteBatchSubmissionProgress: (
    input: Readonly<{
      completed: number
      outcomes: readonly CteBatchSubmissionOutcome[]
      total: number
    }>,
  ) => Readonly<{
    errorCount: number
    isComplete: boolean
    percent: number
    successCount: number
  }>
  readonly submitCteBatches: (
    input: Readonly<{
      batches: readonly Readonly<{ id: string; name: string }>[]
      onProgress?: (
        event: Readonly<{
          completed: number
          outcome: CteBatchSubmissionOutcome
          total: number
        }>,
      ) => void
      submitBatch: (batchId: string) => Promise<unknown>
    }>,
  ) => Promise<readonly CteBatchSubmissionOutcome[]>
}
