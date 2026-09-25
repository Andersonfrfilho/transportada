/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useCallback, type RefCallback } from 'react'

import {
  bindCameraCaptureInput,
  type CameraCaptureEnvironment,
} from '../shared/cameraCapture.service'
import { captureRegistry } from '../shared/captureRegistry.service'

/** Montado na hora de ligar: o módulo também é importado por contratos, fora do navegador. */
function createBrowserEnvironment(): CameraCaptureEnvironment {
  return {
    clearTimeout: (id) => window.clearTimeout(id),
    document,
    isVisible: () => document.visibilityState === 'visible',
    setTimeout: (handler, timeout) => window.setTimeout(handler, timeout),
    window,
  }
}

/**
 * Plan D2 (revisto na spec 189 T9.2 M2): registra a captura `'camera'` no `<input type="file">` de
 * um `FileField`. **Ref callback**, não `useEffect` com `[]`: o input que só monta depois (o campo
 * condicional) também é ligado, e o React 19 chama a limpeza devolvida quando ele sai — que fecha a
 * captura se o seletor ainda estiver aberto. As regras moram em `bindCameraCaptureInput`.
 */
export function useCameraCaptureFieldRef(): RefCallback<HTMLInputElement> {
  return useCallback(
    (element: HTMLInputElement | null) =>
      element === null
        ? undefined
        : bindCameraCaptureInput({
            element,
            environment: createBrowserEnvironment(),
            registry: captureRegistry,
          }),
    [],
  )
}
