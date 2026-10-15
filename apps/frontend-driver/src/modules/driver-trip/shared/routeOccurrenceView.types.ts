/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverRouteOccurrence, RouteOccurrenceKind } from './driverRouteOccurrence.types'
import type { QueuedReport } from './offlineQueue.service'

/** `queued` e `rejected` são da fila local; os outros vêm do servidor (spec 266 RF1). */
export type RouteOccurrenceEntryState = 'queued' | 'rejected' | 'open' | 'resolved' | 'cancelled'

export type RouteOccurrenceFilter = 'all' | 'unread' | 'documents' | 'refused' | 'queued'

/** O que a junção precisa da rota para achar parada e número da nota de um item da fila. */
export type RouteOccurrenceStopReference = Readonly<{
  documents: readonly Readonly<{ id: string; number: string }>[]
  id: string
  sequence: number
}>

export type RouteOccurrenceEntry = Readonly<{
  documentId: string | null
  documentNumber: string | null
  hasConversation: boolean
  hasDocument: boolean
  /** Servidor: o id da ocorrência. Fila: a chave de idempotência do toque. */
  id: string
  iconName: string | null
  isReopened: boolean
  kind: RouteOccurrenceKind
  recordedAt: string
  /** Só `rejected`: a causa que a fila guardou. */
  rejectionCause: string | undefined
  resolutionNote: string | undefined
  source: 'queue' | 'server'
  state: RouteOccurrenceEntryState
  stopId: string
  stopSequence: number | undefined
  typeId: string | null
  typeName: string | null
  unreadCount: number
}>

export type BuildRouteOccurrenceEntriesParams = Readonly<{
  queuedReports: readonly QueuedReport[]
  serverOccurrences: readonly DriverRouteOccurrence[]
  stops: readonly RouteOccurrenceStopReference[]
  /** `conversationDigests`: não lidas por id de ocorrência do servidor. */
  unreadByOccurrenceId: ReadonlyMap<string, number>
}>

export type RouteOccurrenceGroups = Readonly<{
  /** Em aberto: fila, recusadas e abertas do servidor. */
  open: readonly RouteOccurrenceEntry[]
  /** Resolvidas e canceladas. */
  closed: readonly RouteOccurrenceEntry[]
}>

export type FilterRouteOccurrencesParams = Readonly<{
  entries: readonly RouteOccurrenceEntry[]
  filter: RouteOccurrenceFilter
}>

export type RouteOccurrenceNoteGroup = Readonly<{
  /** Os ícones mostrados: todos até 4; acima disso, só os 3 primeiros. */
  visible: readonly RouteOccurrenceEntry[]
  documentId: string
  documentNumber: string | null
  entries: readonly RouteOccurrenceEntry[]
  moreCount: number
}>

export type RouteOccurrenceStopLevelGroup = Readonly<{
  entries: readonly RouteOccurrenceEntry[]
  moreCount: number
  visible: readonly RouteOccurrenceEntry[]
}>

export type RouteOccurrenceStopGroup = Readonly<{
  noteGroups: readonly RouteOccurrenceNoteGroup[]
  stopId: string
  stopLevel: RouteOccurrenceStopLevelGroup | undefined
  stopSequence: number | undefined
}>

export type ListSiblingRouteOccurrencesParams = Readonly<{
  current: RouteOccurrenceEntry
  entries: readonly RouteOccurrenceEntry[]
}>

export type RouteOccurrenceSiblings = Readonly<{
  /** Primeiro: as da mesma nota. */
  sameNote: readonly RouteOccurrenceEntry[]
  /** Depois: as demais da mesma parada. */
  sameStop: readonly RouteOccurrenceEntry[]
}>
