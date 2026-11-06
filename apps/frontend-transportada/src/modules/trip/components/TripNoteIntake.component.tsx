/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef } from 'react'

import type { KeyReaderFieldHandle } from '@/components/ui/key-reader-field'
import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

import { useBippedNotes } from '../hooks/useBippedNotes.hook'
import { excludeBippedDocuments } from '../shared/bippedNote.service'
import type { ScannedNfeDocument } from '../shared/trip.types'
import { TripBippedNotes } from './TripBippedNotes.component'
import { TripDocumentSearch } from './TripDocumentSearch.component'

type TripNoteIntakeProps = Readonly<{
  /** As notas livres que a busca pode oferecer; as que já têm linha bipada saem daqui. */
  documents: readonly NfeDocumentListItem[]
  isLoading: boolean
  onFilteredChange: (documents: readonly ScannedNfeDocument[]) => void
  onStage: (documents: readonly ScannedNfeDocument[]) => void
  stagedDocumentIds: readonly string[]
}>

/**
 * Leitura e lista de **notas encontradas**: o resultado de "Buscar notas" e as chaves bipadas moram
 * juntos, e nada daqui entra na viagem sem "Acrescentar". O leitor de mão é o caminho principal; a
 * câmera é o secundário.
 */
export function TripNoteIntake({
  documents,
  isLoading,
  onFilteredChange,
  onStage,
  stagedDocumentIds,
}: TripNoteIntakeProps) {
  const readerRef = useRef<KeyReaderFieldHandle>(null)
  const bipped = useBippedNotes({
    availableDocuments: documents,
    isLoadingDocuments: isLoading,
    onStage,
    refocusReader: () => readerRef.current?.focus(),
    stagedDocumentIds,
  })
  const searchDocuments = excludeBippedDocuments(documents, bipped.rows)

  return (
    <>
      <TripBippedNotes bipped={bipped} readerRef={readerRef} />
      <TripDocumentSearch
        documents={searchDocuments}
        isLoading={isLoading}
        onFilteredChange={onFilteredChange}
        onStage={onStage}
      />
    </>
  )
}
