/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Cópia por valor de `PackageBoxMeasurementSource` (API/`packageBoxClient.service.ts`, D8). */
export type CameraMeasurementExportSource = 'camera' | 'camera_adjusted' | 'typed'

/**
 * Uma linha do histórico exportado por `GET /nfe-package-box-measurements` (T5, `settings.manage`).
 * Só os campos que a T12 precisa para o resumo e o CSV — nunca a descrição do produto nem o CNPJ do
 * emitente (R8).
 */
export type CameraMeasurementExportEntry = Readonly<{
  cartonGtin: null | string
  createdAt: string
  heightMarginMm: null | number
  heightMm: number
  id: string
  lengthMarginMm: null | number
  lengthMm: number
  productCode: string
  proposedHeightMm: null | number
  proposedLengthMm: null | number
  proposedWidthMm: null | number
  source: CameraMeasurementExportSource
  warnings: readonly string[]
  widthMarginMm: null | number
  widthMm: number
}>

type DimensionReading = Readonly<{
  errorMm: number
  marginMm: null | number
}>

type DimensionCandidate = Readonly<{
  marginMm: null | number
  proposedMm: null | number
  recordedMm: number
}>

function toReading(candidate: DimensionCandidate): DimensionReading | undefined {
  if (candidate.proposedMm === null) return undefined
  return {
    errorMm: Math.abs(candidate.proposedMm - candidate.recordedMm),
    marginMm: candidate.marginMm,
  }
}

/**
 * D17: a proposta some do bloco `camera` quando o operador edita a dimensão (T10), mas o valor
 * proposto continua indo para a API mesmo depois de editado — por isso `proposedXxxMm` é a única
 * fonte de "houve leitura da câmera" aqui, e a margem some junto (`marginMm: null`) exatamente nas
 * dimensões editadas.
 */
function readingsOf(entry: CameraMeasurementExportEntry): readonly DimensionReading[] {
  if (entry.source === 'typed') return []
  const candidates: readonly DimensionCandidate[] = [
    {
      marginMm: entry.lengthMarginMm,
      proposedMm: entry.proposedLengthMm,
      recordedMm: entry.lengthMm,
    },
    { marginMm: entry.widthMarginMm, proposedMm: entry.proposedWidthMm, recordedMm: entry.widthMm },
    {
      marginMm: entry.heightMarginMm,
      proposedMm: entry.proposedHeightMm,
      recordedMm: entry.heightMm,
    },
  ]
  return candidates
    .map(toReading)
    .filter((reading): reading is DimensionReading => reading !== undefined)
}

function hasKnownMargin(
  reading: DimensionReading,
): reading is DimensionReading & { marginMm: number } {
  return reading.marginMm !== null
}

export type CameraMeasurementValidationVerdict = 'go' | 'insufficient-data' | 'no-go'

/** R6: as duas fronteiras que decidem o selo — apertar pode, afrouxar exige o ok do usuário (T15). */
export const VALIDATION_WITHIN_TEN_MILLIMETRE_TARGET_RATE = 0.8
export const VALIDATION_WITHIN_MARGIN_TARGET_RATE = 0.9

export type CameraMeasurementValidationSummary = Readonly<{
  readingCount: number
  verdict: CameraMeasurementValidationVerdict
  withinMarginCount: number
  withinMarginKnownCount: number
  withinMarginRate: null | number
  withinTenMillimetreCount: number
  withinTenMillimetreRate: null | number
}>

function resolveVerdict(
  withinTenMillimetreRate: null | number,
  withinMarginRate: null | number,
): CameraMeasurementValidationVerdict {
  if (withinTenMillimetreRate === null || withinMarginRate === null) return 'insufficient-data'
  const meetsTenMillimetreTarget =
    withinTenMillimetreRate >= VALIDATION_WITHIN_TEN_MILLIMETRE_TARGET_RATE
  const meetsMarginTarget = withinMarginRate >= VALIDATION_WITHIN_MARGIN_TARGET_RATE
  return meetsTenMillimetreTarget && meetsMarginTarget ? 'go' : 'no-go'
}

/**
 * Spec 152 R6/T15: porta o `session.ts` do spike para o formato real do histórico (T5). "Fita" é o
 * valor GRAVADO de cada dimensão — só é a medida da fita de verdade quando o protocolo de D16 foi
 * seguido (digitar por cima de toda dimensão depois de ver a proposta, mesmo quando ela bate). Como
 * editar uma dimensão apaga a margem daquela dimensão no histórico (T10), a taxa "dentro da margem"
 * só conta as leituras com margem gravada (`withinMarginKnownCount`) — dimensões editadas (o caso
 * comum da sessão real de validação) entram na taxa de 10 mm mas ficam fora da taxa de margem. A
 * tela mostra as duas contagens lado a lado, nunca uma taxa que finge cobrir tudo.
 */
export function summarizeCameraMeasurementValidation(
  entries: readonly CameraMeasurementExportEntry[],
): CameraMeasurementValidationSummary {
  const readings = entries.flatMap(readingsOf)
  const withinTenMillimetreCount = readings.filter((reading) => reading.errorMm <= 10).length
  const marginKnown = readings.filter(hasKnownMargin)
  const withinMarginCount = marginKnown.filter(
    (reading) => reading.errorMm <= reading.marginMm,
  ).length

  const withinTenMillimetreRate =
    readings.length === 0 ? null : withinTenMillimetreCount / readings.length
  const withinMarginRate = marginKnown.length === 0 ? null : withinMarginCount / marginKnown.length

  return {
    readingCount: readings.length,
    verdict: resolveVerdict(withinTenMillimetreRate, withinMarginRate),
    withinMarginCount,
    withinMarginKnownCount: marginKnown.length,
    withinMarginRate,
    withinTenMillimetreCount,
    withinTenMillimetreRate,
  }
}
