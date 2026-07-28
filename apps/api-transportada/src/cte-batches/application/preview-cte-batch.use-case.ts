/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { projectCteBatchCharges, sumFiscalAmounts } from '../domain/cte-batch-projection.service.js'
import type {
  CteBatchPreviewResult,
  CteBatchPreviewReaderPort,
  CteEmissionProfileCatalogPort,
  PreviewCteBatchInput,
} from './cte-batch-preview.port.js'
import {
  selectCteBatchCandidates,
  splitDuplicatedDocumentIds,
} from './cte-batch-selection.service.js'

type Dependencies = {
  readonly profiles: CteEmissionProfileCatalogPort
  readonly reader: CteBatchPreviewReaderPort
}

export type PreviewCteBatchUseCase = {
  execute(input: PreviewCteBatchInput): Promise<CteBatchPreviewResult>
}

export function createPreviewCteBatchUseCase(dependencies: Dependencies): PreviewCteBatchUseCase {
  return {
    execute: (input) => previewCteBatch(dependencies, input),
  }
}

async function previewCteBatch(
  { profiles, reader }: Dependencies,
  input: PreviewCteBatchInput,
): Promise<CteBatchPreviewResult> {
  const companyId = input.context.companyId
  const duplicated = splitDuplicatedDocumentIds(input.documentIds)
  const query = { companyId, documentIds: duplicated.documentIds }
  const [documents, links, catalog] = await Promise.all([
    reader.findPreviewDocuments(query),
    reader.findActiveBatchLinks(query),
    profiles.listProfiles({ companyId }),
  ])

  const selection = selectCteBatchCandidates({
    catalog,
    documentIds: duplicated.documentIds,
    documents,
    emissionProfileId: input.emissionProfileId,
    groupingMode: input.groupingMode,
    links,
  })
  const blocked = [...duplicated.blocked, ...selection.blocked]
  const projections = projectCteBatchCharges(selection.candidates)

  return {
    blocked,
    projections,
    summary: {
      blockedCount: blocked.length,
      documentCount: input.documentIds.length,
      projectedCount: projections.length,
      totalAmount: sumFiscalAmounts(projections),
    },
  }
}
