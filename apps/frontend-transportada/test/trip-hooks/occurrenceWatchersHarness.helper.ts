/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 267: a API dos responsáveis por ocorrências dublada **uma vez** (`mock.module` não se desfaz e vale para o processo
 * inteiro); cada teste reconfigura `watcherFakes`. A ficha da contratante monta o painel, então toda ficha de teste
 * instala este duplo (`installContractorDirectoryDouble`). Nomes e e-mails sintéticos.
 */
import { mock } from 'bun:test'

import { OccurrenceConversationRequestError } from '@/modules/occurrence-conversation/shared/occurrenceConversationClient.service'
import type { OccurrenceWatchersClient } from '@/modules/occurrence-conversation/shared/occurrenceWatchersClient.service'
import type {
  OccurrenceWatcherCandidate,
  OccurrenceWatcherItem,
  OccurrenceWatcherList,
} from '@/modules/occurrence-conversation/shared/occurrenceWatchers.types'

export const ANA: OccurrenceWatcherItem = {
  eligible: true,
  maskedEmail: 'a***@e***.example',
  name: 'Ana',
  status: 'active',
  userId: 'user-ana',
}

export const BRUNO_CANDIDATE: OccurrenceWatcherCandidate = {
  maskedEmail: 'b***@e***.example',
  name: 'Bruno',
  userId: 'user-bruno',
}

type WatcherFakes = {
  calls: string[]
  candidates: readonly OccurrenceWatcherCandidate[]
  failWith: string | undefined
  lists: Record<string, OccurrenceWatcherList>
}

export const watcherFakes: WatcherFakes = {
  calls: [],
  candidates: [],
  failWith: undefined,
  lists: {},
}

function keyOf(scope: Parameters<OccurrenceWatchersClient['list']>[0]): string {
  return scope.kind === 'company' ? 'company' : `contractor:${scope.contractorId}`
}

function reject(): Promise<never> | undefined {
  if (watcherFakes.failWith === undefined) return undefined
  return Promise.reject(new OccurrenceConversationRequestError(watcherFakes.failWith))
}

const client: OccurrenceWatchersClient = {
  add: (scope, userId) => {
    watcherFakes.calls.push(`add:${keyOf(scope)}:${userId}`)
    return reject() ?? Promise.resolve()
  },
  list: (scope) => {
    watcherFakes.calls.push(`list:${keyOf(scope)}`)
    return Promise.resolve(
      watcherFakes.lists[keyOf(scope)] ?? { effectiveSource: null, watchers: [] },
    )
  },
  listCandidates: () => {
    watcherFakes.calls.push('candidates')
    return Promise.resolve(watcherFakes.candidates)
  },
  remove: (scope, userId) => {
    watcherFakes.calls.push(`remove:${keyOf(scope)}:${userId}`)
    return reject() ?? Promise.resolve()
  },
  setStatus: (scope, { status, userId }) => {
    watcherFakes.calls.push(`status:${keyOf(scope)}:${userId}:${status}`)
    return reject() ?? Promise.resolve()
  },
}

void mock.module(
  '@/modules/occurrence-conversation/shared/occurrenceWatchersClient.provider',
  () => ({
    getOccurrenceWatchersClient: () => client,
  }),
)

/** Zera o registro e a configuração: listas vazias, sem candidatos, sem falha. */
export function installOccurrenceWatchersDouble(): void {
  watcherFakes.calls = []
  watcherFakes.candidates = []
  watcherFakes.failWith = undefined
  watcherFakes.lists = {}
}
