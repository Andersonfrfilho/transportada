/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useImperativeHandle, useRef, type KeyboardEvent, type Ref } from 'react'

import { findNfeAccessKeyInScan } from '@/modules/shared/nfeScannedKey.service'

import { Badge } from './badge'
import { Button } from './button'
import styles from './key-reader-field.module.css'
import { useKeyReaderFocus } from './useKeyReaderFocus.hook'

export type KeyReaderFieldHandle = Readonly<{ focus: () => void }>

export type KeyReaderFieldProps = Readonly<{
  labels: Readonly<{ field: string; idle: string; ready: string }>
  onRead: (accessKey: string) => void
  /** Leitura sem chave (código de embalagem, etiqueta de volume): quem hospeda decide se conta. */
  onUnreadable?: () => void
  ref?: Ref<KeyReaderFieldHandle>
}>

/**
 * O leitor de mão (pistola USB/Bluetooth em modo teclado) é o caminho principal; a câmera
 * (`barcode-scanner`) é o secundário. O campo é **não controlado**: a pistola entrega dezenas de
 * caracteres por segundo, e um estado por tecla atrasaria a digitação. Enter ou Tab fecham a
 * leitura, e o campo se limpa na hora — a próxima leitura já encontra o campo vazio.
 */
export function KeyReaderField({ labels, onRead, onUnreadable, ref }: KeyReaderFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const isFocused = useKeyReaderFocus(inputRef)

  useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }), [])

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    const isClosingKey = event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey)
    if (!isClosingKey) return
    const input = event.currentTarget
    const scanned = input.value
    // Tab com o campo vazio segue a navegação por teclado; só a pistola traz texto antes do Tab.
    if (scanned === '' && event.key === 'Tab') return
    event.preventDefault()
    input.value = ''
    if (scanned === '') return
    const accessKey = findNfeAccessKeyInScan(scanned)
    if (accessKey === undefined) onUnreadable?.()
    else onRead(accessKey)
  }

  return (
    <div className={styles.reader}>
      <input
        aria-label={labels.field}
        autoComplete="off"
        className={styles.input}
        onKeyDown={handleKeyDown}
        ref={inputRef}
        spellCheck={false}
        type="text"
      />
      {isFocused ? (
        <Badge role="status" variant="success">
          {labels.ready}
        </Badge>
      ) : (
        <Button
          onClick={() => inputRef.current?.focus()}
          size="sm"
          type="button"
          variant="secondary"
        >
          {labels.idle}
        </Button>
      )}
    </div>
  )
}
