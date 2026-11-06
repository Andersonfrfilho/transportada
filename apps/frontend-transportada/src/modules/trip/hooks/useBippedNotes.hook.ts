/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useMemo, useRef, useState } from 'react'

import {
  useAccessKeyLookupQueue,
  type UseAccessKeyLookupQueueInput,
} from '@/modules/nfe-access-key-lookup/hooks/useAccessKeyLookupQueue.hook'
import { createNfeWorkspaceClient } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  buildBippedNotes,
  listAddableDocuments,
  type BippedNoteDocument,
} from '../shared/bippedNote.service'
import type { ScannedNfeDocument } from '../shared/trip.types'
import { getTripClient } from './useTripWorkspace.hook'

export type XmlFeedback = Readonly<{ accessKey: string; kind: 'failed' | 'notImported' }>

export type UseBippedNotesInput = Readonly<{
  findDocument?: (accessKey: string) => Promise<null | ScannedNfeDocument>
  lookup?: UseAccessKeyLookupQueueInput
  onStage: (documents: readonly ScannedNfeDocument[]) => void
  /** O leitor de mão perde o foco a cada clique: toda ação da lista o devolve a ele. */
  refocusReader: () => void
  stagedDocumentIds: readonly string[]
  uploadXml?: (file: File) => Promise<void>
}>

function findDocumentByAccessKey(accessKey: string): Promise<null | ScannedNfeDocument> {
  return getTripClient().findNfeDocumentByAccessKey({ accessKey })
}

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

/**
 * Cada leitura vira uma linha da lista de notas encontradas, e **nenhuma** entra na viagem sem
 * "Acrescentar". A fila de busca diz se a nota existe; o cadastro da nota (a mesma consulta que
 * o bipe usava) diz se ela pode entrar — em outra viagem ou não autorizada, a linha avisa e não oferece.
 */
export function useBippedNotes(input: UseBippedNotesInput) {
  const { findDocument = findDocumentByAccessKey, uploadXml = uploadXmlFile } = input
  const queue = useAccessKeyLookupQueue(input.lookup)
  const [documents, setDocuments] = useState<ReadonlyMap<string, BippedNoteDocument>>(new Map())
  const [xmlFeedback, setXmlFeedback] = useState<XmlFeedback | undefined>(undefined)
  const inFlight = useRef(new Set<string>())

  useEffect(() => {
    for (const row of queue.rows) {
      const { accessKey } = row
      if (row.state.kind !== 'ready' || documents.has(accessKey) || inFlight.current.has(accessKey))
        continue
      inFlight.current.add(accessKey)
      void findDocument(accessKey)
        .then((document): BippedNoteDocument => document ?? 'failed')
        .catch((): BippedNoteDocument => 'failed')
        .then((outcome) => {
          inFlight.current.delete(accessKey)
          setDocuments((current) => new Map(current).set(accessKey, outcome))
        })
    }
  }, [documents, findDocument, queue.rows])

  const notes = useMemo(
    () =>
      buildBippedNotes({
        documents,
        rows: queue.rows,
        stagedDocumentIds: input.stagedDocumentIds,
      }),
    [documents, input.stagedDocumentIds, queue.rows],
  )

  function read(accessKey: string): void {
    queue.add(accessKey)
    input.refocusReader()
  }

  function stage(documentsToStage: readonly ScannedNfeDocument[]): void {
    if (documentsToStage.length > 0) input.onStage(documentsToStage)
    input.refocusReader()
  }

  function retryDocument(accessKey: string): void {
    setDocuments((current) => {
      const next = new Map(current)
      next.delete(accessKey)
      return next
    })
  }

  async function sendXml(accessKey: string, file: File | undefined): Promise<void> {
    if (file === undefined) return
    setXmlFeedback(undefined)
    try {
      await uploadXml(file)
      const isReady = await queue.recheck(accessKey)
      if (!isReady) setXmlFeedback({ accessKey, kind: 'notImported' })
    } catch {
      setXmlFeedback({ accessKey, kind: 'failed' })
    }
    input.refocusReader()
  }

  return {
    addAllReady: () => stage(listAddableDocuments(notes)),
    addDocument: (document: ScannedNfeDocument) => stage([document]),
    notes,
    read,
    readyCount: listAddableDocuments(notes).length,
    retry: queue.retry,
    retryDocument,
    rows: queue.rows,
    sendXml,
    xmlFeedback,
  }
}
