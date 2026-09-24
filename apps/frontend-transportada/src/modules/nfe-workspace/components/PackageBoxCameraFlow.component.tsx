/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useReducer, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { BoxDimensionScanner } from '@/components/ui/box-dimension-scanner'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useBarcodeScanner } from '@/components/ui/useBarcodeScanner.hook'
import { useCameraStream } from '@/components/ui/useCameraStream.hook'
import type { BoxDimensionMeasuredResult } from '@/components/ui/boxDimensionProposal.service'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import {
  PackageBoxMeasurementForm,
  type PackageBoxMeasurementFormSubmission,
} from './PackageBoxMeasurementForm.component'
import { PackageBoxMeasurementGuide } from './PackageBoxMeasurementGuide.component'
import type { PackageBox } from '../shared/packageBoxClient.service'
import {
  createInitialPackageBoxCameraFlowState,
  packageBoxCameraFlowReducer,
} from '../shared/packageBoxCameraFlow.service'
import {
  formatMeasuredAtDate,
  measurementSourceLabel,
  type Translate,
} from '../shared/packageBoxMeasurementLabel.service'
import { toCentimetres } from '../shared/packageBoxMeasurementUnits.service'
import {
  hasSeenMeasurementGuide,
  markMeasurementGuideSeen,
  readMeasurementGuideStorage,
} from '../shared/measurementGuideSeen.service'
import { resolveInitialUnitsPerBox } from '../shared/packageBoxUnitsPerBox.service'
import styles from '../styles/packageBoxCameraFlow.module.css'

export type PackageBoxCameraFlowProps = Readonly<{
  /** Spec 152 D14: sem a função ligada na empresa, a etapa Medida nunca existe. */
  cameraEnabled: boolean
  isOpen: boolean
  /** M7: a consulta falhou — é erro na tela, nunca "nenhuma caixa com este código". */
  lookupFailed: boolean
  /** `true` enquanto a leitura da etiqueta está sendo casada contra a fila (mesma pergunta da busca). */
  matching: boolean
  matches: readonly PackageBox[] | undefined
  onClose: () => void
  onLookup: (text: string) => void
  onSave: (boxId: string, submission: PackageBoxMeasurementFormSubmission) => void
  /** Caixa escolhida na fila: o fluxo abre na Medida dela e fecha depois de gravar. */
  preselectedBox: PackageBox | undefined
  /** A1: o código da recusa do último `PUT`, para a Conferência dizer o que aconteceu. */
  saveErrorCode: string | undefined
  /**
   * A1: o desfecho da gravação. A etapa só sai de "Gravando" quando ele chega — despachar `saved`
   * no mesmo tick do `onSave` mandava o operador de volta à etiqueta com a caixa ainda sem medida.
   */
  saveStatus: 'error' | 'idle' | 'pending' | 'success'
}>

const TITLE_ID = 'package-box-camera-flow-title'

