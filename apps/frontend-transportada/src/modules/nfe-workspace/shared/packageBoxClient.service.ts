/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  PACKAGE_BOX_REPLICATE_FAILED_CODE,
  PACKAGE_BOX_SIBLINGS_MALFORMED_CODE,
} from './nfeWorkspace.constant'

/**
 * D8: cópia por valor de `PACKAGE_BOX_MEASUREMENT_SOURCES` (API) — origem gravada com a medida.
 * Spec 155 (D6): `replicated` — a caixa nunca foi medida, a dimensão veio de uma irmã da família.
 */
export const PACKAGE_BOX_MEASUREMENT_SOURCES = [
  'typed',
  'camera',
  'camera_adjusted',
  'replicated',
] as const
export type PackageBoxMeasurementSource = (typeof PACKAGE_BOX_MEASUREMENT_SOURCES)[number]

/**
 * D6, T14 (revisão final, BAIXO): cópia por valor de `PACKAGE_BOX_MEASURED_SOURCES` (API,
 * `nfe-documents/domain/package-box-measurement.constant.ts`) — `replicated` só a rota de
 * replicar grava; o corpo que o formulário digitado/câmera monta nunca o aceita.
 */
export const PACKAGE_BOX_MEASURED_SOURCES = ['typed', 'camera', 'camera_adjusted'] as const
export type PackageBoxMeasuredSource = (typeof PACKAGE_BOX_MEASURED_SOURCES)[number]

export type PackageBox = Readonly<{
  cartonGtin: null | string
  commercialUnit: string
  cumulativeShare: number
  description: string
  emitterTaxId: string
  /** Spec 155 (D2, D9): `undefined` quando a caixa não tem família — sem rótulo ou prefixo curto. */
  familyKey: string | undefined
  familyMeasuredCount: number
  familyPendingCount: number
  grossWeightGrams: null | number
  heightMm: null | number
  id: string
  lengthMm: null | number
  measuredAt: null | string
  /** Spec 152 (D8, experimental): `null` em toda caixa medida antes desta spec. */
  measurementMarginMm: null | number
  measurementSource: null | PackageBoxMeasurementSource
  /** Spec 155 (D3, D8): quantas outras embalagens o mesmo `cProd` tem — nunca conta como família. */
  packagingSiblingCount: number
  /** O sufixo numérico da unidade (`CX36` → 36); `undefined` quando ela não termina em número. */
  packagingUnitCount: number | undefined
  productCode: string
  share: number
  transportedVolumes: number
  unitsPerBox: number
  /** Spec 155 (D2): o que resta da descrição depois do prefixo — string vazia sem família. */
  variantLabel: string
  widthMm: null | number
  /** Até onde medir compensa: a linha fora da cobertura custa o mesmo e move quase nada. */
  withinCoverage: boolean
}>

/**
 * Spec 155 (G003): uma irmã da família ou do grupo de embalagem — nunca a caixa de origem. D11
 * corolário: quem confirma escrita mostra `description` + `productCode`, nunca só o `variantLabel`.
 */
export type PackageBoxSibling = Readonly<{
  commercialUnit: string
  description: string
  grossWeightGrams: null | number
  heightMm: null | number
  id: string
  lengthMm: null | number
  measuredAt: null | string
  packagingUnitCount: number | undefined
  productCode: string
  unitsPerBox: number
  variantLabel: string
  widthMm: null | number
}>

export type PackageBoxSiblings = Readonly<{
  family: readonly PackageBoxSibling[]
  /** D11/G011: a tela abre o diálogo com os alvos desmarcados e diz por quê. */
  isLowConfidenceFamily: boolean
  /** O rótulo da própria caixa: entra no cabeçalho do diálogo de replicar. */
  originVariantLabel: string
  packaging: readonly PackageBoxSibling[]
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
  source?: PackageBoxMeasuredSource
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
  /** Spec 155 (G003, D9): sob demanda — nunca acompanha a fila de 50 linhas. */
  listSiblings: (input: Readonly<{ boxId: string }>) => Promise<PackageBoxSiblings>
  /** Grava e não devolve nada: a linha gravada não é a linha da fila, e quem recarrega é a query. */
  measureBox: (input: PackageBoxMeasurementInput) => Promise<void>
  /** Spec 155 (G004, G005, G006, D4, D6): copia a medida da origem para os alvos escolhidos. */
  replicate: (
    input: Readonly<{ boxId: string; targetIds: readonly string[] }>,
  ) => Promise<Readonly<{ replicatedCount: number }>>
}>

const PACKAGE_BOXES_PATH = '/nfe-package-boxes'

/**
 * ⚠️ **`new Error('...')` cru apagava o motivo da recusa.** A tela precisa distinguir o `422`
 * `PACKAGE_BOX_CAMERA_MEASUREMENT_DISABLED` (a função foi desligada na empresa com a aba aberta) do
 * `400` de corpo recusado — dizer só "não foi possível gravar" manda o conferente tentar de novo
 * para sempre. O código vem do envelope da API (`{ error: { code } }`) e só cai no genérico quando a
 * resposta não tem um.
 */
export class PackageBoxRequestError extends Error {
  public readonly code: string
  public readonly status: number | undefined

  public constructor(input: Readonly<{ code: string; status?: number | undefined }>) {
    super(input.code)
    this.code = input.code
    this.name = 'PackageBoxRequestError'
    this.status = input.status
  }
}

/** `undefined` quando a falha não é da API (rede caiu, resposta ilegível) — não invente código. */
export function packageBoxErrorCode(error: unknown): string | undefined {
  return error instanceof PackageBoxRequestError ? error.code : undefined
}

