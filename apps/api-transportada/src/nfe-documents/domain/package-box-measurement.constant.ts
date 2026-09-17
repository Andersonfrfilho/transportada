/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Spec 152 (D13–D19, experimental): cópia por valor de `PACKAGE_BOX_MEASUREMENT_SOURCES` e
 * `PACKAGE_BOX_MEASUREMENT_WARNINGS` (`database/nfe.schema.ts`) — o domínio não importa schema de
 * banco (camada sem I/O), e o contrato de paridade
 * (`test/nfe-package-box/measurement-source.contract.ts`) garante que as duas listas nunca divergem.
 */
export const PACKAGE_BOX_MEASUREMENT_SOURCES = [
  'typed',
  'camera',
  'camera_adjusted',
  'replicated',
] as const
export type PackageBoxMeasurementSource = (typeof PACKAGE_BOX_MEASUREMENT_SOURCES)[number]

/** Spec 155 (D6): `replicated` só a rota de replicar grava — o corpo de medir nunca a aceita. */
export const PACKAGE_BOX_MEASURED_SOURCES = ['typed', 'camera', 'camera_adjusted'] as const
export type PackageBoxMeasuredSource = (typeof PACKAGE_BOX_MEASURED_SOURCES)[number]

/** Códigos fechados de D9, mostrados na tela sempre com texto e ícone, nunca só por cor. */
export const PACKAGE_BOX_MEASUREMENT_WARNINGS = [
  'markerNotFound',
  'markerTooSmall',
  'steepAngle',
  'lowLight',
  'blurry',
  'boxOutOfFrame',
  'unstable',
] as const
export type PackageBoxMeasurementWarning = (typeof PACKAGE_BOX_MEASUREMENT_WARNINGS)[number]

/**
 * D6/D15: limites **provisórios** até a validação da spec 152 (T15) — apertar pode; afrouxar exige
 * o ok do usuário.
 */
export const MARGIN_RELIABLE_MM = 10
export const MARGIN_UNRELIABLE_MM = 30
