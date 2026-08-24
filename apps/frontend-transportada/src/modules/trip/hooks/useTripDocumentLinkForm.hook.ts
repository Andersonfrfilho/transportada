/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'

import { isCameraCapable } from '@/components/ui/barcodeScanner.service'

import type { FindNfeDocumentByAccessKeyInput, ScannedNfeDocument } from '../shared/trip.types'
import { resolveTripFeedbackKey } from '../shared/tripFeedback.service'
import type { TripDocumentLinkDraft, TripDocumentLinkMode } from '../shared/tripForm.service'
import { resolveTripLinkReference } from '../shared/tripForm.service'
import type { TripScanQueue } from '../shared/tripScanQueue.service'
import { acceptScannedText, markScanEntry } from '../shared/tripScanQueue.service'

const EMPTY_LINK_DRAFT: TripDocumentLinkDraft = { mode: 'nfe', value: '' }
const EMPTY_SCAN_QUEUE: TripScanQueue = []

export type TripLinkIssue = 'requestFailed' | 'scannedDocumentNotFound'

export type TripDocumentLinkFormInput = Readonly<{
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
    setDraft((current) => ({ ...current, value }))
  }

  function reset(): void {
    setIssue(undefined)
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

  /** A rota de vínculo só conhece o identificador: a chave vira id antes de sair, ou vira recusa. */
  async function resolveDocumentId(): Promise<string | undefined> {
    if (reference === undefined) return undefined
    if (reference.kind === 'identifier') return reference.value
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
    canScan,
    clearScanEntries,
    closeScanner: () => setIsScannerOpen(false),
    draft,
    isResolving,
    isScannerOpen,
    issue,
    openScanner: () => setIsScannerOpen(true),
    reference,
    reset,
    resolveDocumentId,
    scanEntries,
    setMode,
    setValue,
  }
}
