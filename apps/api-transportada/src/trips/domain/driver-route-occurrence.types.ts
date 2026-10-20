/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: as ocorrências da rota pela ótica do motorista. `Facts` é o que o leitor traz
 * do banco; o resto é o que a rota publica.
 */
import type { OccurrenceKind } from '../application/occurrence-resolution.port.js'
import type {
  OccurrenceResolutionEventFact,
  SystemResolutionPhraseKey,
} from './occurrence-resolution.types.js'

export type DriverRouteOccurrenceFileFact = {
  readonly bucket: string
  readonly contentType: string
  /** ISO 8601; a hora em que o arquivo entrou na ocorrência. */
  readonly createdAt: string
  /** `null` na foto e na assinatura: só o anexo do chat tem nome. */
  readonly fileName: string | null
  readonly objectId: string
  readonly objectKey: string
  readonly retentionUntil: string | undefined
  readonly sizeBytes: number
}

export type DriverRouteOccurrenceChatAttachmentFact = DriverRouteOccurrenceFileFact & {
  readonly messageId: string
}

export type DriverRouteOccurrenceFacts = {
  readonly cancelledAt: string | undefined
  readonly chatAttachments: readonly DriverRouteOccurrenceChatAttachmentFact[]
  readonly documentId: string | null
  readonly documentNumber: string | null
  readonly events: readonly OccurrenceResolutionEventFact[]
  readonly hasConversation: boolean
  readonly id: string
  readonly kind: OccurrenceKind
  readonly note: string
  readonly photos: readonly DriverRouteOccurrenceFileFact[]
  readonly recordedAt: string
  readonly recordedByMe: boolean
  readonly reportKey: string | null
  readonly signature: DriverRouteOccurrenceFileFact | null
  readonly stopId: string
  readonly stopSequence: number
  readonly type: { readonly iconName: string | null; readonly id: string; readonly name: string }
}

export type DriverRouteOccurrenceResolutionView = {
  readonly actorKind: 'internal' | 'system'
  readonly at: string
  readonly note: string | null
  readonly phraseKey: SystemResolutionPhraseKey | null
}

export type DriverRouteOccurrenceItem = {
  readonly conversation: { readonly exists: boolean }
  readonly documentCount: number
  readonly documentId: string | null
  readonly documentNumber: string | null
  readonly id: string
  readonly kind: OccurrenceKind
  readonly recordedAt: string
  readonly recordedByMe: boolean
  readonly reopenedAt: string | null
  readonly reportKey: string | null
  readonly resolution: DriverRouteOccurrenceResolutionView | null
  readonly state: 'open' | 'resolved' | 'cancelled'
  readonly stopId: string
  readonly stopSequence: number
  readonly type: { readonly iconName: string | null; readonly id: string; readonly name: string }
}

export type DriverRouteOccurrenceFileView = {
  readonly contentType: string
  readonly name: string | null
  readonly objectId: string
  readonly sizeBytes: number
}

export type DriverRouteOccurrenceTimelineEvent = {
  readonly at: string
  readonly kind: 'recorded' | 'photo' | 'cancelled' | 'resolution.resolved' | 'resolution.reopened'
}

export type DriverRouteOccurrenceDetail = DriverRouteOccurrenceItem & {
  readonly attachments: readonly (DriverRouteOccurrenceFileView & { readonly messageId: string })[]
  readonly note: string
  readonly photos: readonly DriverRouteOccurrenceFileView[]
  readonly signature: DriverRouteOccurrenceFileView | null
  readonly timeline: readonly DriverRouteOccurrenceTimelineEvent[]
}
