/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 145 T12: a tela pergunta enquanto o worker calcula a planta. Funções puras, relógio injetado.
 */
import { CARGO_LAYOUT_POLL_CEILING_MS, CARGO_LAYOUT_REFETCH_MS } from './trip.constant'
import type {
  CargoLayoutStatus,
  TripCargoLayout,
  TripCargoLayoutPoll,
  TripCargoLayoutState,
  TripCargoPreview,
} from './trip.types'

/** Um trecho contínuo de `pending` para a mesma chave (viagem ou `layoutId` da prévia). */
export type CargoLayoutPendingEpisode = Readonly<{ key: string; since: number }>

export type CargoLayoutPhase = CargoLayoutStatus | 'timedOut'

/** O que a T13 desenha. `layout` é a planta servida; em `pending` com `stale` é a anterior. */
export type CargoLayoutView = Readonly<{
  errorCode: null | string
  layout: TripCargoLayout | null
  phase: CargoLayoutPhase
  stale: boolean
  truncated: boolean
}>

type CargoLayoutClock = Readonly<{
  episode: CargoLayoutPendingEpisode | undefined
  now: number
  status: CargoLayoutStatus | undefined
}>

/** ⚠️ O teto é por episódio: sair de `pending` zera, e outra chave começa do zero. */
export function trackCargoLayoutPendingEpisode(
  input: Readonly<{
    key: string
    now: number
    previous: CargoLayoutPendingEpisode | undefined
    status: CargoLayoutStatus | undefined
  }>,
): CargoLayoutPendingEpisode | undefined {
  if (input.status !== 'pending') return undefined
  if (input.previous?.key === input.key) return input.previous
  return { key: input.key, since: input.now }
}

function hasTimedOut(input: CargoLayoutClock): boolean {
  if (input.episode === undefined) return false
  return input.now - input.episode.since >= CARGO_LAYOUT_POLL_CEILING_MS
}

/** `false` é o "não repita" do TanStack Query. `failed` é estável dentro da espera (D18). */
export function resolveCargoLayoutRefetchInterval(input: CargoLayoutClock): false | number {
  if (input.status !== 'pending') return false
  return hasTimedOut(input) ? false : CARGO_LAYOUT_REFETCH_MS
}

/** Sem `state` é API anterior à T10: `null`, e a tela segue a de hoje. `truncated` vem da API. */
export function resolveCargoLayoutView(
  input: Readonly<{
    episode: CargoLayoutPendingEpisode | undefined
    layout: TripCargoLayout | null
    now: number
    state: TripCargoLayoutState | undefined
  }>,
): CargoLayoutView | null {
  if (input.state === undefined) return null
  const isTimedOut =
    input.state.status === 'pending' &&
    hasTimedOut({ episode: input.episode, now: input.now, status: input.state.status })
  return {
    errorCode: input.state.errorCode,
    layout: input.layout,
    phase: isTimedOut ? 'timedOut' : input.state.status,
    stale: input.state.stale,
    truncated: input.state.truncated,
  }
}

/**
 * Prévia (T13, derivada da D4): a última planta pronta que a tela exibiu, guardada em memória pela
 * sessão da tela. O POST `pending` da prévia vem sem planta, e sem isto não haveria fantasma.
 */
export function rememberShownCargoLayout(
  input: Readonly<{ previous: TripCargoLayout | null; view: CargoLayoutView | null }>,
): TripCargoLayout | null {
  if (input.view?.phase !== 'ready' || input.view.layout === null) return input.previous
  return input.view.layout
}

/** Espera sem planta servida recebe a lembrada, marcada desatualizada. `ready`/`unavailable` intactos. */
export function withRememberedCargoLayout(
  input: Readonly<{ remembered: TripCargoLayout | null; view: CargoLayoutView | null }>,
): CargoLayoutView | null {
  const { remembered, view } = input
  if (view === null || view.layout !== null || remembered === null) return view
  if (view.phase === 'ready' || view.phase === 'unavailable') return view
  return { ...view, layout: remembered, stale: true }
}

export function resolveCargoPreviewPollLayoutId(
  preview: TripCargoPreview | null,
): string | undefined {
  if (preview?.state?.status !== 'pending') return undefined
  return preview.layoutId
}

/** ⚠️ Só a resposta do mesmo `layoutId` entra: a de uma prévia anterior chegando atrasada é descartada. */
export function mergeCargoPreviewPoll(
  input: Readonly<{ poll: TripCargoLayoutPoll | undefined; preview: TripCargoPreview | null }>,
): TripCargoPreview | null {
  if (input.preview === null || input.poll === undefined) return input.preview
  if (input.poll.layoutId !== input.preview.layoutId) return input.preview
  return { ...input.preview, cargoLayout: input.poll.cargoLayout, state: input.poll.state }
}
