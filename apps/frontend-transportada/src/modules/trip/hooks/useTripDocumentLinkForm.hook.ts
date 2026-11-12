/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'

import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

import { resolveTripFeedbackKey } from '../shared/tripFeedback.service'
import type { TripDocumentLinkDraft, TripDocumentLinkMode } from '../shared/tripForm.service'
import { resolveTripLinkReference } from '../shared/tripForm.service'
import { isTypedNoteNumber, resolveTypedNote } from '../shared/tripNoteLookup.service'
import type { TripScanQueue } from '../shared/tripScanQueue.service'
import { markScanEntry } from '../shared/tripScanQueue.service'

const EMPTY_LINK_DRAFT: TripDocumentLinkDraft = { mode: 'nfe', value: '' }
const EMPTY_SCAN_QUEUE: TripScanQueue = []

export type TripLinkIssue = 'noteNumberNotFound' | 'requestFailed'

export type TripDocumentLinkFormInput = Readonly<{
  /** As notas livres da empresa: é sobre elas que o número digitado é resolvido. */
  availableDocuments?: readonly NfeDocumentListItem[]
  linkScannedDocument: (input: Readonly<{ documentId: string }>) => Promise<unknown>
}>

export type TripDocumentLinkFormController = ReturnType<typeof useTripDocumentLinkForm>

export function useTripDocumentLinkForm(input: TripDocumentLinkFormInput) {
  const [draft, setDraft] = useState<TripDocumentLinkDraft>(EMPTY_LINK_DRAFT)
  const [issue, setIssue] = useState<TripLinkIssue | undefined>(undefined)
  /** Mais de uma nota livre com o número digitado: a pessoa escolhe, nunca adivinhamos. */
  const [candidates, setCandidates] = useState<readonly NfeDocumentListItem[]>([])
  const [scanEntries, setScanEntries] = useState<TripScanQueue>(EMPTY_SCAN_QUEUE)
  /**
   * Duas leituras do mesmo quadro veem o mesmo estado renderizado, e o veredito de uma nota chega
   * enquanto outra ainda resolve: a fila autoritativa é a referência, não o instantâneo do render.
   */
  const queueRef = useRef<TripScanQueue>(EMPTY_SCAN_QUEUE)
  /** As notas que a rota de vínculo aceitou: saem da lista de encontradas, que só oferece o que falta. */
  const [linkedDocumentIds, setLinkedDocumentIds] = useState<readonly string[]>([])

  const reference = resolveTripLinkReference(draft)

  function setMode(mode: TripDocumentLinkMode): void {
    setIssue(undefined)
    setDraft((current) => ({ ...current, mode }))
  }

  function setValue(value: string): void {
    setIssue(undefined)
    setCandidates([])
    setDraft((current) => ({ ...current, value }))
  }

  function reset(): void {
    setIssue(undefined)
    setCandidates([])
    setDraft(EMPTY_LINK_DRAFT)
  }

  function updateScanQueue(queue: TripScanQueue): void {
    queueRef.current = queue
    setScanEntries(queue)
  }

  function refuseScanEntry(accessKey: string, issueKey: string): void {
    updateScanQueue(
      markScanEntry({ accessKey, issueKey, queue: queueRef.current, status: 'refused' }),
    )
  }

  function clearScanEntries(): void {
    updateScanQueue(EMPTY_SCAN_QUEUE)
  }

  /** Número de nota é resolvido entre as notas livres: uma vira id, nenhuma vira recusa, várias pedem escolha. */
  function resolveNoteNumber(): string | undefined {
    const lookup = resolveTypedNote({
      documents: input.availableDocuments ?? [],
      text: draft.value,
    })
    if (lookup.kind !== 'matches' || lookup.matches.length === 0) {
      setIssue('noteNumberNotFound')
      return undefined
    }
    const [only] = lookup.matches
    if (lookup.matches.length === 1 && only !== undefined) return only.id
    setCandidates(lookup.matches)
    return undefined
  }

  /** Vincula cada nota marcada na busca, uma de cada vez; a recusa fica na linha da nota. */
  async function linkDocuments(
    documents: readonly Readonly<{ accessKey: string; id: string }>[],
  ): Promise<void> {
    const fresh = documents.filter(
      (document) =>
        !queueRef.current.some(
          (entry) => entry.accessKey === document.accessKey && entry.status !== 'refused',
        ),
    )
    const freshKeys = new Set(fresh.map((document) => document.accessKey))
    updateScanQueue([
      ...queueRef.current.filter((entry) => !freshKeys.has(entry.accessKey)),
      ...fresh.map((document) => ({ accessKey: document.accessKey, status: 'linking' as const })),
    ])
    for (const document of fresh) {
      try {
        await input.linkScannedDocument({ documentId: document.id })
        updateScanQueue(
          markScanEntry({
            accessKey: document.accessKey,
            queue: queueRef.current,
            status: 'linked',
          }),
        )
        setLinkedDocumentIds((current) => [...current, document.id])
      } catch (error) {
        refuseScanEntry(document.accessKey, resolveTripFeedbackKey(error) ?? 'requestFailed')
      }
    }
  }

  /** A chave não passa por aqui: ela vai à lista de notas encontradas, onde a pessoa acrescenta. */
  function resolveDocumentId(): Promise<string | undefined> {
    if (reference === undefined || reference.kind === 'accessKey') return Promise.resolve(undefined)
    if (draft.mode === 'nfe' && isTypedNoteNumber(reference.value)) {
      return Promise.resolve(resolveNoteNumber())
    }
    return Promise.resolve(reference.value)
  }

  return {
    candidates,
    clearScanEntries,
    draft,
    issue,
    linkDocuments,
    linkedDocumentIds,
    reference,
    reset,
    resolveDocumentId,
    scanEntries,
    setMode,
    setValue,
  }
}
