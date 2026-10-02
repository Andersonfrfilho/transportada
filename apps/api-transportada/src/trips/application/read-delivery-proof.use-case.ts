/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T004: o operador lê o comprovante que o motorista anexou.
 *
 * O motorista **envia** desde a spec 057 (`POST /me/current-trip/documents/:id/proof`); do outro
 * lado do balcão não havia leitura nenhuma — o canhoto existia no bucket e ninguém no escritório o
 * alcançava.
 */
import type { EventLocationState } from '../../database/event-location.schema.js'
import type {
  ReceivedBy,
  TripDeliveryProofCanhotoReadSource,
  TripDeliveryProofCanhotoReview,
  TripDeliveryProofCanhotoReviewOrigin,
  TripDeliveryProofCanhotoReviewReason,
  TripDeliveryProofKind,
  TripDeliveryProofPunctuality,
} from '../../database/trip.schema.js'

/**
 * Spec 220 RF24 (T7.4): o veredito da conferência do canhoto. Todos ausentes ou `null` no
 * comprovante antigo e em `not_applicable`. ⚠️ Nem o id de quem conferiu nem o documento de onde a
 * leitura veio entram aqui — a tela só precisa do nome.
 */
export type CanhotoReviewRecord = {
  readonly canhotoReadNumber?: string | null
  readonly canhotoReadSeries?: string | null
  readonly canhotoReadSource?: TripDeliveryProofCanhotoReadSource | null
  readonly canhotoReview?: TripDeliveryProofCanhotoReview
  readonly canhotoReviewAt?: string | null
  /** Nome de quem conferiu; `null` no veredito automático e quando a pessoa já saiu da empresa. */
  readonly canhotoReviewByName?: string | null
  readonly canhotoReviewNote?: string | null
  readonly canhotoReviewOrigin?: TripDeliveryProofCanhotoReviewOrigin | null
  readonly canhotoReviewReason?: TripDeliveryProofCanhotoReviewReason | null
}

/** ADR-0081 §6.1: as cinco chaves da coordenada da captura, como o painel as validará; ainda não publicadas na view. */
export type DeliveryProofLocation = {
  readonly accuracyMeters: number | null
  readonly capturedAt: string
  readonly distanceMeters: number | null
  readonly latitude: number
  readonly longitude: number
}

