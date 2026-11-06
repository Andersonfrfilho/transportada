/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useContext, useEffect, useMemo, useRef, useState } from 'react'

import { useAccessKeyLookupQueue } from '@/modules/nfe-access-key-lookup/hooks/useAccessKeyLookupQueue.hook'
import { useXmlRecheck } from '@/modules/nfe-access-key-lookup/hooks/useXmlRecheck.hook'

import {
  buildBippedNotes,
  listAddableDocuments,
  listBippedDocumentIds,
  type BippedNoteDocument,
} from '../shared/bippedNote.service'
import type { ScannedNfeDocument } from '../shared/trip.types'
import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

import { BippedNotesOverridesContext } from './bippedNotesOverrides.context'
import { resolveTypedNote } from '../shared/tripNoteLookup.service'
import { getTripClient } from './useTripWorkspace.hook'

/** Aviso curto sob o leitor: a leitura que não gerou linha nova diz por quê. */
export type BippedReadNotice =
  | 'alreadyAdded'
  | 'alreadyScanned'
  | 'loadingDocuments'
  | 'notFound'
  | 'unrecognized'

export type UseBippedNotesInput = Readonly<{
  /** As notas livres: é sobre elas que um número lido (sem chave) é resolvido, como na inserção rápida. */
  availableDocuments?: readonly NfeDocumentListItem[]
  isLoadingDocuments?: boolean
  onStage: (documents: readonly ScannedNfeDocument[]) => void
  /** O leitor de mão perde o foco a cada clique: toda ação da lista o devolve a ele. */
  refocusReader: () => void
  stagedDocumentIds: readonly string[]
}>

function findDocumentByAccessKey(accessKey: string): Promise<null | ScannedNfeDocument> {
  return getTripClient().findNfeDocumentByAccessKey({ accessKey })
}

/**
 * Cada leitura vira uma linha da lista de notas encontradas, e **nenhuma** entra na viagem sem
 * "Acrescentar". A fila de busca diz se a nota existe; o cadastro da nota (a mesma consulta que
 * o bipe usava) diz se ela pode entrar — em outra viagem ou não autorizada, a linha avisa e não oferece.
 */
export function useBippedNotes(input: UseBippedNotesInput) {
  const overrides = useContext(BippedNotesOverridesContext)
  const { findDocument = findDocumentByAccessKey } = overrides
  const queue = useAccessKeyLookupQueue(overrides.lookup)
  const [documents, setDocuments] = useState<ReadonlyMap<string, BippedNoteDocument>>(new Map())
  const [notice, setNotice] = useState<BippedReadNotice | undefined>(undefined)
  /** Mais de uma nota livre com o número lido: a pessoa escolhe, nunca adivinhamos. */
  const [candidates, setCandidates] = useState<readonly NfeDocumentListItem[]>([])
  const inFlight = useRef(new Set<string>())
  const stagedIds = useRef(input.stagedDocumentIds)
  stagedIds.current = input.stagedDocumentIds
  const { sendXml, xmlFeedback } = useXmlRecheck({
    recheck: queue.recheck,
    refocusReader: input.refocusReader,
    ...(overrides.uploadXml === undefined ? {} : { uploadXml: overrides.uploadXml }),
  })

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
          if (outcome !== 'failed' && stagedIds.current.includes(outcome.id)) {
            setNotice('alreadyAdded')
          }
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
    const { alreadyScanned } = queue.add(accessKey)
    setCandidates([])
    setNotice(alreadyScanned ? describeRepeatedRead(documents.get(accessKey)) : undefined)
    input.refocusReader()
  }

  /** Leitura sem chave: número de nota (com série opcional) é resolvido entre as livres e vira linha. */
  function readUnreadable(scanned: string): void {
    setCandidates([])
    setNotice(undefined)
    if (input.isLoadingDocuments === true) setNotice('loadingDocuments')
    else resolveScannedNumber(scanned)
    input.refocusReader()
  }

  function resolveScannedNumber(scanned: string): void {
    const bippedIds = listBippedDocumentIds(queue.rows)
    const lookup = resolveTypedNote({
      documents: (input.availableDocuments ?? []).filter(
        (document) => !bippedIds.has(document.id) && !input.stagedDocumentIds.includes(document.id),
      ),
      text: scanned,
    })
    if (lookup.kind !== 'matches') setNotice('unrecognized')
    else if (lookup.matches.length === 0) setNotice('notFound')
    else if (lookup.matches.length === 1 && lookup.matches[0] !== undefined) {
      queue.add(lookup.matches[0].accessKey)
    } else setCandidates(lookup.matches)
  }

  function pickCandidate(candidate: NfeDocumentListItem): void {
    setCandidates([])
    queue.add(candidate.accessKey)
    input.refocusReader()
  }

  function describeRepeatedRead(document: BippedNoteDocument | undefined): BippedReadNotice {
    const isStaged =
      document !== undefined &&
      document !== 'failed' &&
      input.stagedDocumentIds.includes(document.id)
    return isStaged ? 'alreadyAdded' : 'alreadyScanned'
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

  return {
    addAllReady: () => stage(listAddableDocuments(notes)),
    addDocument: (document: ScannedNfeDocument) => stage([document]),
    candidates,
    notes,
    notice,
    pickCandidate,
    read,
    readUnreadable,
    readyCount: listAddableDocuments(notes).length,
    retry: queue.retry,
    retryDocument,
    rows: queue.rows,
    sendXml,
    xmlFeedback,
  }
}
