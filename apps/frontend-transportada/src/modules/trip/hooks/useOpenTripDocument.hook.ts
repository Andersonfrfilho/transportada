/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'

import { parseTripTimelineDocumentHref } from '../shared/tripTimelineLink.service'

export type OpenTripDocumentController = ReturnType<typeof useOpenTripDocument>

/**
 * Spec 227 D1: uma nota aberta por vez — abrir outra fecha a anterior. O estado é **da lista**, não
 * de cada linha, porque é o que permite fechar as outras e o que a âncora da linha do tempo precisa
 * para abrir a nota que ela aponta (RF9).
 */
export function useOpenTripDocument() {
  const [openDocumentId, setOpenDocumentId] = useState<null | string>(null)

  function toggleDocument(documentId: string): void {
    setOpenDocumentId((current) => (current === documentId ? null : documentId))
  }

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent): void {
      if (!(event.target instanceof Element)) return
      const anchor = event.target.closest('a[href^="#"]')
      const documentId =
        anchor === null ? null : parseTripTimelineDocumentHref(anchor.getAttribute('href') ?? '')
      if (documentId !== null) setOpenDocumentId(documentId)
    }

    function handleHashChange(): void {
      const documentId = parseTripTimelineDocumentHref(window.location.hash)
      if (documentId !== null) setOpenDocumentId(documentId)
    }

    document.addEventListener('click', handleDocumentClick)
    window.addEventListener('hashchange', handleHashChange)
    return () => {
      document.removeEventListener('click', handleDocumentClick)
      window.removeEventListener('hashchange', handleHashChange)
    }
  }, [])

  return { openDocumentId, toggleDocument }
}
