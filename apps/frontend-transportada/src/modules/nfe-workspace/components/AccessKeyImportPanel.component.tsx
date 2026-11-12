/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import { isCameraCapable } from '@/components/ui/barcodeScanner.service'
import { BarcodeScanner } from '@/components/ui/barcode-scanner'
import { Button } from '@/components/ui/button'
import { FileField } from '@/components/ui/file-field'
import { Icon } from '@/components/ui/icon'
import { KeyReaderField, type KeyReaderFieldHandle } from '@/components/ui/key-reader-field'
import { AccessKeyLookupAnnouncer } from '@/modules/nfe-access-key-lookup/components/AccessKeyLookupAnnouncer.component'
import { AccessKeyLookupRow } from '@/modules/nfe-access-key-lookup/components/AccessKeyLookupRow.component'
import { deriveRowFlags } from '@/modules/nfe-access-key-lookup/shared/accessKeyLookupRow.service'
import { findNfeAccessKeyInScan } from '@/modules/shared/nfeScannedKey.service'

import type { useAccessKeyImport } from '../hooks/useAccessKeyImport.hook'
import {
  ACCESS_KEY_IMPORT_FILTERS,
  isAccessKeyAlreadyInSystem,
} from '../shared/accessKeyImportSummary.service'
import styles from '../styles/accessKeyImport.module.css'
import { AccessKeyImportSummary } from './AccessKeyImportSummary.component'

type AccessKeyImportPanelProps = Readonly<{
  importer: ReturnType<typeof useAccessKeyImport>
  onOpenDocument: (documentId: string) => void
  readerRef: RefObject<KeyReaderFieldHandle | null>
}>

export function AccessKeyImportPanel({
  importer,
  onOpenDocument,
  readerRef,
}: AccessKeyImportPanelProps) {
  const { t } = useTranslation('nfeWorkspace')
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [canScan] = useState(() => isCameraCapable(globalThis.navigator))

  function handleCameraRead(text: string): void {
    const accessKey = findNfeAccessKeyInScan(text)
    if (accessKey === undefined) importer.readUnreadable()
    else importer.read(accessKey)
  }

  function handleCloseScanner(): void {
    setIsScannerOpen(false)
    setTimeout(() => readerRef.current?.focus(), 0)
  }

  return (
    <section aria-labelledby="access-key-import-title" className={styles.panel}>
      <h2 id="access-key-import-title">{t('accessKeyImport.title')}</h2>
      <p>{t('accessKeyImport.subtitle')}</p>
      <div className={styles.readerRow}>
        <KeyReaderField
          labels={{
            field: t('accessKeyImport.reader.field'),
            idle: t('accessKeyImport.reader.idle'),
            placeholder: t('accessKeyImport.reader.placeholder'),
            ready: t('accessKeyImport.reader.ready'),
          }}
          onRead={importer.read}
          onUnreadable={importer.readUnreadable}
          ref={readerRef}
        />
        {canScan ? (
          <Button onClick={() => setIsScannerOpen(true)} type="button">
            <Icon name="camera" />
            {t('accessKeyImport.scan')}
          </Button>
        ) : null}
      </div>
      {importer.repeatedKey === undefined ? null : (
        <p role="status">{t('accessKeyImport.alreadyScanned')}</p>
      )}
      <AccessKeyLookupAnnouncer rows={importer.allRows} />
      <AccessKeyImportSummary summary={importer.summary} />
      <div className={styles.filters}>
        {ACCESS_KEY_IMPORT_FILTERS.map((option) => (
          <Button
            aria-pressed={importer.filter === option}
            key={option}
            onClick={() => importer.setFilter(option)}
            size="sm"
            type="button"
            variant={importer.filter === option ? 'default' : 'secondary'}
          >
            {t(`accessKeyImport.filter.${option}`)}
          </Button>
        ))}
        {importer.summary.scanned === 0 ? null : (
          <Button onClick={importer.clearList} size="sm" type="button" variant="secondary">
            {t('accessKeyImport.clear')}
          </Button>
        )}
      </div>
      <ul className={styles.list}>
        {importer.rows.map((row) => (
          <AccessKeyLookupRow
            key={row.accessKey}
            onOpen={(_accessKey, documentId) => onOpenDocument(documentId)}
            onRetry={importer.retry}
            row={row}
          >
            {isAccessKeyAlreadyInSystem(row) ? <p>{t('accessKeyImport.alreadyInSystem')}</p> : null}
            {deriveRowFlags(row.state).canSendXml ? (
              <FileField
                accept=".xml,application/xml"
                actionLabel={t('accessKeyImport.xml.action')}
                label={t('accessKeyImport.xml.field')}
                onSelect={(file) => void importer.sendXml(row.accessKey, file)}
                placeholder={t('accessKeyImport.xml.placeholder')}
                resetAfterSelect
              />
            ) : null}
            {importer.xmlFeedback?.accessKey === row.accessKey ? (
              <p role="alert">{t(`accessKeyImport.xml.${importer.xmlFeedback.kind}`)}</p>
            ) : null}
          </AccessKeyLookupRow>
        ))}
      </ul>
      <BarcodeScanner
        closeLabel={t('accessKeyImport.scanClose')}
        deniedMessage={t('accessKeyImport.scanDenied')}
        isOpen={isScannerOpen}
        onClose={handleCloseScanner}
        onRead={handleCameraRead}
        readingMessage={t('accessKeyImport.scanReading')}
        startingMessage={t('accessKeyImport.scanStarting')}
        title={t('accessKeyImport.scanTitle')}
        unavailableMessage={t('accessKeyImport.scanUnavailable')}
      />
    </section>
  )
}
