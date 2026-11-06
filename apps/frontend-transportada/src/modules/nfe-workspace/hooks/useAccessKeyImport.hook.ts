/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useMemo, useState } from 'react'

import {
  useAccessKeyLookupQueue,
  type UseAccessKeyLookupQueueInput,
} from '@/modules/nfe-access-key-lookup/hooks/useAccessKeyLookupQueue.hook'
import { useXmlRecheck } from '@/modules/nfe-access-key-lookup/hooks/useXmlRecheck.hook'

import {
  filterAccessKeyImportRows,
  summarizeAccessKeyImport,
  type AccessKeyImportFilter,
} from '../shared/accessKeyImportSummary.service'
import {
  loadAccessKeyImportSession,
  saveAccessKeyImportSession,
} from '../shared/accessKeyImportSession.service'

export type UseAccessKeyImportInput = Readonly<{
  lookup?: UseAccessKeyLookupQueueInput
  /** O leitor de mão perde o foco a cada clique: toda ação da lista o devolve a ele. */
  refocusReader: () => void
  uploadXml?: (file: File) => Promise<void>
}>

/** Na página de NF-e bipar **importa**: a fila de busca é a mesma da viagem, sem viagem por trás. */
export function useAccessKeyImport(input: UseAccessKeyImportInput) {
  const { refocusReader } = input
  const queue = useAccessKeyLookupQueue(input.lookup)
  const { restore } = queue
  const [filter, setFilter] = useState<AccessKeyImportFilter>('all')
  const [unreadable, setUnreadable] = useState(0)
  const [repeatedKey, setRepeatedKey] = useState<string | undefined>(undefined)
  const { sendXml, xmlFeedback } = useXmlRecheck({
    recheck: queue.recheck,
    refocusReader,
    ...(input.uploadXml === undefined ? {} : { uploadXml: input.uploadXml }),
  })

  useEffect(() => {
    restore(loadAccessKeyImportSession())
  }, [restore])

  useEffect(() => {
    if (queue.rows.length > 0) saveAccessKeyImportSession(queue.rows)
  }, [queue.rows])

  const summary = useMemo(
    () => summarizeAccessKeyImport(queue.rows, unreadable),
    [queue.rows, unreadable],
  )
  const visibleRows = useMemo(
    () => filterAccessKeyImportRows(queue.rows, filter),
    [filter, queue.rows],
  )

  function read(accessKey: string): void {
    const { alreadyScanned } = queue.add(accessKey)
    setRepeatedKey(alreadyScanned ? accessKey : undefined)
    refocusReader()
  }

  function readUnreadable(): void {
    setUnreadable((count) => count + 1)
    refocusReader()
  }

  function clearList(): void {
    queue.clear()
    saveAccessKeyImportSession([])
    setUnreadable(0)
    setRepeatedKey(undefined)
    refocusReader()
  }

  return {
    allRows: queue.rows,
    clearList,
    filter,
    read,
    readUnreadable,
    repeatedKey,
    retry: queue.retry,
    rows: visibleRows,
    sendXml,
    setFilter,
    summary,
    xmlFeedback,
  }
}
