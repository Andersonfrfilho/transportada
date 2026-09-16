/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import {
  createInitialPackageBoxCameraFlowState,
  packageBoxCameraFlowReducer,
  type PackageBoxCameraFlowEvent,
  type PackageBoxCameraFlowState,
} from '../../src/modules/nfe-workspace/shared/packageBoxCameraFlow.service'

function reduce(
  state: PackageBoxCameraFlowState<string, string>,
  event: PackageBoxCameraFlowEvent<string, string>,
): PackageBoxCameraFlowState<string, string> {
  return packageBoxCameraFlowReducer(state, event)
}

const ROOT = new URL('../..', import.meta.url)

function read(path: string): Promise<string> {
  return Bun.file(new URL(path, ROOT)).text()
}

const FLOW = 'src/modules/nfe-workspace/components/PackageBoxCameraFlow.component.tsx'
const PRINT_CARD = 'src/modules/nfe-workspace/components/MeasurementCardPrint.component.tsx'
const MARKER = 'src/modules/nfe-workspace/shared/measurementCardMarker.constant.ts'
const PANEL = 'src/modules/nfe-workspace/components/PackageBoxMeasurementPanel.component.tsx'
const CAMERA_STREAM_HOOK = 'src/components/ui/useCameraStream.hook.ts'
const PT_LOCALE = 'src/modules/nfe-workspace/locales/nfeWorkspace.locale.json'
const EN_LOCALE = 'src/modules/nfe-workspace/locales/nfeWorkspace.en.locale.json'

/**
 * ⚠️ Contrato por texto de fonte (mesmo padrão dos demais deste app, sem DOM): a T11 encadeia
 * etiqueta → produto identificado → medida → conferência na mesma sessão de câmera (D4), dentro de
 * `PackageBoxCameraFlow`. Verifica a composição — quem é dono do stream, quais primitivos cada
 * etapa usa, e que "Voltar para a etiqueta" nunca falta.
 */
