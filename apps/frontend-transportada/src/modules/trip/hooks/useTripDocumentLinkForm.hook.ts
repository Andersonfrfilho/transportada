/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'

import { isCameraCapable } from '@/components/ui/barcodeScanner.service'
import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

import type { FindNfeDocumentByAccessKeyInput, ScannedNfeDocument } from '../shared/trip.types'
import { resolveTripFeedbackKey } from '../shared/tripFeedback.service'
import type { TripDocumentLinkDraft, TripDocumentLinkMode } from '../shared/tripForm.service'
import { resolveTripLinkReference } from '../shared/tripForm.service'
import { isTypedNoteNumber, resolveTypedNote } from '../shared/tripNoteLookup.service'
import type { TripScanQueue } from '../shared/tripScanQueue.service'
import { acceptScannedText, markScanEntry } from '../shared/tripScanQueue.service'

const EMPTY_LINK_DRAFT: TripDocumentLinkDraft = { mode: 'nfe', value: '' }
const EMPTY_SCAN_QUEUE: TripScanQueue = []

export type TripLinkIssue = 'noteNumberNotFound' | 'requestFailed' | 'scannedDocumentNotFound'

export type TripDocumentLinkFormInput = Readonly<{
  /** As notas livres da empresa: é sobre elas que o número digitado é resolvido. */
  availableDocuments?: readonly NfeDocumentListItem[]
  findNfeDocumentByAccessKey: (
    input: FindNfeDocumentByAccessKeyInput,
  ) => Promise<null | ScannedNfeDocument>
  linkScannedDocument: (input: Readonly<{ documentId: string }>) => Promise<unknown>
}>

export type TripDocumentLinkFormController = ReturnType<typeof useTripDocumentLinkForm>

export function useTripDocumentLinkForm(input: TripDocumentLinkFormInput) {
  const [draft, setDraft] = useState<TripDocumentLinkDraft>(EMPTY_LINK_DRAFT)
  const [issue, setIssue] = useState<TripLinkIssue | undefined>(undefined)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  /** Mais de uma nota livre com o número digitado: a pessoa escolhe, nunca adivinhamos. */
  const [candidates, setCandidates] = useState<readonly NfeDocumentListItem[]>([])
  const [scanEntries, setScanEntries] = useState<TripScanQueue>(EMPTY_SCAN_QUEUE)
  /** A câmera não aparece no meio da sessão: reler `navigator` a cada render não diria nada novo. */
  const [canScan] = useState(() => isCameraCapable(globalThis.navigator))
  /**
   * Duas leituras do mesmo quadro veem o mesmo estado renderizado, e o veredito de uma nota chega
   * enquanto outra ainda resolve: a fila autoritativa é a referência, não o instantâneo do render.
   */
  const queueRef = useRef<TripScanQueue>(EMPTY_SCAN_QUEUE)

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

  /** A recusa fica na linha da nota: derrubar a sequência obrigaria a reler o palete inteiro. */
  async function linkScannedKey(accessKey: string): Promise<void> {
    try {
      const document = await input.findNfeDocumentByAccessKey({ accessKey })
      if (document === null) {
        refuseScanEntry(accessKey, 'scannedDocumentNotFound')
        return
      }
      updateScanQueue(markScanEntry({ accessKey, queue: queueRef.current, status: 'linking' }))
      await input.linkScannedDocument({ documentId: document.id })
      updateScanQueue(markScanEntry({ accessKey, queue: queueRef.current, status: 'linked' }))
    } catch (error) {
      refuseScanEntry(accessKey, resolveTripFeedbackKey(error) ?? 'requestFailed')
    }
  }

  /** A câmera fica aberta entre leituras: confirmar nota a nota mata o ritmo de quem separa. */
  function acceptScan(text: string): void {
    const acceptance = acceptScannedText({ queue: queueRef.current, text })
    if (acceptance.accessKey === undefined) return
    updateScanQueue(acceptance.queue)
    void linkScannedKey(acceptance.accessKey)
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
      (document) => !queueRef.current.some((entry) => entry.accessKey === document.accessKey),
    )
    updateScanQueue([
      ...queueRef.current,
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
      } catch (error) {
        refuseScanEntry(document.accessKey, resolveTripFeedbackKey(error) ?? 'requestFailed')
      }
    }
  }

  /** A rota de vínculo só conhece o identificador: a chave vira id antes de sair, ou vira recusa. */
  async function resolveDocumentId(): Promise<string | undefined> {
    if (reference === undefined) return undefined
    if (reference.kind === 'identifier') {
      if (draft.mode === 'nfe' && isTypedNoteNumber(reference.value)) return resolveNoteNumber()
      return reference.value
    }
    setIsResolving(true)
    try {
      const document = await input.findNfeDocumentByAccessKey({ accessKey: reference.value })
      if (document === null) {
        setIssue('scannedDocumentNotFound')
        return undefined
      }
      return document.id
    } catch {
      setIssue('requestFailed')
      return undefined
    } finally {
      setIsResolving(false)
    }
  }

  return {
    acceptScan,
    candidates,
    canScan,
    clearScanEntries,
    closeScanner: () => setIsScannerOpen(false),
    draft,
    isResolving,
    isScannerOpen,
    issue,
    linkDocuments,
    openScanner: () => setIsScannerOpen(true),
    reference,
    reset,
    resolveDocumentId,
    scanEntries,
    setMode,
    setValue,
  }
}
