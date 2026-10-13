/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T5.4: marks, on each note of the driver's trips, the occurrences that opened a contractor reply
 * with the reply status. Called by the use case after the link cut, never by the repository. One query for
 * every note. A failure only takes the field out: the driver's read is the critical path and must not fall
 * for a refinement (an earlier API simply does not send it, and the app shows nothing).
 */
import { safeLogWarn } from '../../logging/safe-logger.service.js'
import type {
  DriverContractorRepliesDependency,
  DriverDocumentContractorReply,
} from './driver-document-contractor-reply.port.js'
import type {
  DriverRegisteredOccurrence,
  DriverTrip,
  DriverTripDocument,
} from './find-current-driver-trip.use-case.js'

const DRIVER_CONTRACTOR_REPLY_UNAVAILABLE_MESSAGE = 'driver_contractor_reply_unavailable'

export type AttachDriverDocumentContractorRepliesParams = {
  readonly companyId: string
  readonly dependency?: DriverContractorRepliesDependency
  readonly trips: readonly DriverTrip[]
}

function listDocumentIds(trips: readonly DriverTrip[]): readonly string[] {
  return trips.flatMap((trip) =>
    trip.stops.flatMap((stop) => stop.documents.map((document) => document.id)),
  )
}

function groupByDocument(
  replies: readonly DriverDocumentContractorReply[],
): ReadonlyMap<string, readonly DriverRegisteredOccurrence[]> {
  const grouped = new Map<string, DriverRegisteredOccurrence[]>()
  for (const reply of replies) {
    const occurrences = grouped.get(reply.documentId) ?? []
    occurrences.push({ contractorReply: { status: reply.status }, id: reply.occurrenceId })
    grouped.set(reply.documentId, occurrences)
  }
  return grouped
}

function applyReplies(
  trips: readonly DriverTrip[],
  repliesByDocument: ReadonlyMap<string, readonly DriverRegisteredOccurrence[]>,
): readonly DriverTrip[] {
  return trips.map((trip) => ({
    ...trip,
    stops: trip.stops.map((stop) => ({
      ...stop,
      documents: stop.documents.map((document): DriverTripDocument => {
        const registeredOccurrences = repliesByDocument.get(document.id)
        return registeredOccurrences === undefined
          ? document
          : { ...document, registeredOccurrences }
      }),
    })),
  }))
}

/** The driver's trips with `registeredOccurrences` on the notes that have a reply; the others as they came. */
export async function attachDriverDocumentContractorReplies(
  params: AttachDriverDocumentContractorRepliesParams,
): Promise<readonly DriverTrip[]> {
  const { companyId, dependency, trips } = params
  if (dependency === undefined) return trips
  const documentIds = listDocumentIds(trips)
  if (documentIds.length === 0) return trips

  try {
    const replies = await dependency.reader.list({ companyId, documentIds })
    if (replies.length === 0) return trips
    return applyReplies(trips, groupByDocument(replies))
  } catch {
    if (dependency.logger !== undefined) {
      safeLogWarn({
        logger: dependency.logger,
        message: DRIVER_CONTRACTOR_REPLY_UNAVAILABLE_MESSAGE,
        metadata: { companyId, documentCount: documentIds.length },
      })
    }
    return trips
  }
}
