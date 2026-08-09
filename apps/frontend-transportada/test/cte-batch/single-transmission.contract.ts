/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { CTE_MANAGE, CTE_SUBMIT, loadFutureModule } from './cte-batch.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const ACTIONS_MODULE = '../../src/modules/cte-batch/shared/cteBatchItemActions.service'
const ITEM_SELECTION_BAR_PATH = 'src/modules/cte-batch/components/CteItemSelectionBar.component.tsx'
const BATCH_SELECTION_BAR_PATH =
  'src/modules/cte-batch/components/CteBatchSelectionBar.component.tsx'
const ROW_ACTIONS_PATH = 'src/modules/cte-batch/components/CteBatchRowActions.component.tsx'
const ITEM_TABLE_HOOK_PATH = 'src/modules/cte-batch/hooks/useCteItemTable.hook.ts'
const WORKSPACE_PAGE_PATH = 'src/modules/cte-batch/pages/CteBatchWorkspace.page.tsx'
const LOCALE_PATH = 'src/modules/cte-batch/locales/cteBatch.locale.json'
const ENGLISH_LOCALE_PATH = 'src/modules/cte-batch/locales/cteBatch.en.locale.json'

const DRAFT_GROUP = { batchId: 'batch-draft', itemIds: ['item-1'] } as const
const SUBMITTED_GROUP = { batchId: 'batch-submitted', itemIds: ['item-2'] } as const
const DONE_GROUP = { batchId: 'batch-done', itemIds: ['item-3'] } as const
const UNKNOWN_GROUP = { batchId: 'batch-unknown', itemIds: ['item-4'] } as const
const BATCH_STATUSES = new Map([
  [DRAFT_GROUP.batchId, 'draft'],
  [SUBMITTED_GROUP.batchId, 'submitted'],
  [DONE_GROUP.batchId, 'done'],
] as const)

type CteItemBatchGroup = Readonly<{ batchId: string; itemIds: readonly string[] }>

type CteBatchActionsModule = Record<string, unknown> & {
  readonly canTransmitSelection: (
    input: Readonly<{
      batchStatuses: ReadonlyMap<string, string>
      groups: readonly CteItemBatchGroup[]
      permissions: readonly string[]
    }>,
  ) => boolean
}

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readApplicationJson(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json() as Promise<Record<string, unknown>>
}

function readSection(locale: Record<string, unknown>, key: string): Record<string, string> {
  return locale[key] as Record<string, string>
}

