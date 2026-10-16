/* Copyright (c) 2026 Ada Technology. MIT License. */
import { isRecord, isString } from './occurrenceConversationGuards.validation'
import {
  OCCURRENCE_CONVERSATION_ERROR,
  OccurrenceConversationRequestError,
  requestJson,
  type ClientDependencies,
} from './occurrenceConversationClient.service'
import type {
  OccurrenceWatcherCandidate,
  OccurrenceWatcherItem,
  OccurrenceWatcherList,
  OccurrenceWatcherScope,
  OccurrenceWatcherStatus,
} from './occurrenceWatchers.types'

const COMPANY_PATH = '/company-settings/occurrence-watchers'

export type OccurrenceWatchersClient = Readonly<{
  add: (scope: OccurrenceWatcherScope, userId: string) => Promise<void>
  list: (scope: OccurrenceWatcherScope) => Promise<OccurrenceWatcherList>
  listCandidates: () => Promise<readonly OccurrenceWatcherCandidate[]>
  remove: (scope: OccurrenceWatcherScope, userId: string) => Promise<void>
  setStatus: (
    scope: OccurrenceWatcherScope,
    input: Readonly<{ status: OccurrenceWatcherStatus; userId: string }>,
  ) => Promise<void>
}>

function collectionPath(scope: OccurrenceWatcherScope): string {
  return scope.kind === 'company'
    ? COMPANY_PATH
    : `/contractors/${encodeURIComponent(scope.contractorId)}/occurrence-watchers`
}

function itemPath(scope: OccurrenceWatcherScope, userId: string): string {
  return `${collectionPath(scope)}/${encodeURIComponent(userId)}`
}

function toItem(value: unknown): null | OccurrenceWatcherItem {
  if (
    !isRecord(value) ||
    !isString(value.userId) ||
    !isString(value.name) ||
    typeof value.eligible !== 'boolean' ||
    !(value.maskedEmail === null || isString(value.maskedEmail)) ||
    (value.status !== 'active' && value.status !== 'inactive')
  ) {
    return null
  }
  return {
    eligible: value.eligible,
    maskedEmail: value.maskedEmail,
    name: value.name,
    status: value.status,
    userId: value.userId,
  }
}

function toCandidate(value: unknown): null | OccurrenceWatcherCandidate {
  if (
    !isRecord(value) ||
    !isString(value.userId) ||
    !isString(value.name) ||
    !(value.maskedEmail === null || isString(value.maskedEmail))
  ) {
    return null
  }
  return { maskedEmail: value.maskedEmail, name: value.name, userId: value.userId }
}

function readList(payload: unknown): OccurrenceWatcherList {
  const data = isRecord(payload) ? payload.data : undefined
  if (!isRecord(data) || !Array.isArray(data.watchers)) {
    throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.RESPONSE_INVALID)
  }
  return {
    effectiveSource:
      data.effectiveSource === 'company' || data.effectiveSource === 'contractor'
        ? data.effectiveSource
        : null,
    watchers: data.watchers.flatMap((watcher) => toItem(watcher) ?? []),
  }
}

/** Spec 267: o cadastro dos responsáveis (`settings.manage`), por item, na empresa e na contratante. */
export function createOccurrenceWatchersClient(
  dependencies: ClientDependencies,
): OccurrenceWatchersClient {
  return {
    async add(scope, userId) {
      await requestJson(dependencies, collectionPath(scope), { body: { userId }, method: 'POST' })
    },
    async list(scope) {
      return readList(await requestJson(dependencies, collectionPath(scope)))
    },
    async listCandidates() {
      const payload = await requestJson(dependencies, `${COMPANY_PATH}/candidates`)
      const data = isRecord(payload) ? payload.data : undefined
      return Array.isArray(data) ? data.flatMap((candidate) => toCandidate(candidate) ?? []) : []
    },
    async remove(scope, userId) {
      await requestJson(dependencies, itemPath(scope, userId), { method: 'DELETE' })
    },
    async setStatus(scope, { status, userId }) {
      await requestJson(dependencies, itemPath(scope, userId), {
        body: { status },
        method: 'PATCH',
      })
    },
  }
}
