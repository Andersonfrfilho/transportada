/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { BarcodeScanner } from '@/components/ui/barcode-scanner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { ScanResult } from '../hooks/useSeparationScanner.hook'
import styles from '../styles/cargoSeparation.module.css'

type SeparationSearchProps = Readonly<{
  isScannerOpen: boolean
  onCloseScanner: () => void
  onOpenScanner: () => void
  onQueryChange: (query: string) => void
  onScan: (scanned: string) => void
  query: string
  scanResult: ScanResult | undefined
}>

/**
 * Busca por número da nota e leitura da chave de acesso pela câmera. O leitor é o primitivo do painel
 * (`@/components/ui/barcode-scanner`, o mesmo da viagem): quem sabe se a chave é desta chegada é a tela.
 */
export function SeparationSearch(props: SeparationSearchProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const feedback =
    props.scanResult === undefined
      ? undefined
      : props.scanResult.kind === 'found'
        ? {
            kind: 'found' as const,
            message: t('separation.scanFound', { number: props.scanResult.number }),
          }
        : { kind: 'notFound' as const, message: t('separation.scanNotFound') }

  return (
    <>
      <div className={styles.searchRow}>
        <label className={styles.searchField}>
          {t('separation.search')}
          <input
            inputMode="numeric"
            onChange={(event) => props.onQueryChange(event.target.value)}
            placeholder={t('separation.searchPlaceholder')}
            type="search"
            value={props.query}
          />
        </label>
        <Button
          aria-label={t('separation.scan')}
          className={styles.scanButton}
          onClick={props.onOpenScanner}
          type="button"
          variant="secondary"
        >
          <Icon name="camera" />
        </Button>
      </div>
      {props.isScannerOpen ? (
        <BarcodeScanner
          closeLabel={t('separation.scanClose')}
          deniedMessage={t('separation.scanDenied')}
          feedback={feedback}
          isOpen
          onClose={props.onCloseScanner}
          onRead={props.onScan}
          readingMessage={t('separation.scanReading')}
          startingMessage={t('separation.scanStarting')}
          title={t('separation.scanTitle')}
          unavailableMessage={t('separation.scanUnavailable')}
        />
      ) : null}
    </>
  )
}
