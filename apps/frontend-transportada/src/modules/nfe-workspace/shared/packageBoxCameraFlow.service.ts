/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Reducer puro das etapas do fluxo etiqueta → medida → conferência (spec 152, T9). Nenhuma função
 * aqui faz I/O: quem chama `getUserMedia`, lê a etiqueta, fala com o worker de medida ou grava a
 * caixa é o hook que envolve este reducer (T11), nunca este arquivo.
 *
 * Genérico em `TCandidate` (a caixa candidata que a leitura devolve) e `TProposal` (a proposta que
 * `BoxDimensionScanner` devolve, T8) para não acoplar a máquina de etapas ao formato exato de
 * `PackageBox`/`BoxDimensionMeasuredResult`.
 */

export type PackageBoxCameraFlowStep =
  | 'choose'
  | 'identified'
  | 'identifying'
  | 'label'
  | 'measure'
  | 'review'
  | 'saving'

export type PackageBoxCameraFlowEnginePreloadStatus = 'failed' | 'idle' | 'loading' | 'ready'

/** D11: os três jeitos do aparelho não conseguir medir — sempre caem no formulário digitado. */
export type PackageBoxCameraFlowUnsupportedReason = 'engineFailed' | 'noWasm' | 'tooSlow'

/** D8: a origem que a etapa Conferência mostra — `camera_adjusted` é decisão do formulário (T10). */
export type PackageBoxCameraFlowReviewSource = 'camera' | 'typed'

export type PackageBoxCameraFlowState<TCandidate, TProposal> = Readonly<{
  cameraEnabled: boolean
  candidates: readonly TCandidate[]
  enginePreloadStatus: PackageBoxCameraFlowEnginePreloadStatus
  identified: TCandidate | undefined
  /** R1: a etiqueta não casou com nenhuma caixa — some assim que uma nova leitura começa. */
  noMatch: boolean
  proposal: TProposal | undefined
  reviewSource: PackageBoxCameraFlowReviewSource | undefined
  step: PackageBoxCameraFlowStep
  unsupportedReason: PackageBoxCameraFlowUnsupportedReason | undefined
}>

export type PackageBoxCameraFlowEvent<TCandidate, TProposal> =
  | Readonly<{ kind: 'backToLabel' }>
  | Readonly<{ kind: 'boxPreselected'; candidate: TCandidate }>
  | Readonly<{ kind: 'cameraSettingsLoaded'; enabled: boolean }>
  | Readonly<{ kind: 'candidateSelected'; candidate: TCandidate }>
  | Readonly<{ kind: 'closed' }>
  | Readonly<{ kind: 'enginePreloadFailed' }>
  | Readonly<{ kind: 'enginePreloadReady' }>
  | Readonly<{ kind: 'enginePreloadStarted' }>
  | Readonly<{ kind: 'labelRead' }>
  | Readonly<{ kind: 'matchesLoaded'; candidates: readonly TCandidate[] }>
  | Readonly<{ kind: 'measureRequested' }>
  | Readonly<{ kind: 'measured'; proposal: TProposal }>
  | Readonly<{ kind: 'saveFailed' }>
  | Readonly<{ kind: 'saveRequested' }>
  | Readonly<{ kind: 'saved' }>
  | Readonly<{ kind: 'typeRequested' }>
  | Readonly<{ kind: 'unsupported'; reason: PackageBoxCameraFlowUnsupportedReason }>

export function createInitialPackageBoxCameraFlowState<TCandidate, TProposal>({
  cameraEnabled,
}: Readonly<{ cameraEnabled: boolean }>): PackageBoxCameraFlowState<TCandidate, TProposal> {
  return {
    cameraEnabled,
    candidates: [],
    enginePreloadStatus: 'idle',
    identified: undefined,
    noMatch: false,
    proposal: undefined,
    reviewSource: undefined,
    step: 'label',
    unsupportedReason: undefined,
  }
}

function resetIdentification<TCandidate, TProposal>(
  state: PackageBoxCameraFlowState<TCandidate, TProposal>,
): PackageBoxCameraFlowState<TCandidate, TProposal> {
  return {
    ...state,
    candidates: [],
    identified: undefined,
    proposal: undefined,
    reviewSource: undefined,
    unsupportedReason: undefined,
  }
}

