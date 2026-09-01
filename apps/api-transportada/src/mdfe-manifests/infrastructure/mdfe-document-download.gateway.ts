/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { MdfeSignedDownloadPort } from '../application/read-mdfe-document.port.js'

/** Curto de propósito: a URL assinada circula pelo celular do motorista, e não deve sobreviver ao dia. */
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

export function createMdfeDocumentDownloadGateway(input: {
  readonly expiresInSeconds?: number
  readonly now?: () => Date
  readonly storage: SignedDownloadGateway
}): MdfeSignedDownloadPort {
  const expiresInSeconds = input.expiresInSeconds ?? DOWNLOAD_EXPIRES_IN_SECONDS
  const now = input.now ?? (() => new Date())

  return {
    async createDownloadUrl(location) {
      const url = await input.storage.createSignedDownload({
        bucket: location.bucket,
        disposition: 'attachment',
        expiresInSeconds,
        filename: location.fileName,
        key: location.objectKey,
      })

      return {
        expiresAt: new Date(now().getTime() + expiresInSeconds * 1000).toISOString(),
        url: url.toString(),
      }
    },
  }
}
