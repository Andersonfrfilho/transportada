/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { getAccessKeyLookupClient } from '../queries/accessKeyLookup.query'
import type { AccessKeyLookupClient } from '../shared/accessKeyLookupClient.service'
import {
  createAccessKeyLookupQueue,
  type AccessKeyLookupQueue,
  type AddAccessKeyResult,
  type QueueScheduler,
  type RestoredAccessKey,
} from '../shared/accessKeyLookupQueue.service'
import type { AccessKeyLookupRow } from '../shared/accessKeyLookupRow.service'

export type UseAccessKeyLookupQueueInput = Readonly<{
  client?: AccessKeyLookupClient
  scheduler?: QueueScheduler
}>

export type AccessKeyLookupQueueController = Readonly<{
  add: (accessKey: string) => AddAccessKeyResult
  clear: () => void
  markXmlImported: (accessKey: string, documentId: string) => void
  recheck: (accessKey: string) => Promise<boolean>
  restore: (entries: readonly RestoredAccessKey[]) => void
  retry: (accessKey: string) => void
  rows: readonly AccessKeyLookupRow[]
}>

/**
 * O polling e o agrupamento de 500 ms moram no serviço (testável sem DOM); o hook só amarra o
 * ciclo de vida: a fila nasce com a tela e para de consultar quando ela fecha.
 */
export function useAccessKeyLookupQueue(
  input: UseAccessKeyLookupQueueInput = {},
): AccessKeyLookupQueueController {
  const [queue] = useState<AccessKeyLookupQueue>(() =>
    createAccessKeyLookupQueue({
      client: input.client ?? getAccessKeyLookupClient(),
      ...(input.scheduler === undefined ? {} : { scheduler: input.scheduler }),
    }),
  )
  useEffect(() => {
    queue.start()
    return queue.stop
  }, [queue])
  const rows = useSyncExternalStore(queue.subscribe, queue.getRows)
  const add = useCallback((accessKey: string) => queue.add(accessKey), [queue])

  return {
    add,
    clear: queue.clear,
    markXmlImported: queue.markXmlImported,
    recheck: queue.recheck,
    restore: queue.restore,
    retry: queue.retry,
    rows,
  }
}
