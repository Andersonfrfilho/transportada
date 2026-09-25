/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  bindCameraCaptureInput,
  CAMERA_RETURN_GRACE_MS,
  type CameraCaptureEnvironment,
} from '@/modules/driver-trip/shared/cameraCapture.service'
import { createCaptureRegistry } from '@/modules/driver-trip/shared/captureRegistry.service'

function createEnvironment(): CameraCaptureEnvironment & {
  readonly documentTarget: EventTarget
  readonly runTimers: () => void
  readonly setVisibility: (state: DocumentVisibilityState) => void
  readonly windowTarget: EventTarget
} {
  const documentTarget = new EventTarget()
  const windowTarget = new EventTarget()
  const timers = new Map<number, () => void>()
  let visibilityState: DocumentVisibilityState = 'visible'
  let nextId = 1
  return {
    clearTimeout: (id) => timers.delete(id),
    document: documentTarget,
    documentTarget,
    isVisible: () => visibilityState === 'visible',
    runTimers: () => {
      for (const [id, handler] of [...timers]) {
        timers.delete(id)
        handler()
      }
    },
    setTimeout: (handler) => {
      const id = nextId
      nextId += 1
      timers.set(id, handler)
      return id
    },
    setVisibility: (state) => {
      visibilityState = state
    },
    window: windowTarget,
    windowTarget,
  }
}

/**
 * Spec 189 T9.2 (M2): o seletor nativo nem sempre devolve `change` ou `cancel` — o Android que mata
 * a aba da câmera, o iOS que fecha a folha sem evento. A captura `camera` ficava aberta para sempre,
 * e com ela a atualização do SW e o "Entrar de novo".
 */
describe('a captura da câmera nunca fica presa aberta (M2)', () => {
  it('click abre uma vez só, e change fecha', () => {
    const registry = createCaptureRegistry()
    const environment = createEnvironment()
    const element = new EventTarget()
    bindCameraCaptureInput({ element, environment, registry })

    element.dispatchEvent(new Event('click'))
    element.dispatchEvent(new Event('click'))
    expect(registry.isIdle()).toBe(false)

    element.dispatchEvent(new Event('change'))
    expect(registry.isIdle()).toBe(true)
  })

  it('desmontar com o seletor aberto fecha a captura', () => {
    const registry = createCaptureRegistry()
    const element = new EventTarget()
    const unbind = bindCameraCaptureInput({ element, environment: createEnvironment(), registry })

    element.dispatchEvent(new Event('click'))
    unbind()

    expect(registry.isIdle()).toBe(true)
  })

  it('a página visível de novo sem change fecha depois da folga', () => {
    const registry = createCaptureRegistry()
    const environment = createEnvironment()
    const element = new EventTarget()
    bindCameraCaptureInput({ element, environment, registry })

    element.dispatchEvent(new Event('click'))
    environment.setVisibility('hidden')
    environment.documentTarget.dispatchEvent(new Event('visibilitychange'))
    environment.runTimers()
    expect(registry.isIdle()).toBe(false)

    environment.setVisibility('visible')
    environment.documentTarget.dispatchEvent(new Event('visibilitychange'))
    expect(registry.isIdle()).toBe(false)
    environment.runTimers()
    expect(registry.isIdle()).toBe(true)
    expect(CAMERA_RETURN_GRACE_MS).toBeGreaterThan(0)
  })

  it('o foco de volta à janela também fecha, e o change que chega na folga não fecha duas vezes', () => {
    const registry = createCaptureRegistry()
    const environment = createEnvironment()
    const element = new EventTarget()
    bindCameraCaptureInput({ element, environment, registry })
    registry.open('crop')

    element.dispatchEvent(new Event('click'))
    environment.windowTarget.dispatchEvent(new Event('focus'))
    element.dispatchEvent(new Event('change'))
    environment.runTimers()

    expect(registry.isIdle()).toBe(false)
    registry.close('crop')
    expect(registry.isIdle()).toBe(true)
  })
})
