/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A página de ocorrências do escritório: une o que houve com a nota (`trip_document_occurrences`)
 * e o que houve na parada (`trip_stop_occurrences`) numa lista só, por empresa. **Leitura pura** —
 * não existe "tratar" ocorrência nesta versão, e a lista não muda estado nenhum.
 */
import type { TripOccurrenceStage } from '../../shared/trip-occurrence.constant.js'
import type { OccurrenceFeedOrder } from '../domain/occurrence-feed.policy.js'
import type { DeliveryProofDownloadPort } from './read-delivery-proof.use-case.js'

/**
 * O grupo do filtro tem três valores, não dois: as ocorrências de parada não têm tipo cadastrado
 * nem estágio — elas são o relato de campo da spec 057 — e escondê-las atrás de `delivery`
 * misturaria relato de parada com recusa de nota.
 */
export const TRIP_OCCURRENCE_FEED_STAGES = ['separation', 'delivery', 'stop'] as const
export type TripOccurrenceFeedStage = (typeof TRIP_OCCURRENCE_FEED_STAGES)[number]

export type TripOccurrenceFeedItem = {
  readonly createdAt: string
  readonly description: string
  /** Primeiro condutor da viagem. Vazio quando a viagem nasceu sem motorista pareado. */
  readonly driverName: string
  /** A ocorrência de parada carrega no máximo um anexo; a de nota não carrega nenhum. */
  readonly hasAttachment: boolean
  readonly id: string
  readonly invoiceNumber: null | string
  readonly invoiceSeries: null | string
  /** O tipo cadastrado avisa o embarcador quando a empresa ligou isso. Falso para parada. */
  readonly notifies: boolean
  readonly source: 'document' | 'stop'
  readonly stage: null | TripOccurrenceStage
  readonly stopLabel: null | string
  readonly tripId: string
  /** Nome do tipo cadastrado, ou o `kind` do relato de parada. É o que a tela imprime. */
  readonly typeName: string
  readonly vehiclePlate: string
}

export type TripOccurrenceFeedFilters = {
  readonly createdFrom?: string
  readonly createdUntil?: string
  readonly plateIn?: readonly string[]
  readonly stageIn?: readonly TripOccurrenceFeedStage[]
  readonly typeIn?: readonly string[]
}

export type TripOccurrenceFeedPage = {
  readonly items: readonly TripOccurrenceFeedItem[]
  readonly nextCursor: null | string
}

export type TripOccurrenceFeedQuery = {
  readonly companyId: string
  readonly cursor: null | string
  readonly filters?: TripOccurrenceFeedFilters
  readonly limit: number
  readonly order: OccurrenceFeedOrder
}

export type TripOccurrenceFeedReaderPort = {
  listFeed(query: TripOccurrenceFeedQuery): Promise<TripOccurrenceFeedPage>
  listAttachmentLocations(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<
    readonly {
      readonly bucket: string
      readonly id: string
      readonly mimeType: string
      readonly objectKey: string
    }[]
  >
}

export type ListTripOccurrenceFeedInput = {
  readonly context: { readonly companyId: string }
  readonly cursor: null | string
  readonly filters?: TripOccurrenceFeedFilters
  readonly limit: number
  readonly order: OccurrenceFeedOrder
}

export function createListTripOccurrenceFeedUseCase(dependencies: {
  readonly reader: TripOccurrenceFeedReaderPort
}): { execute(input: ListTripOccurrenceFeedInput): Promise<TripOccurrenceFeedPage> } {
  return {
    async execute(input: ListTripOccurrenceFeedInput): Promise<TripOccurrenceFeedPage> {
      return dependencies.reader.listFeed({
        companyId: input.context.companyId,
        cursor: input.cursor,
        limit: input.limit,
        order: input.order,
        ...(input.filters === undefined ? {} : { filters: input.filters }),
      })
    },
  }
}

/** O que a rota de anexos publica: URL assinada de vida curta, nunca bucket nem chave. */
export type TripOccurrenceAttachmentView = {
  readonly downloadUrl: string
  readonly expiresAt: string
  readonly id: string
  readonly mimeType: string
}

export type ReadTripOccurrenceAttachmentsInput = {
  readonly context: { readonly companyId: string }
  readonly occurrenceId: string
}

/**
 * Ocorrência sem anexo é **lista vazia**, nunca erro: "não anexou" e "não existe" respondem igual
 * para não confirmar a existência de ocorrência de outra empresa pela diferença de status.
 */
export function createReadTripOccurrenceAttachmentsUseCase(dependencies: {
  readonly downloads: DeliveryProofDownloadPort
  readonly reader: TripOccurrenceFeedReaderPort
}): {
  execute(
    input: ReadTripOccurrenceAttachmentsInput,
  ): Promise<readonly TripOccurrenceAttachmentView[]>
} {
  return {
    async execute(
      input: ReadTripOccurrenceAttachmentsInput,
    ): Promise<readonly TripOccurrenceAttachmentView[]> {
      const locations = await dependencies.reader.listAttachmentLocations({
        companyId: input.context.companyId,
        occurrenceId: input.occurrenceId,
      })

      return Promise.all(
        locations.map(async (location) => {
          const download = await dependencies.downloads.createDownloadUrl({
            bucket: location.bucket,
            fileName: `ocorrencia-${location.id}`,
            objectKey: location.objectKey,
          })

          return {
            downloadUrl: download.url,
            expiresAt: download.expiresAt,
            id: location.id,
            mimeType: location.mimeType,
          }
        }),
      )
    },
  }
}
