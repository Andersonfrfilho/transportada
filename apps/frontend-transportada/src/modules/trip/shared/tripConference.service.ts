/* Copyright (c) 2026 Ada Technology. MIT License. */
import { sumScaledAmounts } from '@/modules/shared/decimalAmount.service'

import type { TripDocumentDetail, TripStopDetail } from './trip.types'

type TripConferenceSource = Readonly<{
  documents: readonly TripDocumentDetail[]
  stops: readonly TripStopDetail[]
}>

export type TripConferenceRow = Readonly<{
  clientName: string
  destinationLabel: string
  documentId: string
  noteNumber: string
  noteSeries: string
  totalValue: null | string
  volumeCount: null | number
}>

export type TripConferenceSummary = Readonly<{
  noteCount: number
  notesWithoutValue: number
  stopCount: number
  totalValue: string
  totalVolumes: number
}>

export type TripConference = Readonly<{
  rows: readonly TripConferenceRow[]
  summary: TripConferenceSummary
}>

function hasText(value: null | string | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== ''
}

function toRow(document: TripDocumentDetail, destinationLabel: string): TripConferenceRow {
  return {
    clientName: hasText(document.contact?.name) ? document.contact.name.trim() : '',
    destinationLabel,
    documentId: document.id,
    noteNumber: document.nfeNumber?.trim() ?? '',
    noteSeries: document.nfeSeries?.trim() ?? '',
    totalValue: hasText(document.nfeTotalValue) ? document.nfeTotalValue.trim() : null,
    volumeCount: typeof document.volumeCount === 'number' ? document.volumeCount : null,
  }
}

/** A conferência rápida da montagem: o que está na viagem, nota a nota, na ordem das paradas. */
export function buildTripConference(source: TripConferenceSource): TripConference {
  const orderedStops = [...source.stops].sort((left, right) => left.sequence - right.sequence)
  const stopRows = orderedStops.flatMap((stop) =>
    stop.documents.map((document) => toRow(document, stop.label)),
  )
  const listedIds = new Set(stopRows.map((row) => row.documentId))
  const looseRows = source.documents
    .filter((document) => !listedIds.has(document.id))
    .map((document) => toRow(document, ''))
  const rows = [...stopRows, ...looseRows]
  const values = rows.flatMap((row) => (row.totalValue === null ? [] : [row.totalValue]))

  return {
    rows,
    summary: {
      noteCount: rows.length,
      notesWithoutValue: rows.length - values.length,
      stopCount: orderedStops.filter((stop) => stop.documents.length > 0).length,
      totalValue: sumScaledAmounts(values),
      totalVolumes: rows.reduce((sum, row) => sum + (row.volumeCount ?? 0), 0),
    },
  }
}
