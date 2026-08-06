/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { CTE_MANAGE, CTE_SUBMIT, loadFutureModule } from './cte-batch.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const ACTIONS_MODULE = '../../src/modules/cte-batch/shared/cteBatchItemActions.service'
const ITEM_TABLE_HOOK_PATH = 'src/modules/cte-batch/hooks/useCteItemTable.hook.ts'

const DRAFT_GROUP = { batchId: 'batch-draft', itemIds: ['item-1'] } as const
const IN_FLIGHT_GROUP = { batchId: 'batch-in-flight', itemIds: ['item-2'] } as const
const DONE_GROUP = { batchId: 'batch-done', itemIds: ['item-3'] } as const
const CANCELLED_GROUP = { batchId: 'batch-cancelled', itemIds: ['item-4'] } as const
const UNKNOWN_GROUP = { batchId: 'batch-unknown', itemIds: ['item-5'] } as const
const BATCH_STATUSES = new Map([
  [DRAFT_GROUP.batchId, 'draft'],
  [IN_FLIGHT_GROUP.batchId, 'in_flight'],
  [DONE_GROUP.batchId, 'done'],
  [CANCELLED_GROUP.batchId, 'cancelled'],
] as const)

type CteItemBatchGroup = Readonly<{ batchId: string; itemIds: readonly string[] }>

type SelectionInput = Readonly<{
  batchStatuses: ReadonlyMap<string, string>
  groups: readonly CteItemBatchGroup[]
  permissions: readonly string[]
}>

type CteBatchActionsModule = Record<string, unknown> & {
  readonly canTransmitSelection: (input: SelectionInput) => boolean
  readonly selectTransmittableGroups: (
    input: Readonly<{
      batchStatuses: ReadonlyMap<string, string>
      groups: readonly CteItemBatchGroup[]
    }>,
  ) => readonly CteItemBatchGroup[]
}

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('CT-e partial transmission contract', () => {
  /**
   * Um lote perde um item quando a emissão falha no meio, e ele fica `in_flight` com um CT-e
   * pendente. Transmitir de novo é o conserto: o backend pula o que já autorizou e emite só o
   * que ficou. Com o botão travado no status do lote não havia caminho nenhum na tela.
   */
  test('lets a partially issued batch be transmitted again', async () => {
    const { canTransmitSelection } = await loadFutureModule<CteBatchActionsModule>(ACTIONS_MODULE)

    expect(
      canTransmitSelection({
        batchStatuses: BATCH_STATUSES,
        groups: [IN_FLIGHT_GROUP],
        permissions: [CTE_SUBMIT],
      }),
    ).toBe(true)
  })

  /** Lote encerrado ou cancelado não volta atrás, e o status desconhecido não é convite. */
  test('refuses a selection with nothing left to transmit', async () => {
    const { canTransmitSelection } = await loadFutureModule<CteBatchActionsModule>(ACTIONS_MODULE)

    for (const groups of [[DONE_GROUP], [CANCELLED_GROUP], [UNKNOWN_GROUP], []]) {
      expect(
        canTransmitSelection({ batchStatuses: BATCH_STATUSES, groups, permissions: [CTE_SUBMIT] }),
      ).toBe(false)
    }
    expect(
      canTransmitSelection({
        batchStatuses: BATCH_STATUSES,
        groups: [DRAFT_GROUP],
        permissions: [CTE_MANAGE],
      }),
    ).toBe(false)
  })

  /**
   * Antes, um lote concluído na seleção travava o botão inteiro e o operador não descobria qual.
   * O que não tem o que transmitir sai da conta; o resto segue.
   */
  test('keeps the transmittable batches of a mixed selection', async () => {
    const { canTransmitSelection, selectTransmittableGroups } =
      await loadFutureModule<CteBatchActionsModule>(ACTIONS_MODULE)
    const groups = [DRAFT_GROUP, DONE_GROUP, IN_FLIGHT_GROUP, UNKNOWN_GROUP]

    expect(
      selectTransmittableGroups({ batchStatuses: BATCH_STATUSES, groups }).map(
        (group) => group.batchId,
      ),
    ).toEqual([DRAFT_GROUP.batchId, IN_FLIGHT_GROUP.batchId])
    expect(
      canTransmitSelection({ batchStatuses: BATCH_STATUSES, groups, permissions: [CTE_SUBMIT] }),
    ).toBe(true)
  })

  /** A contagem do botão precisa ser a dos lotes que vão de fato, não a da seleção crua. */
  test('feeds the transmission with the filtered groups', async () => {
    const hook = await readApplicationFile(ITEM_TABLE_HOOK_PATH)

    expect(hook).toContain('selectTransmittableGroups({')
    expect(hook).not.toContain('const transmitGroups = selectedGroups')
  })
})
