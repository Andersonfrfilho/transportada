/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CteIssuanceDocument } from './cteIssuanceClient.service'

export type CteDocumentDownloadController = Readonly<{
  openDocument: (document: unknown) => void
}>

export function createCteDocumentDownloadController(input: {
  readonly openUrl: (url: string) => void
}): CteDocumentDownloadController {
  return {
    openDocument(document) {
      const downloadUrl = readDownloadUrl(document)
      input.openUrl(downloadUrl)
    },
  }
}

function readDownloadUrl(document: unknown): CteIssuanceDocument['downloadUrl'] {
  if (typeof document !== 'object' || document === null || !('downloadUrl' in document)) {
    throw new Error('CTE_DOCUMENT_DOWNLOAD_INVALID')
  }
  const downloadUrl = (document as Readonly<{ downloadUrl: unknown }>).downloadUrl
  if (typeof downloadUrl !== 'string' || downloadUrl.trim() === '') {
    throw new Error('CTE_DOCUMENT_DOWNLOAD_INVALID')
  }
  return downloadUrl
}
