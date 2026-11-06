/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect } from 'react'

import type { AccessKeyLookupRow } from '../shared/accessKeyLookupRow.service'
import {
  useAccessKeyLookupQueue,
  type AccessKeyLookupQueueController,
  type UseAccessKeyLookupQueueInput,
} from './useAccessKeyLookupQueue.hook'

export type AccessKeyLookupController = Readonly<{
  markXmlImported: (documentId: string) => void
  recheck: () => Promise<boolean>
  retry: () => void
  row: AccessKeyLookupRow | undefined
}>

/** Uma chave só: confere, busca e acompanha pelo mesmo caminho da fila, sem segunda implementação. */
export function useAccessKeyLookup(
  accessKey: string,
  input: UseAccessKeyLookupQueueInput = {},
): AccessKeyLookupController {
  const queue: AccessKeyLookupQueueController = useAccessKeyLookupQueue(input)
  const { add } = queue
  useEffect(() => {
    add(accessKey)
  }, [accessKey, add])

  return {
    markXmlImported: (documentId) => queue.markXmlImported(accessKey, documentId),
    recheck: () => queue.recheck(accessKey),
    retry: () => queue.retry(accessKey),
    row: queue.rows.find((row) => row.accessKey === accessKey),
  }
}
