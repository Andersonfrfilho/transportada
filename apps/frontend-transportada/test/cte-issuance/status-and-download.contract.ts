/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { CTE_DOCUMENT_PAGE, CTE_REJECTED_ISSUANCE, loadFutureModule } from './cte-issuance.fixture'

describe('CT-e issuance status and download presentation contract', () => {
  test('builds timeline rows without raw fiscal XML or certificate material', async () => {
    const { createCteIssuanceTimeline } = await loadFutureModule<CteIssuanceTimelineModule>(
      '../../src/modules/cte-issuance/shared/cteIssuanceTimeline.service',
    )

    const timeline = createCteIssuanceTimeline({ issuance: CTE_REJECTED_ISSUANCE })

    expect(timeline).toEqual([
      {
        descriptionKey: 'cteIssuance.timeline.rejected.description',
        status: 'rejected',
        titleKey: 'cteIssuance.timeline.rejected.title',
      },
    ])
    expect(JSON.stringify(timeline)).not.toContain('<cteProc')
    expect(JSON.stringify(timeline)).not.toContain('certificate')
  })

  test('opens only temporary document URLs and never stores XML content in state', async () => {
    const { createCteDocumentDownloadController } = await loadFutureModule<CteDownloadModule>(
      '../../src/modules/cte-issuance/shared/cteDocumentDownload.service',
    )
    const openedUrls: string[] = []
    const controller = createCteDocumentDownloadController({
      openUrl: (url) => openedUrls.push(url),
    })

    controller.openDocument(CTE_DOCUMENT_PAGE.items[0])

    expect(openedUrls).toEqual([CTE_DOCUMENT_PAGE.items[0].downloadUrl])
    expect(JSON.stringify(controller)).not.toContain('<cteProc')
    expect(JSON.stringify(controller)).not.toContain('xmlContent')
  })
})

type CteIssuanceTimelineModule = {
  readonly createCteIssuanceTimeline: (input: { readonly issuance: unknown }) => readonly {
    readonly descriptionKey: string
    readonly status: string
    readonly titleKey: string
  }[]
}

type CteDownloadModule = {
  readonly createCteDocumentDownloadController: (input: {
    readonly openUrl: (url: string) => void
  }) => {
    readonly openDocument: (document: unknown) => void
  }
}