describe('CT-e single transmission action contract', () => {
  /**
   * Fechar o rascunho virou efeito da própria emissão, no backend e na mesma transação: o operador
   * comanda um passo só, e a seleção de rascunhos transmite sem escala. Lote submetido segue junto
   * porque é onde para o lote que perdeu um item no meio da emissão; a trava contra duplicidade
   * vive por item, no backend (`partial-transmission.contract.ts`). Encerrado e cancelado não voltam.
   */
  test('accepts a draft selection and refuses one already settled', async () => {
    const { canTransmitSelection } = await loadFutureModule<CteBatchActionsModule>(ACTIONS_MODULE)

    expect(
      canTransmitSelection({
        batchStatuses: BATCH_STATUSES,
        groups: [DRAFT_GROUP],
        permissions: [CTE_SUBMIT],
      }),
    ).toBe(true)
    expect(
      canTransmitSelection({
        batchStatuses: BATCH_STATUSES,
        groups: [DRAFT_GROUP, SUBMITTED_GROUP],
        permissions: [CTE_SUBMIT],
      }),
    ).toBe(true)
    expect(
      canTransmitSelection({
        batchStatuses: BATCH_STATUSES,
        groups: [DONE_GROUP],
        permissions: [CTE_SUBMIT],
      }),
    ).toBe(false)
    expect(
      canTransmitSelection({
        batchStatuses: BATCH_STATUSES,
        groups: [UNKNOWN_GROUP],
        permissions: [CTE_SUBMIT],
      }),
    ).toBe(false)
    expect(
      canTransmitSelection({
        batchStatuses: BATCH_STATUSES,
        groups: [DRAFT_GROUP],
        permissions: [CTE_MANAGE],
      }),
    ).toBe(false)
  })

  /** Duas portas para o mesmo efeito confundem: a de submeter deixou de existir. */
  test('drops the submission helpers from the actions module', async () => {
    const actions = await loadFutureModule<CteBatchActionsModule>(ACTIONS_MODULE)

    expect(actions['canSubmitBatch']).toBeUndefined()
    expect(actions['collectSubmittableGroups']).toBeUndefined()
  })

  test('leaves no submission button in the workspace', async () => {
    const [itemSelectionBar, batchSelectionBar, rowActions, hook, page] = await Promise.all([
      readApplicationFile(ITEM_SELECTION_BAR_PATH),
      readApplicationFile(BATCH_SELECTION_BAR_PATH),
      readApplicationFile(ROW_ACTIONS_PATH),
      readApplicationFile(ITEM_TABLE_HOOK_PATH),
      readApplicationFile(WORKSPACE_PAGE_PATH),
    ])

    for (const source of [itemSelectionBar, batchSelectionBar, rowActions, hook, page]) {
      expect(source).not.toContain('canSubmitBatch(')
      expect(source).not.toContain('collectSubmittableGroups')
      expect(source).not.toContain('submitSelection')
      expect(source).not.toContain("t('actions.submit')")
      expect(source).not.toContain('onSubmit')
    }
  })

  /** Transmitir é a mesma ação nas duas abas — mesmo rótulo, mesmo ícone. */
  test('keeps a single transmission action, with the transmission glyph', async () => {
    const [itemSelectionBar, batchSelectionBar] = await Promise.all([
      readApplicationFile(ITEM_SELECTION_BAR_PATH),
      readApplicationFile(BATCH_SELECTION_BAR_PATH),
    ])

    expect(/<Icon name="upload" \/>\s*\n\s*\{[^}]*transmitSelection/.test(itemSelectionBar)).toBe(
      true,
    )
    expect(itemSelectionBar).not.toContain('<Icon name="send" />')
    expect(batchSelectionBar).toContain('canTransmitBatch')
    expect(batchSelectionBar).toContain('<Icon name="upload" />')
    expect(batchSelectionBar).not.toContain('<Icon name="send" />')
    expect(batchSelectionBar).toContain("t('actions.transmit')")
  })

  test('names the single action after what it does, in both locales', async () => {
    const [locale, englishLocale] = await Promise.all([
      readApplicationJson(LOCALE_PATH),
      readApplicationJson(ENGLISH_LOCALE_PATH),
    ])
    const actions = readSection(locale, 'actions')
    const transmission = readSection(locale, 'transmission')
    const items = readSection(locale, 'cteItems')

    expect(actions['submit']).toBeUndefined()
    expect(items['submitSelection']).toBeUndefined()
    expect(actions['transmit']).toBe('Transmitir')
    expect(items['transmitSelection']).toBe('Transmitir ({{count}} lote(s))')
    expect(transmission['bulkTransmit']).toBe('Transmitir os lotes selecionados')
    expect(transmission['transmitting']).toBe('Transmitindo...')
    // Inclui os textos de progresso, aninhados: a seção inteira fala de transmissão.
    expect(JSON.stringify(transmission).toLowerCase()).not.toContain('envi')

    expect(readSection(englishLocale, 'actions')['submit']).toBeUndefined()
    expect(readSection(englishLocale, 'actions')['transmit']).toBe('Transmit')
    expect(readSection(englishLocale, 'cteItems')['submitSelection']).toBeUndefined()
    expect(readSection(englishLocale, 'transmission')['bulkTransmit']).toBe(
      'Transmit the selected batches',
    )
  })
})
