/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import styles from './barcode-scanner.module.css'
import { useBarcodeScanner } from './useBarcodeScanner.hook'

const FOUND_VIBRATION_MS = 200

/**
 * O primitivo só descreve o que aconteceu com o texto lido, nunca decide sozinho — quem sabe se a
 * etiqueta corresponde a algo (uma caixa na fila, uma nota) é o módulo que hospeda o leitor.
 */
export type BarcodeScannerFeedback = Readonly<{
  kind: 'found' | 'notFound'
  message: string
}>

export type BarcodeScannerProps = Readonly<{
  closeLabel: string
  deniedMessage: string
  feedback?: BarcodeScannerFeedback | undefined
  isOpen: boolean
  onClose: () => void
  onRead: (text: string) => void
  readingMessage: string
  startingMessage: string
  title: string
  unavailableMessage: string
}>

const TITLE_ID = 'barcode-scanner-title'

/**
 * Camada de tela cheia por cima da página (portal), nunca conteúdo inline: nascer depois de uma
 * lista longa deixava o preview fora da área visível e nada rolava até ele. Mobile-first — tela
 * cheia no celular, janela centralizada a partir de `tablet:` (40rem), o mesmo ponto onde todo
 * diálogo do produto ganha caixa e margem.
 */
export function BarcodeScanner({
  closeLabel,
  deniedMessage,
  feedback,
  isOpen,
  onClose,
  onRead,
  readingMessage,
  startingMessage,
  title,
  unavailableMessage,
}: BarcodeScannerProps) {
  const { status, videoRef } = useBarcodeScanner({ isActive: isOpen, onRead })
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  const lastVibratedFeedback = useRef<BarcodeScannerFeedback | undefined>(undefined)

  /** Vibração curta só uma vez por acerto — o objeto de feedback muda a cada leitura nova. */
  useEffect(() => {
    if (feedback?.kind !== 'found' || feedback === lastVibratedFeedback.current) return
    lastVibratedFeedback.current = feedback
    navigator.vibrate?.(FOUND_VIBRATION_MS)
  }, [feedback])

  if (!isOpen) return null

  const showViewport = status !== 'denied' && status !== 'unavailable'
  const showGuide = status === 'reading'
  const belowMessage =
    status === 'denied'
      ? deniedMessage
      : status === 'unavailable'
        ? unavailableMessage
        : status === 'starting'
          ? startingMessage
          : undefined

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby={TITLE_ID}
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className={styles.head}>
          <h3 className={styles.title} id={TITLE_ID}>
            <Icon name="camera" />
            {title}
          </h3>
          <Button aria-label={closeLabel} onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
          </Button>
        </div>
        {showGuide && feedback === undefined ? (
          <p className={styles.instruction}>{readingMessage}</p>
        ) : null}
        {showViewport ? (
          <div className={styles.viewport}>
            <video aria-label={title} className={styles.video} muted playsInline ref={videoRef} />
            {showGuide ? (
              <div className={styles.guide} data-feedback={feedback?.kind}>
                <span className={styles.corner} data-corner="top-left" />
                <span className={styles.corner} data-corner="top-right" />
                <span className={styles.corner} data-corner="bottom-left" />
                <span className={styles.corner} data-corner="bottom-right" />
                {feedback === undefined ? <span className={styles.guideBand} /> : null}
                {feedback === undefined ? null : (
                  <div className={styles.feedback} data-kind={feedback.kind} role="status">
                    {feedback.kind === 'found' ? <Icon name="check" /> : null}
                    <span>{feedback.message}</span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
        {belowMessage === undefined ? null : <p className={styles.message}>{belowMessage}</p>}
      </div>
    </div>,
    document.body,
  )
}
