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
  issuedAt: null | string
  city: string
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

const UF_PATTERN = /^[A-Za-z]{2}$/u

/** O endereço da parada termina em ", CIDADE, UF"; sem a UF no fim não há como afirmar a cidade. */
export function extractCityFromStopLabel(label: string): string {
  const parts = label.split(',').map((part) => part.trim())
  const [state, city] = [parts.at(-1), parts.at(-2)]

  if (parts.length < 3 || state === undefined || !UF_PATTERN.test(state)) return ''
  return city ?? ''
}

function toRow(document: TripDocumentDetail, destinationLabel: string): TripConferenceRow {
  return {
    city: extractCityFromStopLabel(destinationLabel),
    issuedAt: hasText(document.nfeIssuedAt) ? document.nfeIssuedAt : null,
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
