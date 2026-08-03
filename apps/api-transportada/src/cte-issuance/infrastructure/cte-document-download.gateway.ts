/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteDocumentDownloadPort } from '../application/cte-issuance.use-case.js'

const DOWNLOAD_EXPIRES_IN_SECONDS = 300

type SignedDownloadGateway = {
  readonly createSignedDownload: (input: {
    readonly bucket: string
    readonly key: string
    readonly expiresInSeconds: number
    readonly disposition?: 'inline' | 'attachment'
    readonly filename?: string
  }) => Promise<URL>
}

export function createCteDocumentDownloadGateway(input: {
  readonly storage: SignedDownloadGateway
  readonly expiresInSeconds?: number
  readonly now?: () => Date
}): CteDocumentDownloadPort {
  const expiresInSeconds = input.expiresInSeconds ?? DOWNLOAD_EXPIRES_IN_SECONDS
  const now = input.now ?? (() => new Date())

  return {
    async createDownloadUrl(location) {
      const url = await input.storage.createSignedDownload({
        bucket: location.bucket,
        disposition: 'attachment',
        expiresInSeconds,
        filename: location.fileName,
        key: location.key,
      })
      return {
        expiresAt: new Date(now().getTime() + expiresInSeconds * 1000).toISOString(),
        url: url.toString(),
      }
    },
  }
}
