import { describe, expect, test } from 'bun:test'

import {
  createInitialPackageBoxCameraFlowState,
  packageBoxCameraFlowReducer,
  type PackageBoxCameraFlowEvent,
  type PackageBoxCameraFlowState,
} from '@/modules/nfe-workspace/shared/packageBoxCameraFlow.service'

type Candidate = Readonly<{ id: string }>
type Proposal = Readonly<{ lengthMm: number }>

type State = PackageBoxCameraFlowState<Candidate, Proposal>
type Event = PackageBoxCameraFlowEvent<Candidate, Proposal>

function reduceAll(state: State, events: readonly Event[]): State {
  return events.reduce<State>(
    (accumulator, event) => packageBoxCameraFlowReducer(accumulator, event),
    state,
  )
}

describe('packageBoxCameraFlow.service', () => {
  test('nasce na etapa etiqueta, sem candidatas e sem proposta', () => {
    const state = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
      cameraEnabled: true,
    })
    expect(state.step).toBe('label')
    expect(state.candidates).toEqual([])
    expect(state.identified).toBeUndefined()
    expect(state.proposal).toBeUndefined()
    expect(state.noMatch).toBe(false)
  })

  describe('R1 — 0/1/N candidatas', () => {
    test('0 candidatas volta para etiqueta com aviso de nenhuma caixa', () => {
      const initial = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
        cameraEnabled: true,
      })
      const state = reduceAll(initial, [
        { kind: 'labelRead' },
        { kind: 'matchesLoaded', candidates: [] },
      ])
      expect(state.step).toBe('label')
      expect(state.noMatch).toBe(true)
    })

    test('1 candidata pula direto para identificada', () => {
      const initial = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
        cameraEnabled: true,
      })
      const state = reduceAll(initial, [
        { kind: 'labelRead' },
        { kind: 'matchesLoaded', candidates: [{ id: 'box-1' }] },
      ])
      expect(state.step).toBe('identified')
      expect(state.identified).toEqual({ id: 'box-1' })
      expect(state.candidates).toEqual([])
    })

    test('N candidatas abrem a etapa de escolha, e escolher uma identifica', () => {
      const initial = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
        cameraEnabled: true,
      })
      const afterMatches = reduceAll(initial, [
        { kind: 'labelRead' },
        {
          kind: 'matchesLoaded',
          candidates: [{ id: 'box-1' }, { id: 'box-2' }],
        },
      ])
      expect(afterMatches.step).toBe('choose')
      expect(afterMatches.candidates).toEqual([{ id: 'box-1' }, { id: 'box-2' }])

      const afterChoice = packageBoxCameraFlowReducer(afterMatches, {
        candidate: { id: 'box-2' },
        kind: 'candidateSelected',
      })
      expect(afterChoice.step).toBe('identified')
      expect(afterChoice.identified).toEqual({ id: 'box-2' })
    })
  })

  describe('R1 — voltar para a etiqueta', () => {
    test('backToLabel funciona em qualquer etapa que não seja gravando', () => {
      const initial = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
        cameraEnabled: true,
      })
      const identified = reduceAll(initial, [
        { kind: 'labelRead' },
        { kind: 'matchesLoaded', candidates: [{ id: 'box-1' }] },
      ])
      const backFromIdentified = packageBoxCameraFlowReducer(identified, { kind: 'backToLabel' })
      expect(backFromIdentified.step).toBe('label')
      expect(backFromIdentified.identified).toBeUndefined()

      const measuring = packageBoxCameraFlowReducer(identified, { kind: 'measureRequested' })
      expect(measuring.step).toBe('measure')
      const backFromMeasure = packageBoxCameraFlowReducer(measuring, { kind: 'backToLabel' })
      expect(backFromMeasure.step).toBe('label')
    })

    test('backToLabel não interrompe a gravação em andamento', () => {
      const reviewing: State = {
        ...createInitialPackageBoxCameraFlowState<Candidate, Proposal>({ cameraEnabled: true }),
        identified: { id: 'box-1' },
        proposal: { lengthMm: 400 },
        reviewSource: 'camera',
        step: 'review',
      }
      const saving = packageBoxCameraFlowReducer(reviewing, { kind: 'saveRequested' })
      expect(saving.step).toBe('saving')
      const stillSaving = packageBoxCameraFlowReducer(saving, { kind: 'backToLabel' })
      expect(stillSaving.step).toBe('saving')
    })

    test('gravado volta para a etiqueta', () => {
      const reviewing: State = {
        ...createInitialPackageBoxCameraFlowState<Candidate, Proposal>({ cameraEnabled: true }),
        identified: { id: 'box-1' },
        proposal: { lengthMm: 400 },
        reviewSource: 'camera',
        step: 'review',
      }
      const saving = packageBoxCameraFlowReducer(reviewing, { kind: 'saveRequested' })
      const saved = packageBoxCameraFlowReducer(saving, { kind: 'saved' })
      expect(saved.step).toBe('label')
      expect(saved.identified).toBeUndefined()
      expect(saved.proposal).toBeUndefined()
    })
  })

  describe('R4 — aparelho sem suporte e carga lenta caem no digitado', () => {
    function identifiedAndMeasuring(): State {
      const initial = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
        cameraEnabled: true,
      })
      const identified = reduceAll(initial, [
        { kind: 'labelRead' },
        { kind: 'matchesLoaded', candidates: [{ id: 'box-1' }] },
      ])
      return packageBoxCameraFlowReducer(identified, { kind: 'measureRequested' })
    }

    test.each(['noWasm', 'engineFailed', 'tooSlow'] as const)(
      'motivo %s abre o formulário digitado da caixa já identificada',
      (reason) => {
        const measuring = identifiedAndMeasuring()
        const state = packageBoxCameraFlowReducer(measuring, { kind: 'unsupported', reason })
        expect(state.step).toBe('review')
        expect(state.reviewSource).toBe('typed')
        expect(state.proposal).toBeUndefined()
        expect(state.unsupportedReason).toBe(reason)
        expect(state.identified).toEqual({ id: 'box-1' })
      },
    )

    test('medida com sucesso preenche a proposta com origem câmera', () => {
      const measuring = identifiedAndMeasuring()
      const state = packageBoxCameraFlowReducer(measuring, {
        kind: 'measured',
        proposal: { lengthMm: 400 },
      })
      expect(state.step).toBe('review')
      expect(state.reviewSource).toBe('camera')
      expect(state.proposal).toEqual({ lengthMm: 400 })
      expect(state.unsupportedReason).toBeUndefined()
    })

    test('"Digitar medida" abre o formulário digitado a qualquer momento após identificar', () => {
      const initial = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
        cameraEnabled: true,
      })
      const identified = reduceAll(initial, [
        { kind: 'labelRead' },
        { kind: 'matchesLoaded', candidates: [{ id: 'box-1' }] },
      ])
      const typed = packageBoxCameraFlowReducer(identified, { kind: 'typeRequested' })
      expect(typed.step).toBe('review')
      expect(typed.reviewSource).toBe('typed')
      expect(typed.proposal).toBeUndefined()
    })
  })

  describe('R7 — função desligada não tem etapa Medida', () => {
    test('measureRequested não faz nada com a função desligada', () => {
      const initial = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
        cameraEnabled: false,
      })
      const identified = reduceAll(initial, [
        { kind: 'labelRead' },
        { kind: 'matchesLoaded', candidates: [{ id: 'box-1' }] },
      ])
      const afterRequest = packageBoxCameraFlowReducer(identified, { kind: 'measureRequested' })
      expect(afterRequest.step).toBe('identified')
    })

    test('cameraSettingsLoaded atualiza a função em tempo de execução', () => {
      const initial = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
        cameraEnabled: false,
      })
      const enabled = packageBoxCameraFlowReducer(initial, {
        enabled: true,
        kind: 'cameraSettingsLoaded',
      })
      expect(enabled.cameraEnabled).toBe(true)
    })
  })

  describe('pré-carga do motor', () => {
    test('acompanha carregando → pronto e carregando → falhou', () => {
      const initial = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
        cameraEnabled: true,
      })
      expect(initial.enginePreloadStatus).toBe('idle')
      const loading = packageBoxCameraFlowReducer(initial, { kind: 'enginePreloadStarted' })
      expect(loading.enginePreloadStatus).toBe('loading')
      const ready = packageBoxCameraFlowReducer(loading, { kind: 'enginePreloadReady' })
      expect(ready.enginePreloadStatus).toBe('ready')
      const failed = packageBoxCameraFlowReducer(loading, { kind: 'enginePreloadFailed' })
      expect(failed.enginePreloadStatus).toBe('failed')
    })
  })

  describe('fechar o fluxo', () => {
    test('closed reinicia o estado preservando a função ligada/desligada', () => {
      const initial = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
        cameraEnabled: true,
      })
      const identified = reduceAll(initial, [
        { kind: 'labelRead' },
        { kind: 'matchesLoaded', candidates: [{ id: 'box-1' }] },
      ])
      const closed = packageBoxCameraFlowReducer(identified, { kind: 'closed' })
      expect(closed.step).toBe('label')
      expect(closed.identified).toBeUndefined()
      expect(closed.cameraEnabled).toBe(true)
    })
  })

  describe('caixa escolhida na lista, sem etiqueta', () => {
    test('boxPreselected pula a etiqueta e abre direto a etapa Medida daquela caixa', () => {
      const initial = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
        cameraEnabled: true,
      })
      const state = packageBoxCameraFlowReducer(initial, {
        candidate: { id: 'box-9' },
        kind: 'boxPreselected',
      })
      expect(state.step).toBe('measure')
      expect(state.identified).toEqual({ id: 'box-9' })
      expect(state.noMatch).toBe(false)
    })

    test('troca a caixa de uma medida em andamento e descarta a proposta anterior', () => {
      const initial = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
        cameraEnabled: true,
      })
      const reviewed = reduceAll(initial, [
        { candidate: { id: 'box-1' }, kind: 'boxPreselected' },
        { kind: 'measured', proposal: { lengthMm: 300 } },
      ])
      const state = packageBoxCameraFlowReducer(reviewed, {
        candidate: { id: 'box-2' },
        kind: 'boxPreselected',
      })
      expect(state.step).toBe('measure')
      expect(state.identified).toEqual({ id: 'box-2' })
      expect(state.proposal).toBeUndefined()
      expect(state.reviewSource).toBeUndefined()
    })

    test('R7: com a função desligada a etapa Medida não abre', () => {
      const initial = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
        cameraEnabled: false,
      })
      const state = packageBoxCameraFlowReducer(initial, {
        candidate: { id: 'box-9' },
        kind: 'boxPreselected',
      })
      expect(state).toBe(initial)
    })

    test('não interrompe uma gravação em curso', () => {
      const initial = createInitialPackageBoxCameraFlowState<Candidate, Proposal>({
        cameraEnabled: true,
      })
      const saving = reduceAll(initial, [
        { candidate: { id: 'box-1' }, kind: 'boxPreselected' },
        { kind: 'typeRequested' },
        { kind: 'saveRequested' },
      ])
      expect(
        packageBoxCameraFlowReducer(saving, { candidate: { id: 'box-2' }, kind: 'boxPreselected' }),
      ).toBe(saving)
    })

    test('a linha da fila oferece "Medir pela câmera" só com a função ligada', async () => {
      const panel = await Bun.file(
        new URL(
          '../../src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx',
          import.meta.url,
        ),
      ).text()
      expect(panel).toContain("t('packageBoxes.measureWithCamera')")
      expect(panel).toMatch(/cameraMeasurementEnabled\s*\?\s*\(\)\s*=>\s*openCameraFlow\(box\)/u)
    })
  })
})
