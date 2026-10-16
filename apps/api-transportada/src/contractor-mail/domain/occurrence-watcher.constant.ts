/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/** Spec 267: o responsável ativo vai em cópia; o inativo continua listado e não recebe nada. */
export const OCCURRENCE_WATCHER_STATUSES = ['active', 'inactive'] as const
export type OccurrenceWatcherStatus = (typeof OCCURRENCE_WATCHER_STATUSES)[number]

export const OCCURRENCE_WATCHER_MAX_ACTIVE = 10
export const OCCURRENCE_WATCHER_MAX_TOTAL = 30
