/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfseFiscalDocumentArchivePort } from '../application/nfse-invoice.port.js'

const DOWNLOAD_EXPIRES_IN_SECONDS = 300
const MILLISECONDS_PER_SECOND = 1000

type ObjectStorageGateway = {
  readonly createSignedDownload: (input: {
    readonly bucket: string
    readonly expiresInSeconds: number
    readonly key: string
    readonly disposition?: 'inline' | 'attachment'
    readonly filename?: string
  }) => Promise<URL>
}

/**
 * O XML fiscal e o PDF ficam no bucket privado e saem por URL assinada de cinco minutos — nunca
 * pelo corpo da resposta, que iria parar em log de proxy e em cache de navegador.
 */
export function createNfseFiscalDocumentArchiveGateway(input: {
  readonly expiresInSeconds?: number
  readonly now?: () => Date
  readonly storage: ObjectStorageGateway
}): NfseFiscalDocumentArchivePort {
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
        expiresAt: new Date(
          now().getTime() + expiresInSeconds * MILLISECONDS_PER_SECOND,
        ).toISOString(),
        url: url.toString(),
      }
    },
  }
}
