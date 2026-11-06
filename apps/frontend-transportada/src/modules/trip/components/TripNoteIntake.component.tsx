/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { isCameraCapable } from '@/components/ui/barcodeScanner.service'
import { BarcodeScanner } from '@/components/ui/barcode-scanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { Icon } from '@/components/ui/icon'
import { KeyReaderField, type KeyReaderFieldHandle } from '@/components/ui/key-reader-field'
import { AccessKeyLookupRow } from '@/modules/nfe-access-key-lookup/components/AccessKeyLookupRow.component'
import { deriveRowFlags } from '@/modules/nfe-access-key-lookup/shared/accessKeyLookupRow.service'
import { findNfeAccessKeyInScan } from '@/modules/shared/nfeScannedKey.service'
import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

import { useBippedNotes, type UseBippedNotesInput } from '../hooks/useBippedNotes.hook'
import { listBippedDocumentIds } from '../shared/bippedNote.service'
import type { ScannedNfeDocument } from '../shared/trip.types'
import styles from '../styles/trip.module.css'
import { TripDocumentSearch } from './TripDocumentSearch.component'

type TripNoteIntakeProps = Readonly<{
  /** As notas livres que a busca pode oferecer; as que já têm linha bipada saem daqui. */
  documents: readonly NfeDocumentListItem[]
  isLoading: boolean
  onFilteredChange: (documents: readonly ScannedNfeDocument[]) => void
  onStage: (documents: readonly ScannedNfeDocument[]) => void
  stagedDocumentIds: readonly string[]
  /** Só os testes trocam a fila de busca, o cadastro e o envio de XML. */
  overrides?: Pick<UseBippedNotesInput, 'findDocument' | 'lookup' | 'uploadXml'>
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
  overrides,
  stagedDocumentIds,
}: TripNoteIntakeProps) {
  const { t } = useTranslation('trip')
  const readerRef = useRef<KeyReaderFieldHandle>(null)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [canScan] = useState(() => isCameraCapable(globalThis.navigator))
  const bipped = useBippedNotes({
    ...overrides,
    onStage,
    refocusReader: () => readerRef.current?.focus(),
    stagedDocumentIds,
  })
  const bippedIds = listBippedDocumentIds(bipped.rows)
  const searchDocuments = documents.filter((document) => !bippedIds.has(document.id))

  function handleCameraRead(text: string): void {
    setIsScannerOpen(false)
    const accessKey = findNfeAccessKeyInScan(text)
    if (accessKey !== undefined) bipped.read(accessKey)
  }

  return (
    <>
      <div className={styles.scanRow}>
        <KeyReaderField
          labels={{
            field: t('quickCreate.reader.field'),
            idle: t('quickCreate.reader.idle'),
            ready: t('quickCreate.reader.ready'),
          }}
          onRead={bipped.read}
          ref={readerRef}
        />
        {canScan ? (
          <Button onClick={() => setIsScannerOpen(true)} size="sm" type="button">
            <Icon name="camera" />
            {t('quickCreate.scan')}
          </Button>
        ) : null}
      </div>

      {bipped.notes.length === 0 ? null : (
        <section aria-label={t('quickCreate.foundNotes')} className={styles.searchSection}>
          <div className={styles.scanRow}>
            <strong>{t('quickCreate.foundNotes')}</strong>
            {bipped.readyCount === 0 ? null : (
              <Button onClick={bipped.addAllReady} size="sm" type="button">
                <Icon name="add" />
                {t('quickCreate.addAllReady', { count: bipped.readyCount })}
              </Button>
            )}
          </div>
          <ul className={styles.scanQueueList}>
            {bipped.notes.map((note) => (
              <AccessKeyLookupRow
                key={note.row.accessKey}
                onRetry={bipped.retry}
                row={note.row}
                {...(note.addableDocument === undefined
                  ? {}
                  : {
                      onAdd: () => bipped.addDocument(note.addableDocument as ScannedNfeDocument),
                    })}
              >
                <Badge variant="secondary">{t('quickCreate.bipped')}</Badge>
                {note.blocker === undefined ? null : (
                  <p className={styles.alert} role="alert">
                    {t(`quickCreate.refusal.${note.blocker}`)}
                  </p>
                )}
                {note.document === 'failed' ? (
                  <p className={styles.alert} role="alert">
                    {t('quickCreate.bippedDocumentFailed')}{' '}
                    <Button
                      onClick={() => bipped.retryDocument(note.row.accessKey)}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <Icon name="refresh" />
                      {t('quickCreate.bippedRetry')}
                    </Button>
                  </p>
                ) : null}
                {deriveRowFlags(note.row.state).canSendXml ? (
                  <FileField
                    accept=".xml,application/xml"
                    actionLabel={t('quickCreate.xml.action')}
                    label={t('quickCreate.xml.field')}
                    onSelect={(file) => void bipped.sendXml(note.row.accessKey, file)}
                    placeholder={t('quickCreate.xml.placeholder')}
                    resetAfterSelect
                  />
                ) : null}
                {bipped.xmlFeedback?.accessKey === note.row.accessKey ? (
                  <p className={styles.alert} role="alert">
                    {t(`quickCreate.xml.${bipped.xmlFeedback.kind}`)}
                  </p>
                ) : null}
              </AccessKeyLookupRow>
            ))}
          </ul>
        </section>
      )}
      <TripDocumentSearch
        documents={searchDocuments}
        isLoading={isLoading}
        onFilteredChange={onFilteredChange}
        onStage={onStage}
      />

      <BarcodeScanner
        closeLabel={t('detail.scanClose')}
        deniedMessage={t('detail.scanDenied')}
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onRead={handleCameraRead}
        readingMessage={t('detail.scanReading')}
        startingMessage={t('detail.scanStarting')}
        title={t('detail.scanTitle')}
        unavailableMessage={t('detail.scanUnavailable')}
      />
    </>
  )
}
