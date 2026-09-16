/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { PackageBoxMeasurementSource } from './packageBoxClient.service'
import { MILLIMETRES_PER_CENTIMETRE } from './packageBoxMeasurementUnits.service'

/**
 * ⚠️ `TFunction` do react-i18next é sobrecarregado demais para caber num tipo simples sob
 * `exactOptionalPropertyTypes` — quem chama converte para este tipo na fronteira, uma vez, em vez
 * de este serviço puro conhecer a forma completa da biblioteca.
 */
export type Translate = (key: string, options?: Record<string, unknown>) => string

export type MeasurementSourceLabelInput = Readonly<{
  measurementMarginMm: null | number
  measurementSource: null | PackageBoxMeasurementSource
}>

/**
 * R5 (leitura): a linha já medida mostra de onde a medida veio — "pela câmera, ±X cm", "digitada"
 * ou "origem não registrada" para o que foi medido antes desta spec (D8, `measurementSource: null`).
 *
 * ⚠️ T14 item ALTO-2 (4ª revisão): `measurementMarginMm` nulo com origem pela câmera **não é margem
 * zero** — é o protocolo D16 gravando que as três dimensões foram digitadas por cima (nenhuma
 * proposta sobrou para render). Antes disso a fila lia "Pela câmera, ±0 cm" bem na caixa em que a
 * câmera errou nas três, anunciando confiança que não existe.
 *
 * ⚠️ MÉDIO-B (T14, 5ª revisão): extraída de `PackageBoxMeasurementPanel` para módulo próprio — os
 * contratos anteriores varriam o texto-fonte do componente, e uma reformatação de `prettier`
 * derrubava o teste sem mudar comportamento nenhum. Como função pura, o comportamento se mede
 * direto, com um `t` de mentira.
 */
export function measurementSourceLabel(t: Translate, input: MeasurementSourceLabelInput): string {
  if (input.measurementSource === null) return t('packageBoxes.source.unknown')
  if (input.measurementSource === 'typed') return t('packageBoxes.source.typed')
  if (input.measurementMarginMm === null) return t('packageBoxes.source.cameraNoMargin')
  return t('packageBoxes.source.camera', {
    margin: input.measurementMarginMm / MILLIMETRES_PER_CENTIMETRE,
  })
}
