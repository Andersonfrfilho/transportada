/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 267: os responsáveis por ocorrências, como a API devolve (`/company-settings/occurrence-watchers` e
 * `/contractors/:id/occurrence-watchers`). O e-mail chega só mascarado.
 */
export type OccurrenceWatcherStatus = 'active' | 'inactive'

export type OccurrenceWatcherScope =
  | Readonly<{ kind: 'company' }>
  | Readonly<{ contractorId: string; kind: 'contractor' }>

export type OccurrenceWatcherItem = Readonly<{
  /** `false`: perdeu vínculo, permissão ou e-mail — continua listado e não recebe cópia. */
  eligible: boolean
  maskedEmail: null | string
  name: string
  status: OccurrenceWatcherStatus
  userId: string
}>

export type OccurrenceWatcherCandidate = Readonly<{
  maskedEmail: null | string
  name: string
  userId: string
}>

/** `effectiveSource` só vem na lista da contratante: qual lista vale hoje para ela. */
export type OccurrenceWatcherList = Readonly<{
  effectiveSource: 'company' | 'contractor' | null
  watchers: readonly OccurrenceWatcherItem[]
}>
