/* Copyright (c) 2026 Ada Technology. MIT License. */

/** D8: cópia por valor de `PACKAGE_BOX_MEASUREMENT_SOURCES` (API) — origem gravada com a medida. */
export const PACKAGE_BOX_MEASUREMENT_SOURCES = ['typed', 'camera', 'camera_adjusted'] as const
export type PackageBoxMeasurementSource = (typeof PACKAGE_BOX_MEASUREMENT_SOURCES)[number]

export type PackageBox = Readonly<{
  cartonGtin: null | string
  commercialUnit: string
  cumulativeShare: number
  description: string
  emitterTaxId: string
  grossWeightGrams: null | number
  heightMm: null | number
  id: string
  lengthMm: null | number
  measuredAt: null | string
  /** Spec 152 (D8, experimental): `null` em toda caixa medida antes desta spec. */
  measurementMarginMm: null | number
  measurementSource: null | PackageBoxMeasurementSource
  productCode: string
  share: number
  transportedVolumes: number
  unitsPerBox: number
  widthMm: null | number
  /** Até onde medir compensa: a linha fora da cobertura custa o mesmo e move quase nada. */
  withinCoverage: boolean
}>

/** As três situações da fila. `pending` é o padrão: ela existe para dizer o que medir agora. */
export const PACKAGE_BOX_STATUS_FILTERS = ['pending', 'measured', 'all'] as const

export type PackageBoxStatusFilter = (typeof PACKAGE_BOX_STATUS_FILTERS)[number]

export type PackageBoxQueue = Readonly<{
  coveredCount: number
  items: readonly PackageBox[]
  totalVolumes: number
}>

/**
 * D17: a proposta da câmera guardada por auditoria. `.strict()` do lado da API — campo a mais é
 * recusa, não silêncio (mesma razão do `cameraMeasurementSchema`). Margens ausentes numa dimensão
 * dizem "essa dimensão foi editada por cima" (D6): a regra de imprecisão não se aplica a ela.
 */
export type PackageBoxCameraMeasurementInput = Readonly<{
  engine: string
  heightMarginMm?: number
  impreciseConfirmed: boolean
  lengthMarginMm?: number
  proposedHeightMm?: number
  proposedLengthMm?: number
  proposedWidthMm?: number
  warnings: readonly string[]
  widthMarginMm?: number
}>

export type PackageBoxMeasurementInput = Readonly<{
  /** Só presente quando `source` é `camera`/`camera_adjusted` (R5). */
  camera?: PackageBoxCameraMeasurementInput
  grossWeightGrams: null | number
  heightMm: number
  id: string
  lengthMm: number
  /** D8: ausente grava `typed` (retrocompatível) — o corpo antigo continua válido. */
  source?: PackageBoxMeasurementSource
  /** Quantas unidades comerciais a caixa leva; `1` quando `uCom` já é a embalagem. */
  unitsPerBox: number
  widthMm: number
}>

type ClientDependencies = Readonly<{
  apiUrl: string
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  getAccessToken: () => Promise<string>
}>

export type PackageBoxClient = Readonly<{
  listBoxes: (
    input?: Readonly<{ scanned?: string; search?: string; status?: PackageBoxStatusFilter }>,
  ) => Promise<PackageBoxQueue>
  /** Spec 152 D14: leitura própria de `cargo.measure`, sem exigir `settings.manage`. */
  getMeasurementSettings: () => Promise<Readonly<{ cameraMeasurementEnabled: boolean }>>
  /** Grava e não devolve nada: a linha gravada não é a linha da fila, e quem recarrega é a query. */
  measureBox: (input: PackageBoxMeasurementInput) => Promise<void>
}>

const PACKAGE_BOXES_PATH = '/nfe-package-boxes'