export type DeliveryProofRecord = CanhotoReviewRecord & {
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
  /** ADR-0081 §6.1: lida da coluna, mas só o consumidor com `trip.event-location` poderá publicá-la. */
  readonly location?: DeliveryProofLocation | null
  readonly locationState?: EventLocationState | null
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

/** Spec 222 T1.3: o comprovante com a nota a que pertence — a leitura por viagem mistura várias. */
export type TripDeliveryProofRecord = DeliveryProofRecord & {
  readonly documentId: string
}

export type ReadTripDeliveryProofsPort = {
  findByTrip(input: {
    readonly companyId: string
    readonly documentIds?: readonly string[]
    readonly tripId: string
  }): Promise<readonly TripDeliveryProofRecord[]>
}

export type DeliveryProofDownloadPort = {
  createDownloadUrl(input: {
    readonly bucket: string
    readonly fileName: string
    readonly objectKey: string
  }): Promise<{ readonly expiresAt: string; readonly url: string }>
}

/** Spec 220 RF24: cada chave ausente (nunca `null`) quando não há o que dizer. */
export type CanhotoReviewView = {
  readonly canhotoReadNumber?: string
  readonly canhotoReadSeries?: string
  readonly canhotoReadSource?: TripDeliveryProofCanhotoReadSource
  readonly canhotoReview?: Exclude<TripDeliveryProofCanhotoReview, 'not_applicable'>
  readonly canhotoReviewAt?: string
  readonly canhotoReviewByName?: string
  readonly canhotoReviewNote?: string
  readonly canhotoReviewOrigin?: TripDeliveryProofCanhotoReviewOrigin
  readonly canhotoReviewReason?: TripDeliveryProofCanhotoReviewReason
}

/** O que a rota publica. ⚠️ Sem `bucket` e sem `objectKey`: ver o comentário da função. */
export type DeliveryProofView = CanhotoReviewView & {
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

  return Promise.all(records.map((record) => buildDeliveryProofView({ downloads, record })))
}

/**
 * Spec 227 D6: o raio que o juiz da captura usa — a mesma fonte única da pontualidade
 * (`DrizzleDeliveryProofRepository.resolveProofPunctualitySettings`). Só o raio é lido aqui: os
 * demais parâmetros da nota do motorista não saem desta rota.
 */
export type ProofRadiusPort = {
  resolveProofPunctualitySettings(input: {
    readonly companyId: string
  }): Promise<{ readonly proofRadiusMeters: number }>
}

/** Spec 222 T1.4: o item da leitura por viagem é o da leitura de uma nota, mais a nota dele. */
export type TripDeliveryProofView = DeliveryProofView & {
  readonly documentId: string
  /**
   * Spec 227 D6: o raio de "longe do ponto", em metros, já resolvido no servidor — o leitor não
   * precisa de `settings.manage`. Ausente (nunca zero) quando não há número positivo para dizer.
   */
  readonly proofRadiusMeters?: number
}

export type ReadDeliveryProofsByTripInput = {
  readonly companyId: string
  /** Ausente é "todas as notas da viagem"; o teto é da fronteira, não deste caso de uso. */
  readonly documentIds?: readonly string[] | undefined
  readonly downloads: DeliveryProofDownloadPort
  readonly repository: ReadTripDeliveryProofsPort
  readonly settings: ProofRadiusPort
  readonly tripId: string
}

/**
 * Os comprovantes de todas as notas da viagem numa chamada — a tela do maço precisaria de uma
 * requisição por nota só para saber o que está pendente. As URLs saem assinadas por comprovante,
 * como em `readDeliveryProofs` (HMAC local, sem rede: medido na T1.4 da spec 222).
 *
 * ⚠️ Cada URL tem a vida curta de sempre e continua sem `bucket` nem `objectKey` no corpo.
 */
export async function readDeliveryProofsByTrip({
  companyId,
  documentIds,
  downloads,
  repository,
  settings,
  tripId,
}: ReadDeliveryProofsByTripInput): Promise<readonly TripDeliveryProofView[]> {
  const records = await repository.findByTrip({
    companyId,
    ...(documentIds === undefined ? {} : { documentIds }),
    tripId,
  })
  if (records.length === 0) return []

  const { proofRadiusMeters } = await settings.resolveProofPunctualitySettings({ companyId })
  const radius =
    Number.isFinite(proofRadiusMeters) && proofRadiusMeters > 0 ? { proofRadiusMeters } : {}

  return Promise.all(
    records.map(async (record) => ({
      ...(await buildDeliveryProofView({ downloads, record })),
      documentId: record.documentId,
      ...radius,
    })),
  )
}

async function buildDeliveryProofView({
  downloads,
  record,
}: {
  readonly downloads: DeliveryProofDownloadPort
  readonly record: DeliveryProofRecord
}): Promise<DeliveryProofView> {
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
    ...buildCanhotoReviewView(record),
    ...(record.punctuality === undefined ? {} : { punctuality: record.punctuality }),
    receiverDocument: record.receiverDocumentMasked,
    receiverName: record.receiverName,
    receivedBy: record.receivedBy,
    receivedByDetail: record.receivedByDetail,
    ...(thumbnailDownload ? { thumbnailUrl: thumbnailDownload.url } : {}),
  }
}

/**
 * `not_applicable` é o estado de fábrica: a tela o lê como "sem veredito", então nada sobe.
 *
 * ⚠️ **Publicar `not_applicable` daqui apaga o comprovante inteiro do painel.** A lista fechada de
 * `isDeliveryProof` (T7.5) descarta o comprovante quando `canhotoReview` sai do vocabulário, e ela
 * aceita só `pending`, `approved` e `rejected` — justamente porque esta função nunca manda o quarto.
 * Quem quiser mandá-lo mexe primeiro em `DELIVERY_PROOF_CANHOTO_REVIEW_OPTIONS` no painel, senão a
 * tela fica em branco sem erro nenhum, que é o sintoma mais caro que este arquivo consegue produzir.
 */
function buildCanhotoReviewView(record: CanhotoReviewRecord): CanhotoReviewView {
  if (record.canhotoReview === undefined || record.canhotoReview === 'not_applicable') return {}

  return {
    canhotoReview: record.canhotoReview,
    ...(record.canhotoReadNumber ? { canhotoReadNumber: record.canhotoReadNumber } : {}),
    ...(record.canhotoReadSeries ? { canhotoReadSeries: record.canhotoReadSeries } : {}),
    ...(record.canhotoReadSource ? { canhotoReadSource: record.canhotoReadSource } : {}),
    ...(record.canhotoReviewAt ? { canhotoReviewAt: record.canhotoReviewAt } : {}),
    ...(record.canhotoReviewByName ? { canhotoReviewByName: record.canhotoReviewByName } : {}),
    ...(record.canhotoReviewNote ? { canhotoReviewNote: record.canhotoReviewNote } : {}),
    ...(record.canhotoReviewOrigin ? { canhotoReviewOrigin: record.canhotoReviewOrigin } : {}),
    ...(record.canhotoReviewReason ? { canhotoReviewReason: record.canhotoReviewReason } : {}),
  }
}
