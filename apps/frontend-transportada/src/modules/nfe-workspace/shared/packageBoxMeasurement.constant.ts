/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  PACKAGE_BOX_MEASURED_SOURCES,
  type PackageBoxMeasurementSource,
} from './packageBoxClient.service'

/**
 * D13: enquanto a validação com caixas reais (spec 152, T15) não aprovar a medida pela câmera, toda
 * tela de medição mostra o selo "Experimental". Constante única — só a T16 muda para `false`, e só
 * depois do go da validação.
 */
export const CAMERA_MEASUREMENT_IS_EXPERIMENTAL = true

/**
 * Re-revisão (B5, §16 code-standards): derivada de `PACKAGE_BOX_MEASURED_SOURCES` — nunca
 * redeclara `'camera'`/`'camera_adjusted'` soltos. `'typed'` fica de fora porque a caixa digitada
 * nunca teve proposta da câmera para comparar (spec 152 R8, T14 revisão final ALTO-1).
 */
export const CAMERA_PARTICIPATION_SOURCES: ReadonlySet<PackageBoxMeasurementSource> = new Set(
  PACKAGE_BOX_MEASURED_SOURCES.filter((source) => source !== 'typed'),
)
