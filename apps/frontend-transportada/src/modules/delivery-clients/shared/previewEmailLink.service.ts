/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { WorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

/** ⚠️ Cópia por valor da rota e do espaço de trabalho do recebimento: um contrato cobra os dois lados. */
const CARGO_PREVIEWS_ROUTE = '/recebimento/previas'
const CARGO_RECEIVING_WORKSPACE = 'cargo-receiving'
const NO_VALUE = '—'

export const buildPreviewDetailRoute = (previewId: string): string =>
  `${CARGO_PREVIEWS_ROUTE}/${encodeURIComponent(previewId)}`

/** A prévia aceita abre no recebimento da carga, sem recarregar o painel: o mesmo salto do "Ver cliente". */
export function navigateToPreview(
  input: Readonly<{ navigator: WorkspaceNavigator; previewId: string }>,
): void {
  input.navigator.pushPath(buildPreviewDetailRoute(input.previewId))
  input.navigator.rememberWorkspace(CARGO_RECEIVING_WORKSPACE)
  input.navigator.dispatchPopState()
}

/** Data e hora no idioma da tela; valor que não é data sai como veio, nunca como "Invalid Date". */
export function formatPreviewEmailMoment(
  input: Readonly<{ locale: string; value: string | null }>,
): string {
  if (input.value === null) return NO_VALUE
  const moment = new Date(input.value)
  if (Number.isNaN(moment.getTime())) return input.value
  return new Intl.DateTimeFormat(input.locale, { dateStyle: 'short', timeStyle: 'short' }).format(
    moment,
  )
}
