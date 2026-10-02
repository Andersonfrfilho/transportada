/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Pedido do usuário (01/10): o motorista rever o canhoto que ele mesmo enviou. O app guarda a
 * miniatura do envio por 24 h, mas isso não alcança a foto anexada pelo escritório, o aparelho
 * trocado nem a viagem de ontem — e a única leitura que existia (`GET
 * /trips/:id/documents/:documentId/proof`, spec 079) pede `fleet.read`, do escritório.
 *
 * ⚠️ **A viagem não vem do cliente.** O `documentId` é resolvido por `findReachableDocument` — a
 * mesma consulta da spec 179 T202 —, que só acha a nota dentro de uma viagem **deste** motorista.
 * `trip.read` é permissão da empresa inteira: sem esse recorte, qualquer motorista leria o canhoto
 * de qualquer nota da transportadora (OWASP API1/BOLA).
 */
import type { TripDeliveryProofKind } from '../../database/trip.schema.js'
import { TripDocumentNotReachableError } from '../domain/trip.error.js'
import { FIELD_TRIP_TARGET_KIND } from './field-trip-target.types.js'
import type { ReachableDocumentPort } from './request-occurrence-upload.use-case.js'
import type {
  DeliveryProofDownloadPort,
  ReadDeliveryProofPort,
} from './read-delivery-proof.use-case.js'

/**
 * O que a rua precisa: a imagem e o que ela é. ⚠️ Nada de quem recebeu, documento mascarado,
 * veredito da conferência ou distância da captura — o motorista está reconhecendo a própria foto,
 * não auditando a entrega, e o painel continua sendo o lugar de tudo isso.
 */
export type DriverDeliveryProofView = {
  readonly createdAt: string
  readonly downloadUrl: string
  readonly expiresAt: string
  readonly id: string
  readonly kind: TripDeliveryProofKind
  /** Ausente (nunca `null`) quando não há miniatura — a tela cai no original. */
  readonly thumbnailUrl?: string
}

export type ReadDriverDeliveryProofsInput = {
  readonly companyId: string
  readonly documentId: string
  readonly downloads: DeliveryProofDownloadPort
  readonly driverId: string
  readonly repository: ReachableDocumentPort & ReadDeliveryProofPort
}

/**
 * Nota sem comprovante é **lista vazia**, nunca erro: "não anexou" e "não entregou" são coisas
 * diferentes. Nota fora das viagens do motorista é `TripDocumentNotReachableError` — a mesma
 * resposta de uma nota que não existe, para a rota não virar sonda de notas alheias.
 */
export async function readDriverDeliveryProofs(
  input: ReadDriverDeliveryProofsInput,
): Promise<readonly DriverDeliveryProofView[]> {
  const reachable = await input.repository.findReachableDocument({
    companyId: input.companyId,
    documentId: input.documentId,
    target: { driverId: input.driverId, kind: FIELD_TRIP_TARGET_KIND.driver },
  })
  if (reachable === null) throw new TripDocumentNotReachableError()

  const records = await input.repository.listDeliveryProofs({
    companyId: input.companyId,
    documentId: input.documentId,
    tripId: reachable.tripId,
  })

  return Promise.all(
    records.map(async (record) => {
      const fileName = `comprovante-${record.kind}-${record.id}`
      const [download, thumbnailDownload] = await Promise.all([
        input.downloads.createDownloadUrl({
          bucket: record.bucket,
          fileName,
          objectKey: record.objectKey,
        }),
        record.thumbnail
          ? input.downloads.createDownloadUrl({
              bucket: record.thumbnail.bucket,
              fileName: `${fileName}-miniatura`,
              objectKey: record.thumbnail.objectKey,
            })
          : undefined,
      ])

      return {
        createdAt: record.createdAt,
        downloadUrl: download.url,
        expiresAt: download.expiresAt,
        id: record.id,
        kind: record.kind,
        ...(thumbnailDownload ? { thumbnailUrl: thumbnailDownload.url } : {}),
      }
    }),
  )
}
