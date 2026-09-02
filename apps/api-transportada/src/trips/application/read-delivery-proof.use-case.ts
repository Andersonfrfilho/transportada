/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T004: o operador lê o comprovante que o motorista anexou.
 *
 * O motorista **envia** desde a spec 057 (`POST /me/current-trip/documents/:id/proof`); do outro
 * lado do balcão não havia leitura nenhuma — o canhoto existia no bucket e ninguém no escritório o
 * alcançava.
 */
import type { TripDeliveryProofKind } from '../../database/trip.schema.js'

export type DeliveryProofRecord = {
  readonly bucket: string
  readonly createdAt: string
  readonly id: string
  readonly kind: TripDeliveryProofKind
  readonly mimeType: string
  readonly objectKey: string
  /** Nome de quem recebeu, na assinatura. **Nunca documento** — ADR-0045 §7. */
  readonly receiverName: string
}

export type ReadDeliveryProofPort = {
  listDeliveryProofs(input: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }): Promise<readonly DeliveryProofRecord[]>
}

export type DeliveryProofDownloadPort = {
  createDownloadUrl(input: {
    readonly bucket: string
    readonly fileName: string
    readonly objectKey: string
  }): Promise<{ readonly expiresAt: string; readonly url: string }>
}

/** O que a rota publica. ⚠️ Sem `bucket` e sem `objectKey`: ver o comentário da função. */
export type DeliveryProofView = {
  readonly createdAt: string
  readonly downloadUrl: string
  readonly expiresAt: string
  readonly id: string
  readonly kind: TripDeliveryProofKind
  readonly receiverName: string
}

export type ReadDeliveryProofsInput = {
  readonly companyId: string
  readonly documentId: string
  readonly downloads: DeliveryProofDownloadPort
  readonly repository: ReadDeliveryProofPort
  readonly tripId: string
}

/**
 * ⚠️ **Nenhum link permanente no corpo.** A URL sai assinada e com prazo; publicar a chave do
 * objeto — ou uma URL de bucket sem expiração — faria o comprovante circular fora de qualquer
 * autorização, para sempre, por quem tivesse recebido o JSON uma vez. E o comprovante é foto de
 * canhoto com o nome de quem recebeu: dado de terceiro, não do cliente que pediu a tela.
 *
 * Entrega sem comprovante é **lista vazia**, nunca erro: "não anexou" e "não entregou" são coisas
 * diferentes, e confundi-las manda o operador atrás de uma entrega que aconteceu.
 */
export async function readDeliveryProofs({
  companyId,
  documentId,
  downloads,
  repository,
  tripId,
}: ReadDeliveryProofsInput): Promise<readonly DeliveryProofView[]> {
  const records = await repository.listDeliveryProofs({ companyId, documentId, tripId })

  return Promise.all(
    records.map(async (record) => {
      const download = await downloads.createDownloadUrl({
        bucket: record.bucket,
        fileName: `comprovante-${record.kind}-${record.id}`,
        objectKey: record.objectKey,
      })

      return {
        createdAt: record.createdAt,
        downloadUrl: download.url,
        expiresAt: download.expiresAt,
        id: record.id,
        kind: record.kind,
        receiverName: record.receiverName,
      }
    }),
  )
}
