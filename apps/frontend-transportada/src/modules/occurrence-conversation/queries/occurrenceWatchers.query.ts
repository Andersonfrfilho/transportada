/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { getOccurrenceWatchersClient } from '../shared/occurrenceWatchersClient.provider'
import type { OccurrenceWatcherScope } from '../shared/occurrenceWatchers.types'

export const OCCURRENCE_WATCHERS_QUERY_KEY = 'occurrence-watchers'

function scopeKey(scope: OccurrenceWatcherScope): readonly string[] {
  return scope.kind === 'company' ? ['company'] : ['contractor', scope.contractorId]
}

export function useOccurrenceWatchersQuery(
  input: Readonly<{ enabled: boolean; scope: OccurrenceWatcherScope }>,
) {
  const client = getOccurrenceWatchersClient()
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.list(input.scope),
    queryKey: [OCCURRENCE_WATCHERS_QUERY_KEY, 'list', ...scopeKey(input.scope)],
  })
}

export function useOccurrenceWatcherCandidatesQuery(input: Readonly<{ enabled: boolean }>) {
  const client = getOccurrenceWatchersClient()
  return useQuery({
    enabled: input.enabled,
    queryFn: () => client.listCandidates(),
    queryKey: [OCCURRENCE_WATCHERS_QUERY_KEY, 'candidates'],
  })
}

/** Toda escrita relê as listas (a da empresa e as das contratantes) e a prévia do envio, que mostra a cópia. */
export function useOccurrenceWatcherMutations(scope: OccurrenceWatcherScope) {
  const queryClient = useQueryClient()
  const client = getOccurrenceWatchersClient()
  const onSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: [OCCURRENCE_WATCHERS_QUERY_KEY] })
  }
  return {
    add: useMutation({ mutationFn: (userId: string) => client.add(scope, userId), onSuccess }),
    remove: useMutation({
      mutationFn: (userId: string) => client.remove(scope, userId),
      onSuccess,
    }),
    setStatus: useMutation({
      mutationFn: (input: Readonly<{ status: 'active' | 'inactive'; userId: string }>) =>
        client.setStatus(scope, input),
      onSuccess,
    }),
  }
}
