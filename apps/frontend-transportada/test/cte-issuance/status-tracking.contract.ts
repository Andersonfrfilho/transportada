/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  CTE_AUTHORIZED_ISSUANCE,
  CTE_BATCH_ID,
  CTE_BATCH_ITEM_ID,
  CTE_DOCUMENT_PAGE,
  CTE_REJECTED_ISSUANCE,
  CTE_RETRY_ISSUANCE,
  CTE_SUBMIT,
  loadFutureModule,
} from './cte-issuance.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const TIMELINE_STATUSES = [
  'authorized',
  'failed',
  'rejected',
  'requested',
  'retry_scheduled',
] as const

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json() as Promise<Record<string, unknown>>
}

function flattenKeys(value: Record<string, unknown>, prefix = ''): readonly string[] {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix === '' ? key : `${prefix}.${key}`
    if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
      return flattenKeys(entry as Record<string, unknown>, path)
    }
    return [path]
  })
}

function readTranslation(locale: Record<string, unknown>, key: string): unknown {
  return key.split('.').reduce<unknown>((current, segment) => {
    if (typeof current !== 'object' || current === null) return undefined
    return (current as Record<string, unknown>)[segment]
  }, locale)
}

describe('CT-e issuance status tracking contract', () => {
  test('enables the per item issuance query and polls only while the CT-e is in flight', async () => {
    const { createCteIssuanceQueryPlan, CTE_ISSUANCE_POLL_INTERVAL_MS } =
      await loadFutureModule<CteIssuancePollingModule>(
        '../../src/modules/cte-issuance/shared/cteIssuancePolling.service',
      )

    expect(
      createCteIssuanceQueryPlan({
        batchId: CTE_BATCH_ID,
        batchItemId: CTE_BATCH_ITEM_ID,
        canSubmitCte: false,
      }),
    ).toEqual({ documentsEnabled: false, issuanceEnabled: false, refetchInterval: false })

    expect(createCteIssuanceQueryPlan({ batchId: CTE_BATCH_ID, canSubmitCte: true })).toEqual({
      documentsEnabled: false,
      issuanceEnabled: false,
      refetchInterval: false,
    })

    expect(
      createCteIssuanceQueryPlan({
        batchId: CTE_BATCH_ID,
        batchItemId: CTE_BATCH_ITEM_ID,
        canSubmitCte: true,
      }),
    ).toEqual({ documentsEnabled: false, issuanceEnabled: true, refetchInterval: false })

    for (const status of ['requested', 'retry_scheduled'] as const) {
      expect(
        createCteIssuanceQueryPlan({
          batchId: CTE_BATCH_ID,
          batchItemId: CTE_BATCH_ITEM_ID,
          canSubmitCte: true,
          status,
        }),
        status,
      ).toEqual({
        documentsEnabled: false,
        issuanceEnabled: true,
        refetchInterval: CTE_ISSUANCE_POLL_INTERVAL_MS,
      })
    }

    expect(
      createCteIssuanceQueryPlan({
        batchId: CTE_BATCH_ID,
        batchItemId: CTE_BATCH_ITEM_ID,
        canSubmitCte: true,
        status: 'authorized',
      }),
    ).toEqual({ documentsEnabled: true, issuanceEnabled: true, refetchInterval: false })

    expect(
      createCteIssuanceQueryPlan({
        batchId: CTE_BATCH_ID,
        batchItemId: CTE_BATCH_ITEM_ID,
        canSubmitCte: true,
        status: 'rejected',
      }),
    ).toEqual({ documentsEnabled: false, issuanceEnabled: true, refetchInterval: false })
  })

  test('exposes access key, protocol and rejection cause without leaking fiscal payloads', async () => {
    const { createCteIssuanceViewModel } = await loadFutureModule<CteIssuanceViewModelModule>(
      '../../src/modules/cte-issuance/shared/cteIssuanceViewModel.service',
    )

    const authorized = createCteIssuanceViewModel({
      documents: CTE_DOCUMENT_PAGE,
      issuance: CTE_AUTHORIZED_ISSUANCE,
      permissions: [CTE_SUBMIT],
      status: 'success',
    })
    expect(authorized.accessKey).toBe(CTE_AUTHORIZED_ISSUANCE.accessKey)
    expect(authorized.protocol).toBe(CTE_AUTHORIZED_ISSUANCE.protocol)
    expect(authorized.rejectionCause).toBeUndefined()
    expect(authorized.rejectionCode).toBeUndefined()

    const rejected = createCteIssuanceViewModel({
      documents: { items: [], nextCursor: null },
      issuance: CTE_REJECTED_ISSUANCE,
      permissions: [CTE_SUBMIT],
      status: 'success',
    })
    expect(rejected.rejectionCode).toBe(CTE_REJECTED_ISSUANCE.reasonCode)
    expect(rejected.rejectionCause).toBe(CTE_REJECTED_ISSUANCE.reasonCause)
    expect(rejected.canDownloadXml).toBe(false)

    const retry = createCteIssuanceViewModel({
      permissions: [CTE_SUBMIT],
      status: 'success',
      issuance: CTE_RETRY_ISSUANCE,
    })
    expect(retry.accessKey).toBeUndefined()
    expect(retry.protocol).toBeUndefined()

    const serialized = JSON.stringify([authorized, rejected, retry])
    expect(serialized).not.toContain('<cteProc')
    expect(serialized).not.toContain('certificate')
    expect(serialized).not.toContain('bucket')
  })

  test('fails loudly when the authorized XML of the selected CT-e is not available', async () => {
    const { createCteDocumentDownloadController } = await loadFutureModule<CteDownloadModule>(
      '../../src/modules/cte-issuance/shared/cteDocumentDownload.service',
    )
    const openedUrls: string[] = []
    const controller = createCteDocumentDownloadController({
      openUrl: (url) => openedUrls.push(url),
    })

    controller.openDocumentForAccessKey({
      accessKey: CTE_DOCUMENT_PAGE.items[0].accessKey,
      documents: CTE_DOCUMENT_PAGE.items,
    })
    expect(openedUrls).toEqual([CTE_DOCUMENT_PAGE.items[0].downloadUrl])

    expect(() =>
      controller.openDocumentForAccessKey({
        accessKey: CTE_DOCUMENT_PAGE.items[0].accessKey,
        documents: [],
      }),
    ).toThrow('CTE_DOCUMENT_DOWNLOAD_UNAVAILABLE')
    expect(() =>
      controller.openDocumentForAccessKey({
        accessKey: '35260761156864000191570010000000019000000019',
        documents: CTE_DOCUMENT_PAGE.items,
      }),
    ).toThrow('CTE_DOCUMENT_DOWNLOAD_UNAVAILABLE')
    expect(openedUrls).toHaveLength(1)
  })

  test('translates every issuance timeline state in both locales', async () => {
    const { createCteIssuanceTimeline } = await loadFutureModule<CteIssuanceTimelineModule>(
      '../../src/modules/cte-issuance/shared/cteIssuanceTimeline.service',
    )
    const [portuguese, english] = await Promise.all([
      readLocale('src/modules/cte-issuance/locales/cteIssuance.locale.json'),
      readLocale('src/modules/cte-issuance/locales/cteIssuance.en.locale.json'),
    ])

    expect(flattenKeys(english)).toEqual(flattenKeys(portuguese))

    for (const status of TIMELINE_STATUSES) {
      const [step] = createCteIssuanceTimeline({ issuance: { status } })
      const namespacedKeys = [step?.titleKey ?? '', step?.descriptionKey ?? '']
      for (const namespacedKey of namespacedKeys) {
        expect(namespacedKey.startsWith('cteIssuance.'), namespacedKey).toBeTrue()
        const key = namespacedKey.slice('cteIssuance.'.length)
        expect(typeof readTranslation(portuguese, key), `pt-BR ${namespacedKey}`).toBe('string')
        expect(typeof readTranslation(english, key), `en ${namespacedKey}`).toBe('string')
      }
    }

    const i18nService = await readModule('src/modules/shared/i18n/i18n.service.ts')
    expect(i18nService).toContain('cteIssuance: cteIssuanceLocale')
    expect(i18nService).toContain('cteIssuance: cteIssuanceEnglishLocale')
  })

  test('wires the item selection, the status panel and the reprocess feedback', async () => {
    const [panel, hook, itemsHook, itemsPanel] = await Promise.all([
      readModule('src/modules/cte-issuance/components/CteIssuanceStatusPanel.component.tsx'),
      readModule('src/modules/cte-issuance/hooks/useCteIssuanceStatus.hook.ts'),
      readModule('src/modules/cte-batch/hooks/useCteBatchItems.hook.ts'),
      readModule('src/modules/cte-batch/components/CteBatchItemsPanel.component.tsx'),
    ])

    expect(panel).toContain("useTranslation('cteIssuance')")
    expect(panel).toContain('viewModel')
    expect(panel).toContain('accessKey')
    expect(panel).toContain('protocol')
    expect(panel).toContain('rejectionCause')
    expect(panel).toContain('onDownload')
    expect(panel).toContain('onReprocess')

    expect(hook).toContain('createCteIssuanceQueryPlan')
    expect(hook).toContain('createCteIssuanceViewModel')
    expect(hook).toContain('createCteIssuanceTimeline')

    expect(itemsHook).toContain('batchItemId')
    expect(itemsHook).toContain('selectItem')
    expect(itemsHook).toContain('downloadMutation')
    expect(itemsPanel).toContain('CteIssuanceStatusPanel')
    expect(itemsPanel).toContain('actions.track')

    const presentationBoundary = [panel, hook, itemsHook, itemsPanel].join('\n')
    expect(presentationBoundary).not.toContain('localStorage')
    expect(presentationBoundary).not.toContain('sessionStorage')
    expect(presentationBoundary).not.toContain('<cteProc')
    expect(presentationBoundary).not.toContain('certificadoBase64')
  })
})

