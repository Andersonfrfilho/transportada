/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { isCameraCapable } from '@/components/ui/barcodeScanner.service'
import { BarcodeScanner } from '@/components/ui/barcode-scanner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { Icon } from '@/components/ui/icon'
import { KeyReaderField, type KeyReaderFieldHandle } from '@/components/ui/key-reader-field'
import { AccessKeyLookupAnnouncer } from '@/modules/nfe-access-key-lookup/components/AccessKeyLookupAnnouncer.component'
import { AccessKeyLookupRow } from '@/modules/nfe-access-key-lookup/components/AccessKeyLookupRow.component'
import { deriveRowFlags } from '@/modules/nfe-access-key-lookup/shared/accessKeyLookupRow.service'
import { findNfeAccessKeyInScan } from '@/modules/shared/nfeScannedKey.service'

import type { useBippedNotes } from '../hooks/useBippedNotes.hook'
import type { ScannedNfeDocument } from '../shared/trip.types'
import styles from '../styles/trip.module.css'
import { TripTypedNoteFeedback } from './TripTypedNoteFeedback.component'

type TripBippedNotesProps = Readonly<{
  bipped: ReturnType<typeof useBippedNotes>
  readerRef: React.RefObject<KeyReaderFieldHandle | null>
}>

/**
 * Leitor de chave (mão primeiro, câmera depois) e a lista de **notas encontradas**: a criação e o
 * detalhe da viagem usam a mesma, e o que "Acrescentar" faz é decidido por quem monta o hook.
 */
export function TripBippedNotes({ bipped, readerRef }: TripBippedNotesProps) {
  const { t } = useTranslation('trip')
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [canScan] = useState(() => isCameraCapable(globalThis.navigator))

  function handleCameraRead(text: string): void {
    const accessKey = findNfeAccessKeyInScan(text)
    if (accessKey !== undefined) bipped.read(accessKey)
  }

  function handleCloseScanner(): void {
    setIsScannerOpen(false)
    setTimeout(() => readerRef.current?.focus(), 0)
  }

  return (
    <>
      <div className={styles.scanRow}>
        <KeyReaderField
          labels={{
            field: t('quickCreate.reader.field'),
            idle: t('quickCreate.reader.idle'),
            placeholder: t('quickCreate.reader.placeholder'),
            ready: t('quickCreate.reader.ready'),
          }}
          onRead={bipped.read}
          onUnreadable={bipped.readUnreadable}
          ref={readerRef}
        />
        {canScan ? (
          <Button onClick={() => setIsScannerOpen(true)} type="button">
            <Icon name="camera" />
            {t('quickCreate.scan')}
          </Button>
        ) : null}
      </div>

      {bipped.notice === undefined ? null : (
        <p className={styles.hint} role="status">
          {t(`quickCreate.notice.${bipped.notice}`)}
        </p>
      )}
      <TripTypedNoteFeedback
        note={
          bipped.candidates.length === 0
            ? undefined
            : { candidates: bipped.candidates, kind: 'ambiguous' }
        }
        onPick={bipped.pickCandidate}
      />
      <AccessKeyLookupAnnouncer rows={bipped.rows} />

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
                {note.movesFromTrip === true ? (
                  <p className={styles.hint} role="status">
                    {t('quickCreate.movesFromTrip')}
                  </p>
                ) : null}
                {note.blocker === undefined ? null : (
                  <p className={styles.alert} role="alert">
                    {t(`quickCreate.refusal.${note.blocker}`)}
                  </p>
                )}
                {note.document === 'failed' ? (
                  <>
                    <p className={styles.alert} role="alert">
                      {t('quickCreate.bippedDocumentFailed')}
                    </p>
                    <Button
                      onClick={() => bipped.retryDocument(note.row.accessKey)}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <Icon name="refresh" />
                      {t('quickCreate.bippedRetry')}
                    </Button>
                  </>
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
      <BarcodeScanner
        closeLabel={t('detail.scanClose')}
        deniedMessage={t('detail.scanDenied')}
        isOpen={isScannerOpen}
        onClose={handleCloseScanner}
        onRead={handleCameraRead}
        readingMessage={t('detail.scanReading')}
        startingMessage={t('detail.scanStarting')}
        title={t('detail.scanTitle')}
        unavailableMessage={t('detail.scanUnavailable')}
      />
    </>
  )
}
