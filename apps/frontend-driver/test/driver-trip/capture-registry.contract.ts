/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import {
  createCaptureRegistry,
  createIdleGate,
  persistWhileOpen,
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
const DRIVER_TRIP_HOOK = new URL(
  '../../src/modules/driver-trip/hooks/useDriverTrip.hook.ts',
  import.meta.url,
)
const WORKSPACE = new URL(
  '../../src/modules/driver-trip/pages/DriverTripWorkspace.page.tsx',
  import.meta.url,
)

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

/**
 * Spec 189 T9.2 (A4): a assinatura desmontava (`close('signature')`) antes de o `attachProof`
 * gravar no IndexedDB. Nesse intervalo o registro ficava ocioso, o SW novo aplicava e recarregava
 * — e a assinatura, confirmada na tela, nunca chegava à fila.
 */
describe('a captura só fecha depois de gravar (spec 189 T9.2 A4)', () => {
  it('fechar a captura com a gravação em voo não deixa o registro ocioso', async () => {
    const registry = createCaptureRegistry()
    let idleCalls = 0
    registry.onIdle(() => (idleCalls += 1))
    let finishWrite: () => void = () => undefined
    registry.open('signature')

    const persisting = persistWhileOpen(
      registry,
      () =>
        new Promise<string>((resolve) => {
          finishWrite = () => resolve('queued')
        }),
    )
    registry.close('signature')

    expect(registry.isIdle()).toBe(false)
    expect(idleCalls).toBe(0)

    finishWrite()
    expect(await persisting).toBe('queued')
    expect(registry.isIdle()).toBe(true)
    expect(idleCalls).toBe(1)
  })

  it('a gravação que falha também libera o registro', async () => {
    const registry = createCaptureRegistry()

    const failing = persistWhileOpen(registry, () => Promise.reject(new Error('quota')))

    expect(registry.isIdle()).toBe(false)
    expect(await failing.catch((error: unknown) => (error as Error).message)).toBe('quota')
    expect(registry.isIdle()).toBe(true)
  })

  it('attachProof e os relatos gravam dentro de persistWhileOpen', () => {
    const source = readFileSync(DRIVER_TRIP_HOOK, 'utf8')

    expect(source.match(/persistWhileOpen\(captureRegistry,/gu)?.length).toBeGreaterThanOrEqual(3)
  })

  /** M1: o toque grava antes de esperar o GPS (até 8 s); a posição completa o item depois. */
  it('Cheguei/Entreguei/Devolvi enfileiram antes de esperar a posição', () => {
    const hook = readFileSync(DRIVER_TRIP_HOOK, 'utf8')
    const body = hook.slice(hook.indexOf('function reportWithLocation('))

    expect(body.indexOf('enqueueReport(')).toBeGreaterThan(-1)
    expect(body.indexOf('readCurrentLocation()')).toBeGreaterThan(body.indexOf('enqueueReport('))
    expect(body).toContain('applyReportLocation(')
    expect(readFileSync(WORKSPACE, 'utf8')).not.toContain('await readCurrentLocation()')
  })

  /** M10: nome e documento digitados e ainda não anexados são trabalho em andamento. */
  it('o formulário do comprovante com texto digitado conta no registro', () => {
    const source = readFileSync(DRIVER_STOP_CARD, 'utf8')

    expect(source).toContain("useCaptureRegistration('proof-form'")
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
