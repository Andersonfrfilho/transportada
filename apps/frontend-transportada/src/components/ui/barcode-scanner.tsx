/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from './barcode-scanner.module.css'
import { useBarcodeScanner } from './useBarcodeScanner.hook'

export type BarcodeScannerProps = Readonly<{
  closeLabel: string
  deniedMessage: string
  isOpen: boolean
  onClose: () => void
  onRead: (text: string) => void
  readingMessage: string
  startingMessage: string
  title: string
  unavailableMessage: string
}>

export function BarcodeScanner({
  closeLabel,
  deniedMessage,
  isOpen,
  onClose,
  onRead,
  readingMessage,
  startingMessage,
  title,
  unavailableMessage,
}: BarcodeScannerProps) {
  const { status, videoRef } = useBarcodeScanner({ isActive: isOpen, onRead })
  const message: Readonly<Record<string, string>> = {
    denied: deniedMessage,
    idle: startingMessage,
    reading: readingMessage,
    starting: startingMessage,
    unavailable: unavailableMessage,
  }

  if (!isOpen) return null

  return (
    <section aria-label={title} className={styles.scanner}>
      <div className={styles.head}>
        <h3 className={styles.title}>
          <Icon name="camera" />
          {title}
        </h3>
        <Button aria-label={closeLabel} onClick={onClose} size="sm" type="button" variant="ghost">
          <Icon name="close" />
        </Button>
      </div>
      {status === 'denied' || status === 'unavailable' ? null : (
        <div className={styles.viewport}>
          <video aria-label={title} className={styles.video} muted playsInline ref={videoRef} />
        </div>
      )}
      <p className={styles.message}>{message[status] ?? unavailableMessage}</p>
    </section>
  )
}
