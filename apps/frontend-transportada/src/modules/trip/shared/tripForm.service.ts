import { extractNfeAccessKey } from '@/modules/shared/nfeAccessKey.service'

export type TripDocumentLinkMode = 'freight' | 'nfe'
export type TripDocumentLinkDraft = Readonly<{ mode: TripDocumentLinkMode; value: string }>

export function buildLinkTripDocumentBody(
  draft: TripDocumentLinkDraft,
): Readonly<{ freightCalculationId: null | string; nfeDocumentId: null | string }> {
  return {
    freightCalculationId: draft.mode === 'freight' ? draft.value : null,
    nfeDocumentId: draft.mode === 'nfe' ? draft.value : null,
  }
}

export type TripLinkReference =
  | Readonly<{ kind: 'accessKey'; value: string }>
  | Readonly<{ kind: 'identifier'; value: string }>
  | undefined

/**
 * O separador sem câmera digita a chave impressa sob o código de barras no mesmo campo que já
 * recebia o identificador: quem separa as duas é o formato, e um segundo campo só somaria escolha.
 * Cálculo de frete não tem chave, então ali 44 caracteres continuam sendo identificador.
 */
export function resolveTripLinkReference(draft: TripDocumentLinkDraft): TripLinkReference {
  const value = draft.value.trim()
  if (value === '') return undefined
  if (draft.mode === 'freight') return { kind: 'identifier', value }
  const accessKey = extractNfeAccessKey(value)
  if (accessKey === undefined) return { kind: 'identifier', value }
  return { kind: 'accessKey', value: accessKey }
}