type CteIssuancePollingModule = {
  readonly CTE_ISSUANCE_POLL_INTERVAL_MS: number
  readonly createCteIssuanceQueryPlan: (input: {
    readonly batchId?: string
    readonly batchItemId?: string
    readonly canSubmitCte: boolean
    readonly status?: string
  }) => {
    readonly documentsEnabled: boolean
    readonly issuanceEnabled: boolean
    readonly refetchInterval: false | number
  }
}

type CteIssuanceViewModelModule = {
  readonly createCteIssuanceViewModel: (input: {
    readonly documents?: unknown
    readonly issuance?: unknown
    readonly permissions: readonly string[]
    readonly status: 'error' | 'loading' | 'success'
  }) => {
    readonly accessKey?: string
    readonly canDownloadXml?: boolean
    readonly protocol?: string
    readonly rejectionCause?: string
    readonly rejectionCode?: string
  }
}

type CteDownloadModule = {
  readonly createCteDocumentDownloadController: (input: {
    readonly openUrl: (url: string) => void
  }) => {
    readonly openDocument: (document: unknown) => void
    readonly openDocumentForAccessKey: (input: {
      readonly accessKey: string
      readonly documents: readonly unknown[]
    }) => void
  }
}

type CteIssuanceTimelineModule = {
  readonly createCteIssuanceTimeline: (input: { readonly issuance: unknown }) => readonly {
    readonly descriptionKey: string
    readonly status: string
    readonly titleKey: string
  }[]
}
