/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useMemo, useState } from 'react'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import {
  useAccessKeyLookupQueue,
  type UseAccessKeyLookupQueueInput,
} from '@/modules/nfe-access-key-lookup/hooks/useAccessKeyLookupQueue.hook'

import { createNfeWorkspaceClient } from '../shared/nfeWorkspaceClient.service'
import {
  filterAccessKeyImportRows,
  summarizeAccessKeyImport,
  type AccessKeyImportFilter,
} from '../shared/accessKeyImportSummary.service'
import {
  loadAccessKeyImportSession,
  saveAccessKeyImportSession,
} from '../shared/accessKeyImportSession.service'

export type XmlFeedback = Readonly<{ accessKey: string; kind: 'failed' | 'notImported' }>

export type UseAccessKeyImportInput = Readonly<{
  lookup?: UseAccessKeyLookupQueueInput
  /** O leitor de mão perde o foco a cada clique: toda ação da lista o devolve a ele. */
  refocusReader: () => void
  uploadXml?: (file: File) => Promise<void>
}>

function uploadXmlFile(file: File): Promise<void> {
  const client = createNfeWorkspaceClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
  return client
    .requestUpload({ files: [file], idempotencyKey: crypto.randomUUID() })
    .then(() => undefined)
}

/** Na página de NF-e bipar **importa**: a fila de busca é a mesma da viagem, sem viagem por trás. */
export function useAccessKeyImport(input: UseAccessKeyImportInput) {
  const { refocusReader, uploadXml = uploadXmlFile } = input
  const queue = useAccessKeyLookupQueue(input.lookup)
  const { restore } = queue
  const [filter, setFilter] = useState<AccessKeyImportFilter>('all')
  const [unreadable, setUnreadable] = useState(0)
  const [repeatedKey, setRepeatedKey] = useState<string | undefined>(undefined)
  const [xmlFeedback, setXmlFeedback] = useState<XmlFeedback | undefined>(undefined)

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

  async function sendXml(accessKey: string, file: File | undefined): Promise<void> {
    if (file === undefined) return
    setXmlFeedback(undefined)
    try {
      await uploadXml(file)
      if (!(await queue.recheck(accessKey))) setXmlFeedback({ accessKey, kind: 'notImported' })
    } catch {
      setXmlFeedback({ accessKey, kind: 'failed' })
    }
    refocusReader()
  }

  return {
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
