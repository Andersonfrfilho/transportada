/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/** A forma impressa na coluna NUM ROTA: família, ponto, três dígitos. */
export const REGION_CODE_PATTERN = /^([0-9])\.(00[0-3])$/
const WHITESPACE_PATTERN = /\s+/g

/** Família `0` é a matriz — saída, não zona. Por isso ela não entra na contagem acumulativa. */
const HEAD_OFFICE_FAMILY = '0'
const HEAD_OFFICE_ZONE = 0

export type RegionCode = {
  readonly family: string
  readonly zone: number
}

export type CoversRegionInput = {
  readonly candidate: string
  readonly coverage: string
}

/**
 * Código fora da forma impressa é linha de importação errada. Recusar aqui é o que impede uma zona
 * chutada entrar no cadastro e passar a valer como preço.
 */
export function parseRegionCode(code: string): RegionCode {
  const match = REGION_CODE_PATTERN.exec(code)
  if (match === null) {
    throw new ApiError({
      code: 'FREIGHT_REGION_CODE_INVALID',
      message: 'Region code must use the printed form (family, dot, three digits)',
      status: 400,
    })
  }

  const [, family, sequence] = match as unknown as readonly [string, string, string]

  return {
    family,
    zone: family === HEAD_OFFICE_FAMILY ? HEAD_OFFICE_ZONE : Number(sequence) + 1,
  }
}

/**
 * A coluna OBSERVAÇÃO do PDF diz "Todas da Zona 1, 2, mais Zona 3": quem cobre a zona 3 cobre as
 * abaixo. A redundância não é guardada — repetir as cidades da zona 1 dentro da zona 3 faria a
 * mesma cidade nascer em quatro linhas da família, e um preço só valeria. Cada cidade nasce na zona
 * própria e a cobertura é resolvida aqui.
 */
export function coversRegion(input: CoversRegionInput): boolean {
  const candidate = parseRegionCode(input.candidate)
  const coverage = parseRegionCode(input.coverage)

  if (candidate.family !== coverage.family) return false
  return candidate.zone <= coverage.zone
}

/** Dobra única de nome de cidade: "Matão", "MATÃO" e "  matão " são a mesma cidade. */
export function normalizeRegionCity(value: string): string {
  return value.trim().toUpperCase().replace(WHITESPACE_PATTERN, ' ')
}
