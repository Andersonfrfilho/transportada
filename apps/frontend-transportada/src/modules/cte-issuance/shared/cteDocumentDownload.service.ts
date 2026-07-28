/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CteIssuanceDocument } from './cteIssuanceClient.service'

export type CteDocumentDownloadController = Readonly<{
  openDocument: (document: unknown) => void
  openDocumentForAccessKey: (input: {
    readonly accessKey: string
    readonly documents: readonly unknown[]
  }) => void
}>

export function createCteDocumentDownloadController(input: {
  readonly openUrl: (url: string) => void
}): CteDocumentDownloadController {
  return {
    openDocument(document) {
      const downloadUrl = readDownloadUrl(document)
      input.openUrl(downloadUrl)
    },
    openDocumentForAccessKey(selection) {
      const document = selection.documents.find(
        (candidate) => readAccessKey(candidate) === selection.accessKey,
      )
      if (document === undefined) throw new Error('CTE_DOCUMENT_DOWNLOAD_UNAVAILABLE')
      input.openUrl(readDownloadUrl(document))
    },
  }
}

function readAccessKey(document: unknown): string | undefined {
  if (typeof document !== 'object' || document === null || !('accessKey' in document)) {
    return undefined
  }
  const accessKey = (document as Readonly<{ accessKey: unknown }>).accessKey
  return typeof accessKey === 'string' ? accessKey : undefined
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
