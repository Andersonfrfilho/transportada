/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripDetail } from './trip.types'

export type DocumentLinkLinked = Readonly<{
  nfeDocumentId: string
  stopId: null | string
  tripDocumentId: string
}>

export type DocumentLinkSkipped = Readonly<{
  nfeDocumentId: string
  reason: 'already_linked'
}>

/** Spec 257 D2: `POST /trips/:id/documents/after-dispatch` — o que entrou, o que foi pulado e os avisos fiscais. */
export type DocumentLinkAfterDispatch = Readonly<{
  createdStopIds: readonly string[]
  documentsWithoutCte: number
  eventId: null | string
  linked: readonly DocumentLinkLinked[]
  mdfeDocumentDivergence: boolean
  skipped: readonly DocumentLinkSkipped[]
}>

export type LinkDocumentsAfterDispatchResult = Readonly<{
  link: DocumentLinkAfterDispatch
  trip: TripDetail
}>

export type LinkDocumentsAfterDispatchInput = Readonly<{
  nfeDocumentIds: readonly string[]
  reason: string
  tripId: string
}>
