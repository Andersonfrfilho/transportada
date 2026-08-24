/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { isCameraCapable } from '@/components/ui/barcodeScanner.service'
import { extractNfeAccessKey } from '@/modules/shared/nfeAccessKey.service'

import type { FindNfeDocumentByAccessKeyInput, ScannedNfeDocument } from '../shared/trip.types'
import type { TripDocumentLinkDraft, TripDocumentLinkMode } from '../shared/tripForm.service'
import { resolveTripLinkReference } from '../shared/tripForm.service'

const EMPTY_LINK_DRAFT: TripDocumentLinkDraft = { mode: 'nfe', value: '' }

export type TripLinkIssue = 'requestFailed' | 'scannedDocumentNotFound'

export type TripDocumentLinkFormInput = Readonly<{
  findNfeDocumentByAccessKey: (
    input: FindNfeDocumentByAccessKeyInput,
  ) => Promise<null | ScannedNfeDocument>
}>

export type TripDocumentLinkFormController = ReturnType<typeof useTripDocumentLinkForm>

export function useTripDocumentLinkForm(input: TripDocumentLinkFormInput) {
  const [draft, setDraft] = useState<TripDocumentLinkDraft>(EMPTY_LINK_DRAFT)
  const [issue, setIssue] = useState<TripLinkIssue | undefined>(undefined)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  /** A câmera não aparece no meio da sessão: reler `navigator` a cada render não diria nada novo. */
  const [canScan] = useState(() => isCameraCapable(globalThis.navigator))

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

  /** O QR-Code da DANFE traz a URL inteira: gravar o que veio buscaria uma chave que não existe. */
  function acceptScan(text: string): void {
    const accessKey = extractNfeAccessKey(text)
    if (accessKey === undefined) return
    setIssue(undefined)
    setDraft({ mode: 'nfe', value: accessKey })
    setIsScannerOpen(false)
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
    closeScanner: () => setIsScannerOpen(false),
    draft,
    isResolving,
    isScannerOpen,
    issue,
    openScanner: () => setIsScannerOpen(true),
    reference,
    reset,
    resolveDocumentId,
    setMode,
    setValue,
  }
}