export function createPackageBoxClient(dependencies: ClientDependencies): PackageBoxClient {
  /**
   * ⚠️ `content-type` **só onde há corpo**. Num `GET` ele não descreve nada, e o CORS da API só
   * admite `Authorization` em método sem corpo (`BODYLESS_METHODS` em `cors.service.ts`): mandá-lo
   * fazia o navegador pedir `authorization,content-type` no preflight e receber **403**, com a fila
   * inteira sumindo da tela. Nenhum teste desta app pega isso — o preflight só existe no navegador.
   */
  async function authorization(): Promise<string> {
    return `Bearer ${await dependencies.getAccessToken()}`
  }

  return {
    async listBoxes(input): Promise<PackageBoxQueue> {
      const url = new URL(`${dependencies.apiUrl}${PACKAGE_BOXES_PATH}`)
      if (input?.search) url.searchParams.set('search', input.search)
      /** A etiqueta vai crua: reduzir DUN-14 a GTIN-13 é decisão da API, não da tela. */
      if (input?.scanned) url.searchParams.set('scanned', input.scanned)
      if (input?.status !== undefined) url.searchParams.set('status', input.status)

      const response = await dependencies.fetch(url, {
        headers: { authorization: await authorization() },
      })
      if (!response.ok) throw new Error('PACKAGE_BOX_LIST_FAILED')
      return packageBoxQueueFromApi(await response.json())
    },
    async getMeasurementSettings(): Promise<Readonly<{ cameraMeasurementEnabled: boolean }>> {
      const response = await dependencies.fetch(
        `${dependencies.apiUrl}${PACKAGE_BOXES_PATH}/measurement-settings`,
        { headers: { authorization: await authorization() } },
      )
      if (!response.ok) throw new Error('PACKAGE_BOX_MEASUREMENT_SETTINGS_FAILED')
      const body: unknown = await response.json()
      if (!isRecord(body) || !isRecord(body.data)) {
        throw new Error('PACKAGE_BOX_MEASUREMENT_SETTINGS_MALFORMED')
      }
      return { cameraMeasurementEnabled: body.data.cameraMeasurementEnabled === true }
    },
    async measureBox(input): Promise<void> {
      const { id, ...measurement } = input
      const response = await dependencies.fetch(
        `${dependencies.apiUrl}${PACKAGE_BOXES_PATH}/${id}`,
        {
          body: JSON.stringify(measurement),
          headers: { authorization: await authorization(), 'content-type': 'application/json' },
          method: 'PUT',
        },
      )
      if (!response.ok) throw new Error('PACKAGE_BOX_MEASURE_FAILED')
    },
  }
}

/**
 * ⚠️ Corpo que não é a fila **lança**, nunca vira lista vazia: fila vazia diz "não há o que medir",
 * e dizer isso para uma resposta que não entendemos manda o conferente embora sem trabalho.
 */
export function packageBoxQueueFromApi(body: unknown): PackageBoxQueue {
  if (!isRecord(body) || !isRecord(body.data)) throw new Error('PACKAGE_BOX_MALFORMED')
  const { coveredCount, items, totalVolumes } = body.data
  if (!Array.isArray(items) || !items.every(isPackageBox)) throw new Error('PACKAGE_BOX_MALFORMED')
  return {
    coveredCount: isNumber(coveredCount) ? coveredCount : 0,
    items,
    totalVolumes: isNumber(totalVolumes) ? totalVolumes : 0,
  }
}

function isPackageBox(value: unknown): value is PackageBox {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.productCode === 'string' &&
    typeof value.commercialUnit === 'string' &&
    typeof value.description === 'string' &&
    typeof value.emitterTaxId === 'string' &&
    isNullableString(value.cartonGtin) &&
    isNullableString(value.measuredAt) &&
    isNullableNumber(value.lengthMm) &&
    isNullableNumber(value.widthMm) &&
    isNullableNumber(value.heightMm) &&
    isNullableNumber(value.grossWeightGrams) &&
    isNumber(value.transportedVolumes) &&
    isNumber(value.unitsPerBox) &&
    isNumber(value.share) &&
    isNumber(value.cumulativeShare) &&
    typeof value.withinCoverage === 'boolean' &&
    isNullableMeasurementSource(value.measurementSource) &&
    isNullableNumber(value.measurementMarginMm)
  )
}

function isNullableMeasurementSource(value: unknown): value is null | PackageBoxMeasurementSource {
  return (
    value === null ||
    (typeof value === 'string' &&
      PACKAGE_BOX_MEASUREMENT_SOURCES.some((source) => source === value))
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNullableNumber(value: unknown): value is null | number {
  return value === null || isNumber(value)
}

function isNullableString(value: unknown): value is null | string {
  return value === null || typeof value === 'string'
}