/** A mesma letra no ponto da foto, no desenho e no texto do guia. */
const POINT_SHORT_LABELS = { a: 'A', b: 'B', c: 'C', d: 'D', foot: 'E' } as const

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
  lookupFailed,
  matches,
  matching,
  onClose,
  onLookup,
  onSave,
  preselectedBox,
  saveErrorCode,
  saveStatus,
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
  const [engineWorker, setEngineWorker] = useState<Worker | undefined>(undefined)
  const [isGuideOpen, setIsGuideOpen] = useState(false)
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

  /** Na primeira medida do aparelho o guia abre sozinho; depois fica no botão "Como medir". */
  useEffect(() => {
    if (state.step !== 'measure') return
    if (!hasSeenMeasurementGuide(readMeasurementGuideStorage())) setIsGuideOpen(true)
  }, [state.step])

  /** Cada abertura começa limpa: sem isso, abrir pela etiqueta herdava a caixa da lista anterior. */
  useEffect(() => {
    if (!isOpen) return
    dispatch(
      preselectedBox === undefined
        ? { kind: 'closed' }
        : { candidate: preselectedBox, kind: 'boxPreselected' },
    )
  }, [isOpen, preselectedBox])

  /**
   * R1: a resposta da mesma pergunta que a busca de texto já faz para a fila (spec 085).
   *
   * ⚠️ M7: consulta que **falhou** não é consulta vazia. Tratar as duas igual dizia "Nenhuma caixa
   * com este código" para uma caixa que existe, e o conferente separava a nota sem medida.
   */
  useEffect(() => {
    if (matching || lookupFailed || state.step !== 'identifying') return
    dispatch({ candidates: matches ?? [], kind: 'matchesLoaded' })
  }, [lookupFailed, matches, matching, state.step])

  /**
   * A1: a etapa só sai de "Gravando" com o desfecho do `PUT` na mão.
   *
   * ⚠️ **E com o desfecho DESTA tentativa.** O `dispatch` daqui e o `mutate` do painel são dois
   * caminhos diferentes, e não há garantia de caírem no mesmo lote de render: a etapa podia entrar
   * em `saving` vendo ainda o `success` da caixa anterior e sair na hora, mandando o conferente de
   * volta à etiqueta com esta caixa ainda sem medida (2ª revisão, item M-c). Só conta o desfecho que
   * chega depois de a tentativa ficar `pending`.
   */
  const attemptIsPendingRef = useRef(false)

  useEffect(() => {
    if (state.step !== 'saving') {
      attemptIsPendingRef.current = false
      return
    }
    if (saveStatus === 'pending') {
      attemptIsPendingRef.current = true
      return
    }
    if (!attemptIsPendingRef.current) return
    if (saveStatus === 'success') dispatch({ kind: 'saved' })
    if (saveStatus === 'error') dispatch({ kind: 'saveFailed' })
    // Quem veio da fila escolheu uma caixa, não está varrendo etiquetas: volta para a lista.
    if (saveStatus === 'success' && preselectedBox !== undefined) onClose()
  }, [onClose, preselectedBox, saveStatus, state.step])

  /**
   * B-b: consulta que falhou volta a etapa para a etiqueta. O aviso de falha aparece nas duas
   * etapas, mas `useBarcodeScanner` só fica ativo em `label` — em `identifying` o texto pedia para
   * ler a etiqueta de novo com o leitor desligado, e ler não fazia nada.
   */
  useEffect(() => {
    if (!lookupFailed || state.step !== 'identifying') return
    dispatch({ kind: 'backToLabel' })
  }, [lookupFailed, state.step])

  /**
   * D18: pré-carga do OpenCV ao abrir o fluxo com a função ligada — digitar continua disponível.
   *
   * ⚠️ **O worker da pré-carga é o mesmo da etapa Medida** (T14 item M6). Ele era terminado assim
   * que respondia `ready`, e o scanner subia outro: o WASM do OpenCV era baixado, instanciado e
   * compilado duas vezes por sessão, e a segunda vez não adiantava nada. Agora ele sobrevive até o
   * fluxo fechar e desce por `worker={engineWorker}`; o hook da medida repete o `preload` nele, que
   * responde `ready` na hora (o `cvPromise` do worker já está resolvido).
   */
  useEffect(() => {
    if (!isOpen || !cameraEnabled || !canPreload()) return
    dispatch({ kind: 'enginePreloadStarted' })
    const worker = new Worker(
      new URL('../../../components/ui/boxDimension.worker.ts', import.meta.url),
      { type: 'module' },
    )
    setEngineWorker(worker)
    worker.onmessage = (event: MessageEvent<Readonly<{ kind: string }>>) => {
      dispatch({ kind: event.data.kind === 'ready' ? 'enginePreloadReady' : 'enginePreloadFailed' })
      worker.onmessage = null
    }
    worker.postMessage({ kind: 'preload' })
    return () => {
      worker.terminate()
      setEngineWorker(undefined)
    }
  }, [cameraEnabled, isOpen])

  if (!isOpen) return null

  function closeGuide(): void {
    markMeasurementGuideSeen(readMeasurementGuideStorage())
    setIsGuideOpen(false)
  }

  function handleSave(submission: PackageBoxMeasurementFormSubmission): void {
    const box = state.identified
    if (box === undefined) return
    dispatch({ kind: 'saveRequested' })
    onSave(box.id, submission)
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
            {lookupFailed ? (
              <p className={styles.notice} role="alert">
                {t('packageBoxes.camera.lookupFailed')}
              </p>
            ) : null}
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
            {/*
              ⚠️ A caixa lida pela câmera já tem medida: mostra o aviso e as medidas atuais antes de
              qualquer ação — nem "Medir pela câmera" nem "Digitar medida" gravam sem o operador ver
              o que já está registrado (nunca a edição silenciosa que este bloco existe para evitar).
            */}
            {box.measuredAt === null ? null : (
              <>
                <p className={styles.notice} role="status">
                  {t('packageBoxes.scanner.alreadyMeasured.title')}
                </p>
                <p className={styles.hint}>
                  {t('packageBoxes.measured', {
                    height: toCentimetres(box.heightMm),
                    length: toCentimetres(box.lengthMm),
                    units: box.unitsPerBox,
                    width: toCentimetres(box.widthMm),
                  })}
                  {' · '}
                  {measurementSourceLabel(t as Translate, box)}
                </p>
                <p className={styles.hint}>
                  {t('packageBoxes.scanner.alreadyMeasured.measuredOn', {
                    date: formatMeasuredAtDate(box.measuredAt),
                  })}
                </p>
              </>
            )}
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
            {isGuideOpen ? (
              <PackageBoxMeasurementGuide
                onClose={closeGuide}
                pointShortLabels={POINT_SHORT_LABELS}
              />
            ) : (
              <Button onClick={() => setIsGuideOpen(true)} size="sm" type="button" variant="ghost">
                <Icon name="document" />
                {t('packageBoxes.guide.open')}
              </Button>
            )}
            {hasTorch ? (
              <Button onClick={toggleTorch} size="sm" type="button" variant="secondary">
                <Icon name="sun" />
                {t(torchOn ? 'packageBoxes.camera.torchOff' : 'packageBoxes.camera.torchOn')}
              </Button>
            ) : null}
            <BoxDimensionScanner
              captureLabel={t('packageBoxes.camera.captureLabel')}
              confirmLabel={t('packageBoxes.camera.confirmLabel')}
              experimentalLabel={t('packageBoxes.experimentalBadge')}
              framingHintLabel={t('packageBoxes.camera.framingHint')}
              instructionLabel={t('packageBoxes.camera.measureInstruction')}
              isActive={cameraStatus === 'ready'}
              loadingLabel={t('packageBoxes.camera.loadingLabel')}
              markingHintLabel={t('packageBoxes.camera.markingHint')}
              onMeasured={(proposal) => dispatch({ kind: 'measured', proposal })}
              onUnsupported={(reason) => dispatch({ kind: 'unsupported', reason })}
              pointLabels={{
                a: t('packageBoxes.camera.point.a'),
                b: t('packageBoxes.camera.point.b'),
                c: t('packageBoxes.camera.point.c'),
                d: t('packageBoxes.camera.point.d'),
                foot: t('packageBoxes.camera.point.foot'),
              }}
              pointShortLabels={POINT_SHORT_LABELS}
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
              worker={engineWorker}
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
            {/* A1: a recusa do `PUT` aparece com o código — o 422 da função desligada não é igual ao 400. */}
            {saveErrorCode === undefined ? null : (
              <p className={styles.notice} role="alert">
                {t('packageBoxes.camera.saveFailed', { code: saveErrorCode })}
              </p>
            )}
            <PackageBoxMeasurementForm
              boxId={box.id}
              canQuickFillFromFamily={box.measuredAt === null && box.familyMeasuredCount > 0}
              grossWeightGrams={box.grossWeightGrams}
              heightMm={box.heightMm}
              lengthMm={box.lengthMm}
              onCancel={() => dispatch({ kind: 'backToLabel' })}
              onSubmit={handleSave}
              proposal={state.reviewSource === 'camera' ? state.proposal : undefined}
              saving={state.step === 'saving'}
              unitsPerBox={resolveInitialUnitsPerBox(box)}
              widthMm={box.widthMm}
            />
          </>
        ) : null}
      </div>
    </div>,
    document.body,
  )
}
