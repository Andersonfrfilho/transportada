/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T004: o operador lê o comprovante que o motorista anexou.
 *
 * O motorista **envia** desde a spec 057 (`POST /me/current-trip/documents/:id/proof`); do outro
 * lado do balcão não havia leitura nenhuma — o canhoto existia no bucket e ninguém no escritório o
 * alcançava.
 */
import type {
  ReceivedBy,
  TripDeliveryProofKind,
  TripDeliveryProofPunctuality,
} from '../../database/trip.schema.js'

export type DeliveryProofRecord = {
  readonly bucket: string
  /** Spec 220 RF14: a hora do aparelho na foto; `null` quando o aparelho não a leu. */
  readonly capturedAt?: string | null
  readonly createdAt: string
  /** Spec 220 RF15: metros entre a foto e a entrega registrada, já derivados; `null` sem posição. */
  readonly distanceMeters?: number | null
  readonly id: string
  readonly kind: TripDeliveryProofKind
  /** Spec 205 RF7: o envio ou a entrega dele veio pelo "Registrar entrega depois". */
  readonly lateRegistration: boolean
  readonly mimeType: string
  readonly objectKey: string
  readonly punctuality?: TripDeliveryProofPunctuality
  /** ADR-0057 §3: **sempre** a máscara (`***.938.570-**`). O valor em claro não sai da coluna selada. */
  readonly receiverDocumentMasked: string
  /** Nome de quem recebeu — na assinatura e no canhoto (spec 193 D4). */
  readonly receiverName: string
  /** Spec 193 D3: da mesma linha do nome. `null` nos comprovantes antigos (D11). */
  readonly receivedBy: ReceivedBy | null
  readonly receivedByDetail: string | null
  /** Spec 220 RF17: `null` no comprovante antigo, na assinatura e na foto cuja miniatura falhou. */
  readonly thumbnail?: DeliveryProofThumbnailLocation | null
}

export type DeliveryProofThumbnailLocation = {
  readonly bucket: string
  readonly mimeType: string
  readonly objectKey: string
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
  /** Spec 220 RF14: ausente (nunca `null`) quando o aparelho não leu a hora. */
  readonly capturedAt?: string
  readonly createdAt: string
  /** Spec 220 RF15: ausente (nunca `null`) sem posição. ⚠️ A coordenada e a precisão nunca saem. */
  readonly distanceMeters?: number
  readonly downloadUrl: string
  readonly expiresAt: string
  readonly id: string
  readonly kind: TripDeliveryProofKind
  /** Spec 205 RF7: só como dado — a tela não o interpreta. */
  readonly lateRegistration: boolean
  readonly punctuality?: TripDeliveryProofPunctuality
  /** ADR-0057 §3: mascarado em toda leitura. Vazio quando a empresa não colhe documento. */
  readonly receiverDocument: string
  readonly receiverName: string
  /** Spec 193 CA09: quem recebeu, da mesma linha do nome; `null` no comprovante antigo. */
  readonly receivedBy: ReceivedBy | null
  readonly receivedByDetail: string | null
  /** Spec 220 RF20: ausente (nunca `null`) quando não há miniatura — a tela cai no original. */
  readonly thumbnailUrl?: string
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

  // Um único lote: original e miniatura de todos saem em voo juntos (RNF01). Rejeitar no primeiro
  // erro é o desejado — uma URL faltando quebra a tela, então `allSettled` só esconderia o defeito.
  return Promise.all(
    records.map(async (record) => {
      const fileName = `comprovante-${record.kind}-${record.id}`
      const [download, thumbnailDownload] = await Promise.all([
        downloads.createDownloadUrl({
          bucket: record.bucket,
          fileName,
          objectKey: record.objectKey,
        }),
        record.thumbnail
          ? downloads.createDownloadUrl({
              bucket: record.thumbnail.bucket,
              fileName: `${fileName}-miniatura`,
              objectKey: record.thumbnail.objectKey,
            })
          : undefined,
      ])

      return {
        ...(record.capturedAt === undefined || record.capturedAt === null
          ? {}
          : { capturedAt: record.capturedAt }),
        createdAt: record.createdAt,
        ...(record.distanceMeters === undefined || record.distanceMeters === null
          ? {}
          : { distanceMeters: record.distanceMeters }),
        downloadUrl: download.url,
        expiresAt: download.expiresAt,
        id: record.id,
        kind: record.kind,
        lateRegistration: record.lateRegistration,
        ...(record.punctuality === undefined ? {} : { punctuality: record.punctuality }),
        receiverDocument: record.receiverDocumentMasked,
        receiverName: record.receiverName,
        receivedBy: record.receivedBy,
        receivedByDetail: record.receivedByDetail,
        ...(thumbnailDownload ? { thumbnailUrl: thumbnailDownload.url } : {}),
      }
    }),
  )
}
