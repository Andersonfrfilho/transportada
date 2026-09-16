/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Cartão impresso pelo app: ArUco `DICT_4X4_50`, id 0, lado de 150 mm (spec 152 D3). */
export const MARKER_SIDE_MM = 150
export const MARKER_DICTIONARY = 'DICT_4X4_50'
export const MARKER_ID = 0
export const MARKER_CORNER_COUNT = 4

/** Identificador do motor gravado no histórico da medida (spec 152 D8). */
export const MEASUREMENT_ENGINE = 'aruco-homography-v1'

/**
 * D6/D15: faixas de tolerância por dimensão — até 10 mm a medida é confiável, entre 10 e 30 mm ela
 * é imprecisa (grava só com confirmação) e acima de 30 mm a câmera não preenche o campo.
 * Limites **provisórios** até a validação da spec 152 (T15): apertar pode, afrouxar volta ao usuário.
 */
export const MARGIN_RELIABLE_MM = 10
export const MARGIN_UNRELIABLE_MM = 30

/** D7: piso de erro de impressão do cartão, somado à margem de toda dimensão. */
export const PRINT_FLOOR_MM = 2
export const PRINT_SCALE_TOLERANCE = 0.002

/** D7: parâmetros de incerteza medidos no spike — provisórios até a validação (T15). */
export const CORNER_SIGMA_FLOOR_PX = 0.3
export const TOUCH_SIGMA_PX = 1.5
export const FALLBACK_FOCAL_RELATIVE_SIGMA = 0.1
export const MONTE_CARLO_SAMPLES = 400

/** Semente fixa: mesma entrada, mesma margem — o Monte Carlo nunca varia entre duas leituras. */
export const MONTE_CARLO_SEED = 150

/** Faixa física de câmera de celular: fora dela a focal da homografia é descartada. */
export const DEFAULT_HORIZONTAL_FOV_DEGREES = 68
export const MIN_PLAUSIBLE_FOV_DEGREES = 40
export const MAX_PLAUSIBLE_FOV_DEGREES = 100

/** Abaixo destes pivôs o sistema é singular e a medida é recusada em vez de inventada. */
export const SINGULAR_SYSTEM_EPSILON = 1e-12
export const SINGULAR_MATRIX_EPSILON = 1e-15

/** Limites do indicador ao vivo — provisórios até a validação (T15). */
export const MIN_MARKER_SIDE_PX = 80
export const MAX_VIEW_ANGLE_DEGREES = 55
export const MIN_MEAN_LUMINANCE = 60
export const MIN_LUMINANCE_CONTRAST = 20
export const MIN_LAPLACIAN_VARIANCE = 60
export const EDGE_MARGIN_PX = 12
export const MAX_UNSTABLE_SHIFT_PX = 3

/**
 * D9: domínio fechado de motivos, cópia por valor do CHECK
 * `nfe_package_box_measurements_warnings_domain_check` da API. Só estes códigos são graváveis.
 */
export const BOX_DIMENSION_DOMAIN_WARNINGS = [
  'markerNotFound',
  'markerTooSmall',
  'steepAngle',
  'lowLight',
  'blurry',
  'boxOutOfFrame',
  'unstable',
] as const
export type BoxDimensionDomainWarning = (typeof BOX_DIMENSION_DOMAIN_WARNINGS)[number]

/**
 * Motivo interno do motor, útil ao indicador ao vivo e fora do domínio gravável: a validação (T15)
 * decide se ele entra no enum da API.
 */
export const BOX_DIMENSION_INTERNAL_WARNINGS = ['markerAtEdge'] as const
export type BoxDimensionInternalWarning = (typeof BOX_DIMENSION_INTERNAL_WARNINGS)[number]

export const BOX_DIMENSION_WARNINGS = [
  ...BOX_DIMENSION_DOMAIN_WARNINGS,
  ...BOX_DIMENSION_INTERNAL_WARNINGS,
] as const
export type BoxDimensionWarning = BoxDimensionDomainWarning | BoxDimensionInternalWarning

export const BOX_DIMENSION_KEYS = ['length', 'width', 'height'] as const
export type BoxDimensionKey = (typeof BOX_DIMENSION_KEYS)[number]
