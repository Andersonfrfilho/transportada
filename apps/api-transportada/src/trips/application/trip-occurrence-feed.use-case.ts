/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A página de ocorrências do escritório: une o que houve com a nota (`trip_document_occurrences`)
 * e o que houve na parada (`trip_stop_occurrences`) numa lista só, por empresa. **Leitura pura** —
 * não existe "tratar" ocorrência nesta versão, e a lista não muda estado nenhum.
 */
import type { TripOccurrenceStage } from '../../shared/trip-occurrence.constant.js'
import type {
  TripOccurrenceCaseDecisionKind,
  TripOccurrenceCaseStatus,
} from '../../database/trip.schema.js'
import type { TripFieldChannel } from '../domain/trip-field-channel.constant.js'
import type { OccurrenceFeedOrder } from '../domain/occurrence-feed.policy.js'
import type { DeliveryProofDownloadPort } from './read-delivery-proof.use-case.js'
import { buildOccurrenceAttachmentViews } from './occurrence-attachment.service.js'
import type {
  OccurrenceAttachmentRecord,
  OccurrenceAttachmentView,
} from './occurrence-attachment.service.js'

/**
 * O grupo do filtro tem três valores, não dois: as ocorrências de parada não têm tipo cadastrado
 * nem estágio — elas são o relato de campo da spec 057 — e escondê-las atrás de `delivery`
 * misturaria relato de parada com recusa de nota.
 */
export const TRIP_OCCURRENCE_FEED_STAGES = ['separation', 'delivery', 'stop'] as const
export type TripOccurrenceFeedStage = (typeof TRIP_OCCURRENCE_FEED_STAGES)[number]

/**
 * Spec 164 T8 (RF10): a tratativa desta ocorrência, ou `null` quando não há uma aberta — nunca um
 * estado inventado. Só a ocorrência de nota tem tratativa; a de parada é sempre `null` (a tabela
 * `trip_occurrence_cases` referencia `trip_document_occurrences`, não `trip_stop_occurrences`).
 * `settlementTotal` é sempre `null` nesta fase: o item do acerto (`trip_occurrence_item_settlements`)
 * é da Fase 5 (T16/T17), que ainda não existe nesta árvore.
 */
export type TripOccurrenceFeedCaseView = {
  readonly decision: {
    readonly decidedAt: null | string
    readonly kind: TripOccurrenceCaseDecisionKind
    readonly note: string
  } | null
  readonly redeliveryPolicy: 'allowed' | 'blocked'
  readonly settlementTotal: null
  readonly status: TripOccurrenceCaseStatus
  readonly updatedAt: string
}

/**
 * Spec 183 RF2: de quem é a carga, para onde ia e quanto vale. `null` quando a ocorrência não tem
 * nota (relato de parada sem nota).
 *
 * - `totalValue` é `nfe_documents.total_value` em **string decimal** — dinheiro nunca vira `number`;
 * - `contractor` é o **emitente** da nota, casado com `contractors` pelo CNPJ dentro da empresa (a
 *   regra de `findChargeParties`, 143 RF3); sem cadastro, o nome do emitente e `contractorId` nulo;
 *   `null` quando a nota não tem emitente gravado;
 * - `destination` é o **destino físico** (`resolvePhysicalDestination`, spec 073): `<entrega>` vence
 *   `<enderDest>`, porque é onde o caminhão para; `null` sem endereço gravado.
 */
export type TripOccurrenceFeedDocument = {
  readonly contractor: {
    readonly contractorId: null | string
    readonly name: string
    readonly taxId: null | string
  } | null
  readonly destination: {
    readonly city: string
    readonly label: string
    readonly origin: 'delivery' | 'recipient'
    readonly postalCode: null | string
    readonly recipientName: string
    readonly state: string
  } | null
  readonly nfeDocumentId: string
  readonly totalValue: string
}

export type TripOccurrenceFeedItem = {
  /** Spec 156 T9 (D3): nome de quem clicou, `null` sem vínculo ativo na empresa. */
  readonly actorName: string | null
  /** Spec 164 T8 (RF10): `null` quando a ocorrência não tem tratativa aberta. */
  readonly case: TripOccurrenceFeedCaseView | null
  readonly channel: TripFieldChannel
  readonly createdAt: string
  readonly description: string
  /** Spec 183 RF2: a nota da ocorrência, `null` sem nota. */
  readonly document: TripOccurrenceFeedDocument | null
  /** Primeiro condutor da viagem. Vazio quando a viagem nasceu sem motorista pareado. */
  readonly driverName: string
  /**
   * Spec 161 T10 (RF10): a ocorrência de parada carrega no máximo um anexo (coluna antiga); a de
   * nota reflete a existência real na tabela nova (D2) ou na coluna antiga (D6, rua) — deixou de
   * ser `false` fixo.
   */
  readonly hasAttachment: boolean
  readonly id: string
  readonly invoiceNumber: null | string
  readonly invoiceSeries: null | string
  /** O tipo cadastrado avisa o embarcador quando a empresa ligou isso. Falso para parada. */
  readonly notifies: boolean
  /** Spec 156 T9 (D3): só quando `channel = 'office'` — o motorista em nome de quem se registrou. */
  readonly onBehalfOfDriverName: string | null
  readonly source: 'document' | 'stop'
  readonly stage: null | TripOccurrenceStage
  readonly stopLabel: null | string
  readonly tripId: string
  /** Nome do tipo cadastrado, ou o `kind` do relato de parada. É o que a tela imprime. */
  readonly typeName: string
  readonly vehiclePlate: string
}

/** RF11: `'none'` é "sem tratativa" — a ocorrência não tem `trip_occurrence_cases`. */
export type TripOccurrenceFeedCaseStatusFilter = 'none' | TripOccurrenceCaseStatus

export type TripOccurrenceFeedFilters = {
  readonly caseStatusIn?: readonly TripOccurrenceFeedCaseStatusFilter[]
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
  }): Promise<readonly OccurrenceAttachmentRecord[]>
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

/**
 * Spec 161 T10 (RF8/RF10/CA6): o que a rota de anexos publica — o mesmo formato de RF8
 * (`OccurrenceAttachmentView`, ver `occurrence-attachment.service.ts`), com `thumbnailUrl` quando
 * há miniatura e `expired`/sem URL nenhuma para retenção vencida. `TripOccurrenceAttachmentView` é
 * o nome antigo, mantido como alias para não obrigar os dois chamadores (feed e painel) a
 * importarem de dois lugares diferentes o mesmo formato.
 */
export type TripOccurrenceAttachmentView = OccurrenceAttachmentView

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
      const records = await dependencies.reader.listAttachmentLocations({
        companyId: input.context.companyId,
        occurrenceId: input.occurrenceId,
      })

      return buildOccurrenceAttachmentViews({ downloads: dependencies.downloads, records })
    },
  }
}