async function rejectionOf(response: Response, fallbackCode: string): Promise<never> {
  const body: unknown = await response.json().catch(() => undefined)
  const envelope = isRecord(body) && isRecord(body.error) ? body.error : undefined
  const code = typeof envelope?.code === 'string' ? envelope.code : fallbackCode
  throw new PackageBoxRequestError({ code, status: response.status })
}

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
      if (!response.ok) await rejectionOf(response, 'PACKAGE_BOX_LIST_FAILED')
      return packageBoxQueueFromApi(await response.json())
    },
    async getMeasurementSettings(): Promise<Readonly<{ cameraMeasurementEnabled: boolean }>> {
      const response = await dependencies.fetch(
        `${dependencies.apiUrl}${PACKAGE_BOXES_PATH}/measurement-settings`,
        { headers: { authorization: await authorization() } },
      )
      if (!response.ok) await rejectionOf(response, 'PACKAGE_BOX_MEASUREMENT_SETTINGS_FAILED')
      const body: unknown = await response.json()
      if (!isRecord(body) || !isRecord(body.data)) {
        throw new PackageBoxRequestError({ code: 'PACKAGE_BOX_MEASUREMENT_SETTINGS_MALFORMED' })
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
      if (!response.ok) await rejectionOf(response, 'PACKAGE_BOX_MEASURE_FAILED')
    },
    async listSiblings(input): Promise<PackageBoxSiblings> {
      const response = await dependencies.fetch(
        `${dependencies.apiUrl}${PACKAGE_BOXES_PATH}/${input.boxId}/siblings`,
        { headers: { authorization: await authorization() } },
      )
      if (!response.ok) await rejectionOf(response, 'PACKAGE_BOX_SIBLINGS_FAILED')
      return packageBoxSiblingsFromApi(await response.json())
    },
    async replicate(input): Promise<Readonly<{ replicatedCount: number }>> {
      const response = await dependencies.fetch(
        `${dependencies.apiUrl}${PACKAGE_BOXES_PATH}/${input.boxId}/replicate`,
        {
          body: JSON.stringify({ targetIds: input.targetIds }),
          headers: { authorization: await authorization(), 'content-type': 'application/json' },
          method: 'POST',
        },
      )
      if (!response.ok) await rejectionOf(response, PACKAGE_BOX_REPLICATE_FAILED_CODE)
      const body: unknown = await response.json()
      if (!isRecord(body) || !isRecord(body.data) || !isNumber(body.data.replicatedCount)) {
        throw new PackageBoxRequestError({ code: 'PACKAGE_BOX_REPLICATE_MALFORMED' })
      }
      return { replicatedCount: body.data.replicatedCount }
    },
  }
}

/**
 * ⚠️ Corpo que não é a fila **lança**, nunca vira lista vazia: fila vazia diz "não há o que medir",
 * e dizer isso para uma resposta que não entendemos manda o conferente embora sem trabalho.
 */
export function packageBoxQueueFromApi(body: unknown): PackageBoxQueue {
  if (!isRecord(body) || !isRecord(body.data))
    throw new PackageBoxRequestError({ code: 'PACKAGE_BOX_MALFORMED' })
  const { coveredCount, items, totalVolumes } = body.data
  if (!Array.isArray(items) || !items.every(isPackageBox))
    throw new PackageBoxRequestError({ code: 'PACKAGE_BOX_MALFORMED' })
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
    isNullableNumber(value.measurementMarginMm) &&
    isOptionalString(value.familyKey) &&
    isNumber(value.familyPendingCount) &&
    isNumber(value.familyMeasuredCount) &&
    isNumber(value.packagingSiblingCount) &&
    isOptionalNumber(value.packagingUnitCount) &&
    typeof value.variantLabel === 'string'
  )
}

/**
 * ⚠️ Corpo que não são as irmãs **lança**, nunca vira lista vazia — mesma razão de
 * `packageBoxQueueFromApi`: silêncio aqui abriria o diálogo de replicar sem alvo nenhum.
 */
function packageBoxSiblingsFromApi(body: unknown): PackageBoxSiblings {
  if (!isRecord(body) || !isRecord(body.data))
    throw new PackageBoxRequestError({ code: PACKAGE_BOX_SIBLINGS_MALFORMED_CODE })
  const { family, isLowConfidenceFamily, originVariantLabel, packaging } = body.data
  if (
    !Array.isArray(family) ||
    !family.every(isPackageBoxSibling) ||
    !Array.isArray(packaging) ||
    !packaging.every(isPackageBoxSibling) ||
    typeof originVariantLabel !== 'string' ||
    typeof isLowConfidenceFamily !== 'boolean'
  ) {
    throw new PackageBoxRequestError({ code: PACKAGE_BOX_SIBLINGS_MALFORMED_CODE })
  }
  return { family, isLowConfidenceFamily, originVariantLabel, packaging }
}

function isPackageBoxSibling(value: unknown): value is PackageBoxSibling {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.commercialUnit === 'string' &&
    typeof value.description === 'string' &&
    typeof value.productCode === 'string' &&
    typeof value.variantLabel === 'string' &&
    isNullableString(value.measuredAt) &&
    isNullableNumber(value.lengthMm) &&
    isNullableNumber(value.widthMm) &&
    isNullableNumber(value.heightMm) &&
    isNullableNumber(value.grossWeightGrams) &&
    isNumber(value.unitsPerBox) &&
    isOptionalNumber(value.packagingUnitCount)
  )
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === 'string'
}

function isOptionalNumber(value: unknown): value is number | undefined {
  return value === undefined || isNumber(value)
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
