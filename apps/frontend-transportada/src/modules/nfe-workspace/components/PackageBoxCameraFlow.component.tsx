/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useReducer, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { BoxDimensionScanner } from '@/components/ui/box-dimension-scanner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useBarcodeScanner } from '@/components/ui/useBarcodeScanner.hook'
import { useCameraStream } from '@/components/ui/useCameraStream.hook'
import type { BoxDimensionMeasuredResult } from '@/components/ui/useBoxDimensionScanner.hook'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import {
  PackageBoxMeasurementForm,
  type PackageBoxMeasurementFormSubmission,
} from './PackageBoxMeasurementForm.component'
import type { PackageBox } from '../shared/packageBoxClient.service'
import {
  createInitialPackageBoxCameraFlowState,
  packageBoxCameraFlowReducer,
} from '../shared/packageBoxCameraFlow.service'
import styles from '../styles/packageBoxCameraFlow.module.css'

export type PackageBoxCameraFlowProps = Readonly<{
  /** Spec 152 D14: sem a função ligada na empresa, a etapa Medida nunca existe. */
  cameraEnabled: boolean
  isOpen: boolean
  /** `true` enquanto a leitura da etiqueta está sendo casada contra a fila (mesma pergunta da busca). */
  matching: boolean
  matches: readonly PackageBox[] | undefined
  onClose: () => void
  onLookup: (text: string) => void
  /**
   * ⚠️ Sem `await`: a mesma regra de `usePackageBoxQueue`
   * (`test/shared/mutation-pending-state.contract.ts`) — segurar a transição de etapa esperando a
   * mutação travaria o botão. A UI é otimista, como já é o formulário digitado da linha.
   */
  onSave: (boxId: string, submission: PackageBoxMeasurementFormSubmission) => void
}>

const TITLE_ID = 'package-box-camera-flow-title'

/** D18: sem `WebAssembly`, sem sentido nem pedir a pré-carga — a etapa Medida nunca vai existir. */
function canPreload(): boolean {
  if (typeof WebAssembly === 'undefined') return false
  const connection = (navigator as Readonly<{ connection?: Readonly<{ saveData?: boolean }> }>)
    .connection
  return connection?.saveData !== true
}

/**
 * Spec 152, T11: o diálogo de tela cheia que encadeia etiqueta → produto identificado → medida →
 * conferência **na mesma sessão de câmera** (D4). Dono do `useCameraStream` (D19): abre uma vez,
 * ao montar (a função só monta quando o painel decide abrir o fluxo), e entrega o mesmo
 * `MediaStream` para o leitor (etapa Etiqueta) e para o primitivo de medida (etapa Medida) — nenhum
 * dos dois pede `getUserMedia` de novo.
 *
 * ⚠️ Este componente não sabe casar etiqueta com caixa nem gravar: `onLookup`/`onSave` são do
 * painel que hospeda (mesma pergunta que a busca de texto já faz para a fila, spec 085).
 */
