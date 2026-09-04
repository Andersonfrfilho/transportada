/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { DeliveryProofDownloadPort } from '../application/read-delivery-proof.use-case.js'

/**
 * Cinco minutos: a URL vive o tempo de a tela do escritório carregar a imagem, e o comprovante é
 * foto de canhoto com o nome de quem recebeu — dado de terceiro. Prazo longo transformaria cada
 * abertura da tela num link compartilhável que sobrevive à sessão de quem o abriu.
 */
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

export function createDeliveryProofDownloadGateway(input: {
  readonly expiresInSeconds?: number
  readonly now?: () => Date
  readonly storage: SignedDownloadGateway
}): DeliveryProofDownloadPort {
  const expiresInSeconds = input.expiresInSeconds ?? DOWNLOAD_EXPIRES_IN_SECONDS
  const now = input.now ?? (() => new Date())

  return {
    async createDownloadUrl(location) {
      const url = await input.storage.createSignedDownload({
        bucket: location.bucket,
        // `inline`: a tela mostra o canhoto, não baixa um arquivo que ninguém pediu.
        disposition: 'inline',
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