describe('PackageBoxCameraFlow encadeia as etapas na mesma sessão de câmera (spec 152 T11, R1)', () => {
  it('é dono único do useCameraStream, e entrega o mesmo stream ao leitor e ao primitivo de medida', async () => {
    const flow = await read(FLOW)

    expect(flow).toContain("from '@/components/ui/useCameraStream.hook'")
    expect(flow).toContain('useCameraStream({')
    expect(flow.match(/useCameraStream\(/g)).toHaveLength(1)
    expect(flow).toContain('stream,\n  })')
    expect(flow).toContain('stream={stream}')
  })

  it('usa o reducer puro da T9 para as etapas, sem reimplementar a máquina de estados', async () => {
    const flow = await read(FLOW)

    expect(flow).toContain("from '../shared/packageBoxCameraFlow.service'")
    expect(flow).toContain('packageBoxCameraFlowReducer')
    expect(flow).toContain('createInitialPackageBoxCameraFlowState')
  })

  it('"Voltar para a etiqueta" existe em toda etapa depois da etiqueta, exceto gravando', async () => {
    const flow = await read(FLOW)

    expect(flow).toContain(
      "const showBackToLabel = state.step !== 'label' && state.step !== 'saving'",
    )
    expect(flow).toContain("dispatch({ kind: 'backToLabel' })")
    expect(flow).toContain("t('packageBoxes.camera.backToLabel')")
  })

  it('a etapa Medida usa o primitivo de câmera do design system, nunca implementação própria', async () => {
    const flow = await read(FLOW)

    expect(flow).toContain("from '@/components/ui/box-dimension-scanner'")
    expect(flow).toContain('<BoxDimensionScanner')
    expect(flow).toContain("onMeasured={(proposal) => dispatch({ kind: 'measured', proposal })}")
    expect(flow).toContain("onUnsupported={(reason) => dispatch({ kind: 'unsupported', reason })}")
  })

  it('a etapa Conferência reaproveita o mesmo formulário da linha digitada (T10)', async () => {
    const flow = await read(FLOW)

    expect(flow).toContain("from './PackageBoxMeasurementForm.component'")
    expect(flow).toContain('<PackageBoxMeasurementForm')
    expect(flow).toContain(
      "proposal={state.reviewSource === 'camera' ? state.proposal : undefined}",
    )
  })

  it('a lanterna só aparece quando a trilha ativa expõe torch (caso extremo da spec)', async () => {
    const flow = await read(FLOW)

    expect(flow).toContain('hasTorch')
    expect(flow).toContain('{hasTorch ? (')
    expect(flow).toContain('onClick={toggleTorch}')

    const hook = await read(CAMERA_STREAM_HOOK)
    expect(hook).toContain('getCapabilities?.()?.torch === true')
    expect(hook).toContain('toggleTorch: () => void')
  })

  it('R4: sem suporte, a etapa Conferência mostra o aviso e abre digitado, sem gravar nada', async () => {
    const flow = await read(FLOW)

    expect(flow).toContain('state.unsupportedReason === undefined ? null : (')
    expect(flow).toContain("t('packageBoxes.camera.unsupportedNotice')")
  })

  it('R7: sem a função ligada na empresa, "Medir esta caixa" não aparece na etapa identificada', async () => {
    const flow = await read(FLOW)

    const identifiedBlock = flow.split("state.step === 'identified'")[1]?.split('null}')[0]
    expect(identifiedBlock).toBeDefined()
    expect(identifiedBlock).toContain('{cameraEnabled ? (')
  })

  /**
   * T14 item A5: as três linhas anteriores varriam a fonte atrás do nome da função e do `dispatch`.
   * A máquina de etapas é pura — o estado da pré-carga se exercita de verdade.
   */
  it('D18: a pré-carga tem os três desfechos na máquina de etapas', () => {
    const initial = createInitialPackageBoxCameraFlowState<string, string>({ cameraEnabled: true })
    expect(initial.enginePreloadStatus).toBe('idle')

    const loading = reduce(initial, { kind: 'enginePreloadStarted' })
    expect(loading.enginePreloadStatus).toBe('loading')
    expect(reduce(loading, { kind: 'enginePreloadReady' }).enginePreloadStatus).toBe('ready')
    expect(reduce(loading, { kind: 'enginePreloadFailed' }).enginePreloadStatus).toBe('failed')
    /** A pré-carga nunca mexe na etapa: digitar continua disponível enquanto o motor carrega. */
    expect(loading.step).toBe('label')
  })

  it('D18: respeita saveData e a ausência de WebAssembly antes de baixar o motor', async () => {
    const flow = await read(FLOW)

    expect(flow).toContain('function canPreload(): boolean {')
    expect(flow).toContain('connection?.saveData !== true')
    expect(flow).toContain("typeof WebAssembly === 'undefined'")
  })

  /**
   * T14 item A1: `saved` era despachado no mesmo tick do `onSave`, sem esperar desfecho nenhum —
   * o `422` da função desligada e o `400` de corpo recusado sumiam, e a tela voltava para a
   * etiqueta dizendo que gravou. `saveFailed` era código morto no reducer.
   */
  it('A1: a gravação só sai de "Gravando" com o desfecho do PUT, e a recusa volta para a Conferência', () => {
    const identified = reduce(
      reduce(createInitialPackageBoxCameraFlowState<string, string>({ cameraEnabled: true }), {
        kind: 'labelRead',
      }),
      { candidates: ['box-1'], kind: 'matchesLoaded' },
    )
    expect(identified.step).toBe('identified')
    const inReview = reduce(reduce(identified, { kind: 'typeRequested' }), {
      kind: 'saveRequested',
    })
    expect(inReview.step).toBe('saving')
    expect(reduce(inReview, { kind: 'saveFailed' }).step).toBe('review')
    expect(reduce(inReview, { kind: 'saved' }).step).toBe('label')
  })

  it('A1: a etapa não despacha saved sozinha, e mostra o código da recusa em role=alert', async () => {
    const flow = await read(FLOW)

    const handleSave = flow.split('function handleSave(')[1]?.split('\n  }')[0] ?? ''
    expect(handleSave).toContain("dispatch({ kind: 'saveRequested' })")
    expect(handleSave).not.toContain("dispatch({ kind: 'saved' })")
    expect(flow).toContain("if (saveStatus === 'success') dispatch({ kind: 'saved' })")
    expect(flow).toContain("if (saveStatus === 'error') dispatch({ kind: 'saveFailed' })")

    const alertBlock =
      flow.split('{saveErrorCode === undefined ? null : (')[1]?.split('</p>')[0] ?? ''
    expect(alertBlock).toContain('role="alert"')
    expect(alertBlock).toContain("t('packageBoxes.camera.saveFailed', { code: saveErrorCode })")
  })

  /** T14 item M7: consulta com erro virava "Nenhuma caixa com este código" — caixa que existe. */
  it('M7: consulta que falhou é erro na tela, nunca ausência de caixa', async () => {
    const flow = await read(FLOW)

    expect(flow).toContain("if (matching || lookupFailed || state.step !== 'identifying') return")
    const noticeBlock = flow.split('{lookupFailed ? (')[1]?.split('</p>')[0] ?? ''
    expect(noticeBlock).toContain('role="alert"')
    expect(noticeBlock).toContain("t('packageBoxes.camera.lookupFailed')")
  })

  /** T14 item M3: D13 pede o selo "Experimental" nas DUAS etapas — Medida e Conferência. */
  it('M3: a etapa Medida também carrega o selo experimental', async () => {
    const flow = await read(FLOW)
    const scanner = await read('src/components/ui/box-dimension-scanner.tsx')

    expect(flow).toContain("experimentalLabel={t('packageBoxes.experimentalBadge')}")
    expect(scanner).toContain('{experimentalLabel}')
    expect(scanner).toContain('<Badge variant="secondary">')
  })

  /** T14 item M6: o worker da pré-carga é o mesmo da etapa Medida — o OpenCV compila uma vez só. */
  it('M6: entrega o worker da pré-carga ao primitivo de medida em vez de subir outro', async () => {
    const flow = await read(FLOW)

    expect(flow).toContain('worker={engineWorker}')
    const preloadEffect = flow.split("dispatch({ kind: 'enginePreloadStarted' })")[1] ?? ''
    expect(preloadEffect.split('}, [cameraEnabled, isOpen])')[0]).not.toContain(
      'worker.terminate()\n      dispatch',
    )
  })
})

/**
 * D3: o cartão de medição imprimível. Nunca `<svg>` cru (regra do design system) — o ArUco é uma
 * grade de células desenhadas por CSS a partir de uma constante, a mesma matriz que o worker de
 * medida detecta.
 */
describe('MeasurementCardPrint é o cartão imprimível do marcador (spec 152 D3, T11)', () => {
  it('nunca usa <svg> cru — a matriz vem de uma constante e vira grade de células', async () => {
    const printCard = await read(PRINT_CARD)

    expect(printCard).not.toContain('<svg')
    expect(printCard).toContain("from '../shared/measurementCardMarker.constant'")
    expect(printCard).toContain('MEASUREMENT_CARD_MARKER_GRID')
  })

  it('a matriz do marcador tem 6×6 células e foi extraída do mesmo dicionário que o worker detecta', async () => {
    const marker = await read(MARKER)

    expect(marker).toContain("from '@/components/ui/boxDimension.constant'")
    expect(marker).toContain('MEASUREMENT_CARD_MARKER_GRID')
    const gridMatch = marker.match(/MEASUREMENT_CARD_MARKER_GRID[^=]*=\s*\[([\s\S]*?)\]/u)
    expect(gridMatch).not.toBeNull()
    const rows = (gridMatch?.[1]?.match(/'([01]{6})'/gu) ?? []).map((entry) =>
      entry.replaceAll("'", ''),
    )
    expect(rows).toHaveLength(6)
    rows.forEach((row) => expect(row).toMatch(/^[01]{6}$/))
    /** A borda de um marcador ArUco é sempre um módulo preto fechado. */
    expect(rows[0]).toBe('111111')
    expect(rows[5]).toBe('111111')
  })

  it('o cartão tem 150 mm de lado (D3) e uma régua de controle de 100 mm', async () => {
    const printCard = await read(PRINT_CARD)

    expect(printCard).toContain("from '@/components/ui/boxDimension.constant'")
    expect(printCard).toContain('MARKER_SIDE_MM')
    expect(printCard).toContain('RULER_LENGTH_MM = 100')
  })

  it('tem @media print e mede em milímetros, não em unidade relativa', async () => {
    const printCard = await read(PRINT_CARD)
    const css = await read('src/modules/nfe-workspace/styles/measurementCardPrint.module.css')

    expect(printCard).toContain('${cellSizeMm}mm')
    expect(printCard).toContain('${RULER_LENGTH_MM}mm')
    expect(css).toContain('@media print {')
  })

  it('instrui a imprimir em escala real e a conferir a régua antes do primeiro uso', async () => {
    const ptLocale = await read(PT_LOCALE)
    const enLocale = await read(EN_LOCALE)

    expect(ptLocale).toContain('"instruction": "Imprima em 100%, sem ajustar à página."')
    expect(ptLocale).toContain('"confirmRuler": "Antes do primeiro uso, confira a régua')
    expect(enLocale).toContain('"instruction": "Print at 100%, without fitting to page."')
  })

  it('é aberto pela tela da fila, por um botão próprio', async () => {
    const panel = await read(PANEL)

    expect(panel).toContain("from './MeasurementCardPrint.component'")
    expect(panel).toContain('<MeasurementCardPrint')
    expect(panel).toContain("t('packageBoxes.printCard.open')")
  })
})

/**
 * R7/D14/R1 (T11 — entrada unificada): a linha medida mostra a origem, e a entrada de câmera do
 * painel é decidida pelo mesmo interruptor lido por uma rota própria de `cargo.measure` (T4), não
 * pela leitura de `settings.manage` que o painel de configuração usa. Com a função ligada, "Ler
 * etiqueta" é a ÚNICA porta e abre o `PackageBoxCameraFlow` (etiqueta → produto → medida →
 * conferência numa sessão só) — não existe mais um segundo botão "Medir pela câmera". Com a função
 * desligada, o mesmo botão continua abrindo o leitor de sempre (`BarcodeScanner`), idêntico a hoje.
 */
describe('o painel entra no fluxo da câmera pela leitura própria do interruptor (R7)', () => {
  it('lê o interruptor por cargo.measure, não pela rota de settings.manage', async () => {
    const hook = await read('src/modules/nfe-workspace/hooks/useCameraMeasurementSettings.hook.ts')

    expect(hook).toContain('getMeasurementSettings')
    expect(hook).toContain(
      'cameraMeasurementEnabled: query.data?.cameraMeasurementEnabled ?? false',
    )
  })

  it('ligada, "Ler etiqueta" é a porta única — abre o PackageBoxCameraFlow, nunca o leitor antigo', async () => {
    const panel = await read(PANEL)

    expect(panel).toContain('cameraMeasurementEnabled: boolean')
    expect(panel).toContain(
      'cameraMeasurementEnabled ? setIsCameraFlowOpen(true) : setIsScannerOpen(true)',
    )
    expect(panel).toContain('<PackageBoxCameraFlow')
  })

  it('desligada, o mesmo botão abre o leitor de sempre — comportamento idêntico ao de hoje', async () => {
    const panel = await read(PANEL)

    const searchBlock = panel.split('<div className={styles.search}>')[1]?.split('</div>')[0]
    expect(searchBlock).toBeDefined()
    expect(searchBlock).toContain('setIsScannerOpen(true)')
    expect(searchBlock).toContain("t('packageBoxes.scan')")
  })

  it('não existe mais um segundo botão "Medir pela câmera" — a entrada é uma porta só', async () => {
    const panel = await read(PANEL)

    expect(panel).not.toContain("t('packageBoxes.camera.openFlow')")
    const scanButtonOccurrences = panel.match(/setIsCameraFlowOpen\(true\)/g) ?? []
    expect(scanButtonOccurrences).toHaveLength(1)

    const ptLocale = await read(PT_LOCALE)
    const enLocale = await read(EN_LOCALE)
    expect(ptLocale).not.toContain('"openFlow"')
    expect(enLocale).not.toContain('"openFlow"')
  })
})

/** R1/R5: a linha já medida da fila mostra de onde a medida veio — texto, não só cor. */
describe('a linha medida mostra a origem (R1, R5)', () => {
  it('camera/camera_adjusted mostram a margem, typed mostra "digitada", nulo mostra "não registrada"', async () => {
    const panel = await read(PANEL)

    expect(panel).toContain('function measurementSourceLabel(')
    expect(panel).toContain(
      "box.measurementSource === null) return t('packageBoxes.source.unknown')",
    )
    expect(panel).toContain(
      "box.measurementSource === 'typed') return t('packageBoxes.source.typed')",
    )
    expect(panel).toContain("t('packageBoxes.source.camera'")
    expect(panel).toContain('measurementSourceLabel(t, box)')
  })

  it('os textos de origem existem acentuados nos dois idiomas', async () => {
    const ptLocale = await read(PT_LOCALE)
    const enLocale = await read(EN_LOCALE)

    expect(ptLocale).toContain('"camera": "Pela câmera, ±{{margin}} cm"')
    expect(ptLocale).toContain('"unknown": "Origem não registrada"')
    expect(enLocale).toContain('"typed": "Typed"')
  })
})
