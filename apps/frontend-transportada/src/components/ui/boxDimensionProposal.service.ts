/* Copyright (c) 2026 Ada Technology. MIT License. */
import { MEASUREMENT_ENGINE, type BoxDimensionDomainWarning } from './boxDimension.constant'
import {
  classifyMeasurement,
  type BoxMargins,
  type BoxMeasurementResult,
} from './boxDimension.service'

/** `0` em qualquer dimensão é o sentinela de "a câmera não leu esta" (D6, margem acima de 30 mm). */
export type BoxDimensionMeasuredResult = Readonly<{
  engine: typeof MEASUREMENT_ENGINE
  heightMarginMm: number
  heightMm: number
  lengthMarginMm: number
  lengthMm: number
  warnings: readonly BoxDimensionDomainWarning[]
  widthMarginMm: number
  widthMm: number
}>

export type BuildMeasuredProposalParams = Readonly<{
  margins: BoxMargins
  nominal: BoxMeasurementResult
  warnings: readonly BoxDimensionDomainWarning[]
}>

/**
 * O ponto **único** onde a proposta da câmera nasce (`confirmMeasurement` a chama, e mais ninguém).
 *
 * ⚠️ **Arredonda as seis grandezas aqui, e classifica depois.** O motor mede em `float`
 * (`598.7 mm`, margem `6.8 mm`) e o schema da API exige `z.number().int()` — sem isto nenhuma
 * gravação pela câmera passava do `400`, e 10.074 asserções verdes não viram porque nenhuma pegava
 * o corpo montado e o passava pelo schema real (contrato de fronteira da T14). Classificar depois
 * do arredondamento é o que mantém a tela e a API contando a mesma história: com margem `30,4` a
 * tela deixaria o campo vazio (`unreliable`) enquanto a API leria `30` e cobraria confirmação de um
 * valor que a câmera nunca propôs.
 */
export function buildMeasuredProposal(
  params: BuildMeasuredProposalParams,
): BoxDimensionMeasuredResult {
  const margins: BoxMargins = {
    heightMarginMm: Math.round(params.margins.heightMarginMm),
    lengthMarginMm: Math.round(params.margins.lengthMarginMm),
    widthMarginMm: Math.round(params.margins.widthMarginMm),
  }
  const filled = classifyMeasurement(margins).filled
  return {
    engine: MEASUREMENT_ENGINE,
    heightMarginMm: margins.heightMarginMm,
    heightMm: filled.height ? Math.round(params.nominal.heightMm) : 0,
    lengthMarginMm: margins.lengthMarginMm,
    lengthMm: filled.length ? Math.round(params.nominal.lengthMm) : 0,
    warnings: params.warnings,
    widthMarginMm: margins.widthMarginMm,
    widthMm: filled.width ? Math.round(params.nominal.widthMm) : 0,
  }
}
