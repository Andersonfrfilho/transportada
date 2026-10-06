/* Copyright (c) 2026 Ada Technology. MIT License. */
const COLUMN_FIELD_PREFIX = 'previewColumnMap.'
const FIELD_ATTRIBUTE = 'data-field'
const AGGREGATE_COLUMN_FIELD = 'previewColumnMap'

type FocusRefusedFieldInput = Readonly<{
  field: string
  panel: HTMLElement | null
}>

function listFields(panel: HTMLElement): readonly HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(`[${FIELD_ATTRIBUTE}]`)]
}

/** O erro do mapa inteiro não aponta uma coluna: o atalho vai à primeira em branco, ou à primeira. */
function resolveAggregateTarget(panel: HTMLElement): HTMLElement | undefined {
  const columns = listFields(panel).filter((element) =>
    (element.getAttribute(FIELD_ATTRIBUTE) ?? '').startsWith(COLUMN_FIELD_PREFIX),
  )
  return (
    columns.find((element) => element instanceof HTMLInputElement && element.value.trim() === '') ??
    columns[0]
  )
}

/**
 * `web.md` §11.3: cada nome do aviso é um atalho — rola até o campo e põe o foco nele. O alvo é
 * achado pelo caminho que a API usou (`data-field`), comparado como texto: o caminho vem do servidor
 * e nunca entra num seletor.
 */
export function focusRefusedField({ field, panel }: FocusRefusedFieldInput): void {
  if (panel === null) return
  const target =
    field === AGGREGATE_COLUMN_FIELD
      ? resolveAggregateTarget(panel)
      : listFields(panel).find((element) => element.getAttribute(FIELD_ATTRIBUTE) === field)
  if (target === undefined) return

  // Salto instantâneo: o foco no campo interrompe a rolagem suave em curso.
  target.scrollIntoView({ behavior: 'auto', block: 'center' })
  target.focus({ preventScroll: true })
}