export function PackageBoxCameraFlow({
  cameraEnabled,
  isOpen,
  matches,
  matching,
  onClose,
  onLookup,
  onSave,
}: PackageBoxCameraFlowProps) {
  const { t } = useTranslation('nfeWorkspace')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  const {
    hasTorch,
    status: cameraStatus,
    stream,
    toggleTorch,
    torchOn,
  } = useCameraStream({
    isActive: isOpen,
  })
  const [state, dispatch] = useReducer(
    packageBoxCameraFlowReducer<PackageBox, BoxDimensionMeasuredResult>,
    { cameraEnabled },
    createInitialPackageBoxCameraFlowState,
  )
  const preloadWorkerRef = useRef<Worker | undefined>(undefined)
  const { status: barcodeStatus, videoRef } = useBarcodeScanner({
    isActive: isOpen && state.step === 'label',
    onRead: (text) => {
      dispatch({ kind: 'labelRead' })
      onLookup(text)
    },
    stream,
  })

  useEffect(() => {
    dispatch({ enabled: cameraEnabled, kind: 'cameraSettingsLoaded' })
  }, [cameraEnabled])

  /** R1: a resposta da mesma pergunta que a busca de texto já faz para a fila (spec 085). */
  useEffect(() => {
    if (matching || state.step !== 'identifying') return
    dispatch({ candidates: matches ?? [], kind: 'matchesLoaded' })
  }, [matches, matching, state.step])

  /** D18: pré-carga do OpenCV ao abrir o fluxo com a função ligada — digitar continua disponível. */
  useEffect(() => {
    if (!isOpen || !cameraEnabled || !canPreload()) return
    dispatch({ kind: 'enginePreloadStarted' })
    const worker = new Worker(
      new URL('../../../components/ui/boxDimension.worker.ts', import.meta.url),
      { type: 'module' },
    )
    preloadWorkerRef.current = worker
    worker.onmessage = (event: MessageEvent<Readonly<{ kind: string }>>) => {
      dispatch({ kind: event.data.kind === 'ready' ? 'enginePreloadReady' : 'enginePreloadFailed' })
      worker.terminate()
    }
    worker.postMessage({ kind: 'preload' })
    return () => {
      worker.terminate()
      preloadWorkerRef.current = undefined
    }
  }, [cameraEnabled, isOpen])

  if (!isOpen) return null

  function handleSave(submission: PackageBoxMeasurementFormSubmission): void {
    const box = state.identified
    if (box === undefined) return
    dispatch({ kind: 'saveRequested' })
    onSave(box.id, submission)
    dispatch({ kind: 'saved' })
  }

  const showBackToLabel = state.step !== 'label' && state.step !== 'saving'
  const box = state.identified

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby={TITLE_ID}
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className={styles.head}>
          <h3 className={styles.title} id={TITLE_ID}>
            <Icon name="camera" />
            {t(`packageBoxes.camera.step.${state.step === 'choose' ? 'label' : state.step}`)}
          </h3>
          <Button
            aria-label={t('packageBoxes.scanner.close')}
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </div>

        {showBackToLabel ? (
          <Button
            onClick={() => dispatch({ kind: 'backToLabel' })}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="arrow-up" />
            {t('packageBoxes.camera.backToLabel')}
          </Button>
        ) : null}

        {state.step === 'label' || state.step === 'identifying' ? (
          <>
            {state.noMatch ? (
              <p className={styles.notice} role="alert">
                {t('packageBoxes.scanner.notFound')}
              </p>
            ) : null}
            <p aria-live="polite" className={styles.instruction}>
              {state.step === 'identifying'
                ? t('packageBoxes.camera.identifying')
                : t('packageBoxes.scanner.reading')}
            </p>
            {barcodeStatus === 'denied' || barcodeStatus === 'unavailable' ? (
              <p className={styles.notice}>
                {barcodeStatus === 'denied'
                  ? t('packageBoxes.scanner.denied')
                  : t('packageBoxes.scanner.unavailable')}
              </p>
            ) : (
              <div className={styles.viewport}>
                <video
                  aria-label={t('packageBoxes.scanner.title')}
                  className={styles.video}
                  muted
                  playsInline
                  ref={videoRef}
                />
              </div>
            )}
          </>
        ) : null}

        {state.step === 'choose' ? (
          <ul className={styles.candidatesList}>
            {state.candidates.map((candidate) => (
              <li key={candidate.id}>
                <Button
                  className={styles.candidateButton}
                  onClick={() => dispatch({ candidate, kind: 'candidateSelected' })}
                  type="button"
                  variant="secondary"
                >
                  <strong>{candidate.description || candidate.productCode}</strong>
                  <span>{candidate.emitterTaxId}</span>
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        {state.step === 'identified' && box !== undefined ? (
          <div className={styles.identified}>
            <p className={styles.identifiedName}>{box.description || box.productCode}</p>
            <p className={styles.hint}>{box.emitterTaxId}</p>
            <div className={styles.actions}>
              {cameraEnabled ? (
                <Button onClick={() => dispatch({ kind: 'measureRequested' })} type="button">
                  <Icon name="camera" />
                  {t('packageBoxes.camera.measureThis')}
                </Button>
              ) : null}
              <Button
                onClick={() => dispatch({ kind: 'typeRequested' })}
                type="button"
                variant="secondary"
              >
                {t('packageBoxes.camera.typeMeasurement')}
              </Button>
              <Button
                onClick={() => dispatch({ kind: 'backToLabel' })}
                type="button"
                variant="ghost"
              >
                {t('packageBoxes.camera.notThisBox')}
              </Button>
            </div>
          </div>
        ) : null}

        {state.step === 'measure' ? (
          <>
            {hasTorch ? (
              <Button onClick={toggleTorch} size="sm" type="button" variant="secondary">
                <Icon name="sun" />
                {t(torchOn ? 'packageBoxes.camera.torchOff' : 'packageBoxes.camera.torchOn')}
              </Button>
            ) : null}
            <BoxDimensionScanner
              captureLabel={t('packageBoxes.camera.captureLabel')}
              confirmLabel={t('packageBoxes.camera.confirmLabel')}
              instructionLabel={t('packageBoxes.camera.measureInstruction')}
              isActive={cameraStatus === 'ready'}
              loadingLabel={t('packageBoxes.camera.loadingLabel')}
              onMeasured={(proposal) => dispatch({ kind: 'measured', proposal })}
              onUnsupported={(reason) => dispatch({ kind: 'unsupported', reason })}
              pointLabels={{
                a: t('packageBoxes.camera.point.a'),
                b: t('packageBoxes.camera.point.b'),
                c: t('packageBoxes.camera.point.c'),
                d: t('packageBoxes.camera.point.d'),
                foot: t('packageBoxes.camera.point.foot'),
              }}
              retryLabel={t('packageBoxes.camera.retryLabel')}
              stream={stream}
              title={t('packageBoxes.camera.measureTitle')}
              warningLabels={{
                blurry: t('packageBoxes.warnings.blurry'),
                boxOutOfFrame: t('packageBoxes.warnings.boxOutOfFrame'),
                lowLight: t('packageBoxes.warnings.lowLight'),
                markerNotFound: t('packageBoxes.warnings.markerNotFound'),
                markerTooSmall: t('packageBoxes.warnings.markerTooSmall'),
                steepAngle: t('packageBoxes.warnings.steepAngle'),
                unstable: t('packageBoxes.warnings.unstable'),
              }}
            />
          </>
        ) : null}

        {(state.step === 'review' || state.step === 'saving') && box !== undefined ? (
          <>
            {state.unsupportedReason === undefined ? null : (
              <p className={styles.notice} role="alert">
                {t('packageBoxes.camera.unsupportedNotice')}
              </p>
            )}
            <PackageBoxMeasurementForm
              boxId={box.id}
              grossWeightGrams={box.grossWeightGrams}
              heightMm={box.heightMm}
              lengthMm={box.lengthMm}
              onCancel={() => dispatch({ kind: 'backToLabel' })}
              onSubmit={handleSave}
              proposal={state.reviewSource === 'camera' ? state.proposal : undefined}
              saving={state.step === 'saving'}
              unitsPerBox={box.unitsPerBox}
              widthMm={box.widthMm}
            />
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
