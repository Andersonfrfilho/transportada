/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, type RefObject } from 'react'

import { captureRegistry } from '../shared/captureRegistry.service'

/**
 * Plan D2: registra a captura `'camera'` no `<input type="file">` de um `FileField` — o `click`
 * abre o seletor nativo (câmera ou galeria) antes de qualquer resposta chegar, e `change`/`cancel`
 * fecham, tenha o motorista escolhido um arquivo ou desistido. Não muda `FileField`, que é genérico:
 * usa o `inputRef` que ele já aceita.
 */
export function useCameraCaptureFieldRef(): RefObject<HTMLInputElement | null> {
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const input = inputRef.current
    if (input === null) return undefined

    function handleOpen(): void {
      captureRegistry.open('camera')
    }
    function handleClose(): void {
      captureRegistry.close('camera')
    }

    input.addEventListener('click', handleOpen)
    input.addEventListener('change', handleClose)
    input.addEventListener('cancel', handleClose)

    return () => {
      input.removeEventListener('click', handleOpen)
      input.removeEventListener('change', handleClose)
      input.removeEventListener('cancel', handleClose)
    }
  }, [])

  return inputRef
}
