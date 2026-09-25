/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  createCaptureRegistry,
  createIdleGate,
} from '@/modules/driver-trip/shared/captureRegistry.service'
import {
  handleServiceWorkerUpdateAvailable,
  requestServiceWorkerUpdate,
} from '@/modules/driver-trip/shared/serviceWorkerUpdate.service'

const DRIVER_STOP_CARD = new URL(
  '../../src/modules/driver-trip/components/DriverStopCard.component.tsx',
  import.meta.url,
)
const CAMERA_CAPTURE_HOOK = new URL(
  '../../src/modules/driver-trip/hooks/useCameraCaptureFieldRef.hook.ts',
  import.meta.url,
)
const PROOF_CROP = new URL(
  '../../src/modules/driver-trip/components/ProofCrop.component.tsx',
  import.meta.url,
)
const SIGNATURE_PAD = new URL(
  '../../src/modules/driver-trip/components/SignaturePad.component.tsx',
  import.meta.url,
)
const MAIN = new URL('../../src/main.tsx', import.meta.url)

describe('captureRegistry (plan D2)', () => {
  it('abre e fecha por kind, com contagem — fechar sem abrir não derruba nada', () => {
    const registry = createCaptureRegistry()

    registry.open('camera')
    registry.open('camera')
    expect(registry.isIdle()).toBe(false)

    registry.close('camera')
    expect(registry.isIdle()).toBe(false)

    registry.close('camera')
    expect(registry.isIdle()).toBe(true)

    registry.close('camera')
    expect(registry.isIdle()).toBe(true)
  })

  it('ocioso exige todos os kinds fechados, não só um', () => {
    const registry = createCaptureRegistry()

    registry.open('crop')
    registry.open('signature')
    registry.close('crop')
    expect(registry.isIdle()).toBe(false)

    registry.close('signature')
    expect(registry.isIdle()).toBe(true)
  })

  it('onIdle dispara só quando a última captura aberta fecha, e o cancelamento funciona', () => {
    const registry = createCaptureRegistry()
    let idleCalls = 0
    const unsubscribe = registry.onIdle(() => (idleCalls += 1))

    registry.open('occurrence-dialog')
    registry.close('occurrence-dialog')
    expect(idleCalls).toBe(1)

    unsubscribe()
    registry.open('occurrence-dialog')
    registry.close('occurrence-dialog')
    expect(idleCalls).toBe(1)
  })

  it('hasOpened começa falso, vira verdadeiro na primeira abertura e nunca volta', () => {
    const registry = createCaptureRegistry()
    expect(registry.hasOpened()).toBe(false)

    registry.open('camera')
    expect(registry.hasOpened()).toBe(true)

    registry.close('camera')
    expect(registry.hasOpened()).toBe(true)
  })
})

describe('o portão de quem navega a página (spec 189 T9.2)', () => {
  it('ocioso, a ação roda na hora', () => {
    const gate = createIdleGate(createCaptureRegistry())
    let calls = 0

    expect(gate.request(() => (calls += 1))).toBe('now')
    expect(calls).toBe(1)
    expect(gate.isWaiting()).toBe(false)
  })

  it('com captura aberta, dois toques rodam a ação uma vez só, no close', () => {
    const registry = createCaptureRegistry()
    const gate = createIdleGate(registry)
    let calls = 0
    registry.open('signature')

    expect(gate.request(() => (calls += 1))).toBe('deferred')
    expect(gate.request(() => (calls += 1))).toBe('deferred')
    expect(gate.isWaiting()).toBe(true)
    expect(calls).toBe(0)

    registry.close('signature')
    expect(calls).toBe(1)
    expect(gate.isWaiting()).toBe(false)

    registry.open('signature')
    registry.close('signature')
    expect(calls).toBe(1)
  })
})

describe('a regra de aplicação da atualização (plan D2)', () => {
  it('antes da primeira captura, aplica sozinho', () => {
    const registry = createCaptureRegistry()
    let applyCalls = 0
    let bannerCalls = 0

    handleServiceWorkerUpdateAvailable({
      apply: () => (applyCalls += 1),
      captureRegistry: registry,
      showUpdateBanner: () => (bannerCalls += 1),
    })

    expect(applyCalls).toBe(1)
    expect(bannerCalls).toBe(0)
  })

  it('depois de uma captura (já fechada), mostra o aviso em vez de aplicar sozinho', () => {
    const registry = createCaptureRegistry()
    registry.open('signature')
    registry.close('signature')
    let applyCalls = 0
    let bannerCalls = 0

    handleServiceWorkerUpdateAvailable({
      apply: () => (applyCalls += 1),
      captureRegistry: registry,
      showUpdateBanner: () => (bannerCalls += 1),
    })

    expect(applyCalls).toBe(0)
    expect(bannerCalls).toBe(1)
  })

  it('o toque aplica na hora quando o registro está ocioso', () => {
    const registry = createCaptureRegistry()
    let applyCalls = 0

    requestServiceWorkerUpdate({ apply: () => (applyCalls += 1), captureRegistry: registry })

    expect(applyCalls).toBe(1)
  })

  it('com captura aberta, o toque espera o close', () => {
    const registry = createCaptureRegistry()
    registry.open('crop')
    let applyCalls = 0

    requestServiceWorkerUpdate({ apply: () => (applyCalls += 1), captureRegistry: registry })
    expect(applyCalls).toBe(0)

    registry.close('crop')
    expect(applyCalls).toBe(1)
  })
})

describe('as quatro capturas registram no capture registry (leitura de fonte, ADR-0075 §8)', () => {
  it('câmera/foto: o hook do input liga click/change/cancel ao registro', () => {
    const source = readFileSync(CAMERA_CAPTURE_HOOK, 'utf8')

    expect(source).toContain("captureRegistry.open('camera')")
    expect(source).toContain("captureRegistry.close('camera')")
  })

  it('DriverStopCard usa o hook da câmera nos dois seletores de foto (nota e ocorrência)', () => {
    const source = readFileSync(DRIVER_STOP_CARD, 'utf8')

    expect(source.match(/useCameraCaptureFieldRef\(\)/gu)?.length).toBe(2)
  })

  it('recorte: ProofCrop abre e fecha no ciclo de vida do componente', () => {
    const source = readFileSync(PROOF_CROP, 'utf8')

    expect(source).toContain("captureRegistry.open('crop')")
    expect(source).toContain("captureRegistry.close('crop')")
  })

  it('assinatura: SignaturePad abre e fecha no ciclo de vida do componente', () => {
    const source = readFileSync(SIGNATURE_PAD, 'utf8')

    expect(source).toContain("captureRegistry.open('signature')")
    expect(source).toContain("captureRegistry.close('signature')")
  })

  it('diálogo de ocorrência: DriverStopCard registra o formulário de ocorrência da parada', () => {
    const source = readFileSync(DRIVER_STOP_CARD, 'utf8')

    expect(source).toContain("captureRegistry.open('occurrence-dialog')")
    expect(source).toContain("captureRegistry.close('occurrence-dialog')")
  })

  it('main.tsx: a sessão vencida vira "Entrar de novo", que passa pelo portão das capturas', () => {
    const source = readFileSync(MAIN, 'utf8')

    expect(source).toContain('useSessionExpiry(')
    expect(source).toContain('<DriverSessionExpiredNotice')
  })

  it('main.tsx liga o onNeedRefresh do registerSW à regra de aplicação', () => {
    const source = readFileSync(MAIN, 'utf8')

    expect(source).toContain("import { registerSW } from 'virtual:pwa-register'")
    expect(source).toContain('handleServiceWorkerUpdateAvailable(')
  })
})
