/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { isCameraCapable } from '@/components/ui/barcodeScanner.service'
import { BarcodeScanner } from '@/components/ui/barcode-scanner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'

import { resolveTypedNote, type TypedNoteFeedback } from '../shared/tripNoteLookup.service'
import styles from '../styles/trip.module.css'
import { TripTypedNoteFeedback } from './TripTypedNoteFeedback.component'

type TripQuickNoteInputProps = Readonly<{
  /** As notas livres que ainda podem ser escolhidas: número e chave são resolvidos só entre elas. */
  documents: readonly NfeDocumentListItem[]
  onPick: (document: NfeDocumentListItem) => void
}>

/**
 * Inserção rápida de uma nota: leitura pela câmera, número da nota ou chave de 44 caracteres.
 * Resolve tudo sobre a lista já carregada, a mesma da busca — a nota que a pessoa digita é a nota
 * que ela veria na tabela.
 */
export function TripQuickNoteInput({ documents, onPick }: TripQuickNoteInputProps) {
  const { t } = useTranslation('trip')
  const [text, setText] = useState('')
  const [feedback, setFeedback] = useState<TypedNoteFeedback | undefined>(undefined)
  const [isScannerOpen, setIsScannerOpen] = useState(false)
  const [canScan] = useState(() => isCameraCapable(globalThis.navigator))

  function pick(document: NfeDocumentListItem): void {
    setFeedback(undefined)
    onPick(document)
  }

  function submit(raw: string): void {
    const lookup = resolveTypedNote({ documents, text: raw })
    if (lookup.kind === 'empty') return
    if (lookup.kind === 'unrecognized') {
      setFeedback({ kind: 'unrecognized' })
      return
    }
    const matches =
      lookup.kind === 'accessKey'
        ? documents.filter((document) => document.accessKey === lookup.accessKey)
        : lookup.matches
    const [only] = matches
    if (matches.length === 1 && only !== undefined) {
      pick(only)
      return
    }
    setFeedback(
      matches.length === 0 ? { kind: 'notFound' } : { candidates: matches, kind: 'ambiguous' },
    )
  }

  function submitTyped(): void {
    submit(text)
    setText('')
  }

  return (
    <div className={styles.linkDocumentsBody}>
      <div className={styles.scanRow}>
        <label className={styles.scanField}>
          {t('quickCreate.accessKey')}
          <input
            autoComplete="off"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return
              event.preventDefault()
              submitTyped()
            }}
            placeholder={t('quickCreate.accessKeyPlaceholder')}
            type="text"
            value={text}
          />
        </label>
        <Button onClick={submitTyped} size="sm" type="button" variant="secondary">
          <Icon name="add" />
          {t('quickCreate.add')}
        </Button>
        {canScan ? (
          <Button onClick={() => setIsScannerOpen(true)} size="sm" type="button">
            <Icon name="camera" />
            {t('quickCreate.scan')}
          </Button>
        ) : null}
      </div>
      <TripTypedNoteFeedback note={feedback} onPick={pick} />
      <BarcodeScanner
        closeLabel={t('detail.scanClose')}
        deniedMessage={t('detail.scanDenied')}
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onRead={(read) => {
          setIsScannerOpen(false)
          submit(read)
        }}
        readingMessage={t('detail.scanReading')}
        startingMessage={t('detail.scanStarting')}
        title={t('detail.scanTitle')}
        unavailableMessage={t('detail.scanUnavailable')}
      />
    </div>
  )
}