function enterReview<TCandidate, TProposal>(
  state: PackageBoxCameraFlowState<TCandidate, TProposal>,
  params: Readonly<{
    proposal: TProposal | undefined
    reviewSource: PackageBoxCameraFlowReviewSource
    unsupportedReason: PackageBoxCameraFlowUnsupportedReason | undefined
  }>,
): PackageBoxCameraFlowState<TCandidate, TProposal> {
  return {
    ...state,
    proposal: params.proposal,
    reviewSource: params.reviewSource,
    step: 'review',
    unsupportedReason: params.unsupportedReason,
  }
}

/**
 * R1 (0/1/N candidatas, voltar, gravado → etiqueta), R4 (`unsupported`/carga lenta → digitado da
 * caixa lida) e R7 (função desligada → `measureRequested` não abre a etapa Medida).
 */
export function packageBoxCameraFlowReducer<TCandidate, TProposal>(
  state: PackageBoxCameraFlowState<TCandidate, TProposal>,
  event: PackageBoxCameraFlowEvent<TCandidate, TProposal>,
): PackageBoxCameraFlowState<TCandidate, TProposal> {
  switch (event.kind) {
    case 'cameraSettingsLoaded':
      return { ...state, cameraEnabled: event.enabled }

    case 'labelRead':
      if (state.step !== 'label') return state
      return { ...resetIdentification(state), noMatch: false, step: 'identifying' }

    case 'matchesLoaded': {
      if (state.step !== 'identifying') return state
      const [firstCandidate] = event.candidates
      if (firstCandidate === undefined) {
        return { ...resetIdentification(state), noMatch: true, step: 'label' }
      }
      if (event.candidates.length === 1) {
        return { ...state, candidates: [], identified: firstCandidate, step: 'identified' }
      }
      return { ...state, candidates: event.candidates, step: 'choose' }
    }

    case 'candidateSelected':
      if (state.step !== 'choose') return state
      return { ...state, candidates: [], identified: event.candidate, step: 'identified' }

    /** Caixa sem etiqueta legível: o operador escolhe na fila e a etiqueta nem é pedida. */
    case 'boxPreselected':
      if (state.step === 'saving' || !state.cameraEnabled) return state
      return {
        ...resetIdentification(state),
        identified: event.candidate,
        noMatch: false,
        step: 'measure',
      }

    case 'measureRequested':
      if (state.step !== 'identified' || !state.cameraEnabled) return state
      return { ...state, step: 'measure' }

    case 'measured':
      if (state.step !== 'measure') return state
      return enterReview(state, {
        proposal: event.proposal,
        reviewSource: 'camera',
        unsupportedReason: undefined,
      })

    case 'unsupported':
      if (state.step !== 'measure') return state
      return enterReview(state, {
        proposal: undefined,
        reviewSource: 'typed',
        unsupportedReason: event.reason,
      })

    case 'typeRequested':
      if (state.step !== 'choose' && state.step !== 'identified' && state.step !== 'measure') {
        return state
      }
      return enterReview(state, {
        proposal: undefined,
        reviewSource: 'typed',
        unsupportedReason: undefined,
      })

    case 'backToLabel':
      if (state.step === 'saving') return state
      return { ...resetIdentification(state), noMatch: false, step: 'label' }

    case 'saveRequested':
      if (state.step !== 'review') return state
      return { ...state, step: 'saving' }

    case 'saved':
      if (state.step !== 'saving') return state
      return { ...resetIdentification(state), noMatch: false, step: 'label' }

    case 'saveFailed':
      if (state.step !== 'saving') return state
      return { ...state, step: 'review' }

    case 'enginePreloadStarted':
      return { ...state, enginePreloadStatus: 'loading' }

    case 'enginePreloadReady':
      return { ...state, enginePreloadStatus: 'ready' }

    case 'enginePreloadFailed':
      return { ...state, enginePreloadStatus: 'failed' }

    case 'closed':
      return createInitialPackageBoxCameraFlowState({ cameraEnabled: state.cameraEnabled })

    default:
      return state
  }
}
