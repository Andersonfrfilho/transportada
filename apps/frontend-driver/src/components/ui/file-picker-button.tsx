/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, useRef, type ChangeEvent, type ReactNode, type RefCallback } from 'react'

import { Button } from './button'
import styles from './file-picker-button.module.css'

export type FilePickerButtonProps = Readonly<{
  accept: string
  /** `environment` abre a câmera traseira na hora; sem ele, o celular oferece galeria e arquivos. */
  capture?: 'environment' | 'user'
  children: ReactNode
  className?: string | undefined
  /** O registro da captura (`useCameraCaptureFieldRef`) liga no input, não no botão. */
  inputRef?: RefCallback<HTMLInputElement>
  onSelect: (file: File) => void
  variant?: 'default' | 'ghost' | 'secondary'
}>

/**
 * Um botão do design system que abre o seletor de arquivo. O campo de arquivo (`FileField`) mostra
 * rótulo em cima e ação dentro — ao lado de "Colher assinatura", parecia duas opções. Aqui é o mesmo
 * botão, do mesmo tamanho, e o input nativo continua por baixo: é ele que o celular transforma em
 * câmera ou galeria. O valor é limpo a cada escolha — escolher de novo a mesma foto dispara outra vez.
 */
export function FilePickerButton({
  accept,
  capture,
  children,
  className,
  inputRef,
  onSelect,
  variant = 'ghost',
}: FilePickerButtonProps) {
  const localInputRef = useRef<HTMLInputElement | null>(null)

  /** Estável: um ref novo a cada render desligaria e religaria o registro da câmera no meio da foto. */
  const bindInput = useCallback(
    (element: HTMLInputElement | null) => {
      localInputRef.current = element
      const cleanup = element === null ? undefined : inputRef?.(element)
      return () => {
        localInputRef.current = null
        if (typeof cleanup === 'function') cleanup()
      }
    },
    [inputRef],
  )

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file !== undefined) onSelect(file)
  }

  return (
    <>
      <Button
        className={className}
        onClick={() => localInputRef.current?.click()}
        type="button"
        variant={variant}
      >
        {children}
      </Button>
      <input
        accept={accept}
        aria-hidden="true"
        className={styles.input}
        ref={bindInput}
        tabIndex={-1}
        type="file"
        onChange={handleChange}
        {...(capture === undefined ? {} : { capture })}
      />
    </>
  )
}
