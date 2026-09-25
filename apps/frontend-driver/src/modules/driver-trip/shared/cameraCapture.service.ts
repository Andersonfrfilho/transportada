/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CaptureRegistry } from './captureRegistry.service'

/**
 * Quanto a volta da câmera espera o `change` antes de fechar sozinha. O `focus`/`visibilitychange`
 * chega antes do `change` em boa parte dos aparelhos; fechar na hora abriria uma janela ociosa entre
 * a foto e o recorte.
 */
export const CAMERA_RETURN_GRACE_MS = 1_000

export type CameraCaptureEnvironment = Readonly<{
  clearTimeout: (id: number) => void
  document: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
  isVisible: () => boolean
  setTimeout: (handler: () => void, timeout: number) => number
  window: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
}>

/**
 * Plan D2, com a revisão da spec 189 T9.2 (M2): o `click` no `<input type="file">` abre a captura
 * `camera`, e `change`/`cancel` fecham. Só que o seletor nativo nem sempre devolve um dos dois — o
 * Android que mata a aba da câmera, a folha do iOS fechada sem evento —, e a captura ficava aberta
 * para sempre, segurando a atualização do SW e o "Entrar de novo". Por isso:
 *
 * - o estado é local (`isOpen`): dois `click` não abrem duas vezes, e fechar é idempotente;
 * - a página visível de novo, ou o foco de volta à janela, fecha depois da folga se nenhum `change`
 *   chegou;
 * - desligar (o input desmontou) fecha se ainda estiver aberta.
 */
export function bindCameraCaptureInput(input: {
  readonly element: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
  readonly environment: CameraCaptureEnvironment
  readonly registry: Pick<CaptureRegistry, 'close' | 'open'>
}): () => void {
  const { element, environment, registry } = input
  let isOpen = false
  let returnTimer: number | undefined

  function clearReturnTimer(): void {
    if (returnTimer === undefined) return
    environment.clearTimeout(returnTimer)
    returnTimer = undefined
  }

  function handleOpen(): void {
    if (isOpen) return
    isOpen = true
    registry.open('camera')
  }

  function handleClose(): void {
    clearReturnTimer()
    if (!isOpen) return
    isOpen = false
    registry.close('camera')
  }

  function handleReturn(): void {
    if (!isOpen || !environment.isVisible()) return
    clearReturnTimer()
    returnTimer = environment.setTimeout(handleClose, CAMERA_RETURN_GRACE_MS)
  }

  element.addEventListener('click', handleOpen)
  element.addEventListener('change', handleClose)
  element.addEventListener('cancel', handleClose)
  environment.document.addEventListener('visibilitychange', handleReturn)
  environment.window.addEventListener('focus', handleReturn)

  return () => {
    element.removeEventListener('click', handleOpen)
    element.removeEventListener('change', handleClose)
    element.removeEventListener('cancel', handleClose)
    environment.document.removeEventListener('visibilitychange', handleReturn)
    environment.window.removeEventListener('focus', handleReturn)
    handleClose()
  }
}
