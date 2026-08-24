/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A fonte publica o histórico inteiro, e mais de uma linha pode cobrir o mesmo dia: em 21/08/2026,
 * Ceraçá e CEA tinham duas vigências abertas cada. Quem vence é o início mais recente que cobre o
 * dia — a retificação é publicada depois, com o mesmo fim. Linha torta é descartada e contada, não
 * fatal: uma sigla de sucata não pode custar as outras cem distribuidoras do ciclo.
 */
import {
  ANEEL_DISTRIBUTOR_TAX_ID_PATTERN,
  ANEEL_TARIFF_MODALITY,
  ANEEL_TARIFF_SUBGROUP,
  ANEEL_TARIFF_UNIT,
  ANEEL_UNKNOWN_DISTRIBUTOR_CODE,
} from './aneel-tariff.constant.js'
import { readCommaDecimal } from './decimal-cell.policy.js'

export type AneelTariffRow = Readonly<Record<string, string | null | undefined>>

export type EnergyTariffRecord = {
  readonly distributorCode: string
  readonly distributorTaxId: string
  readonly effectiveFrom: string
  readonly effectiveTo: string
  readonly modality: string
  readonly subgroup: string
  readonly tePerMegawattHour: string
  readonly tusdPerMegawattHour: string
}

export type EnergyTariffSelection = {
  readonly discardedRows: number
  readonly tariffs: readonly EnergyTariffRecord[]
}

const ISO_DAY_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/

function readDay(value: string | null | undefined): string | undefined {
  const text = (value ?? '').trim().slice(0, 10)

  return ISO_DAY_PATTERN.test(text) ? text : undefined
}

/**
 * A sigla vem em caixa mista em sete distribuidoras (`Ceraçá`, `Neoenergia PE`, …). Sem uma grafia
 * só, a mesma concessionária viraria duas linhas e a escolha da empresa apontaria para a que não
 * foi coletada nesta semana.
 */
function readDistributorCode(value: string | null | undefined): string | undefined {
  const code = (value ?? '').trim().toUpperCase()

  return code.length > 0 && code !== ANEEL_UNKNOWN_DISTRIBUTOR_CODE ? code : undefined
}

function readAmount(value: string | null | undefined): string | undefined {
  try {
    return readCommaDecimal({ text: value ?? '' })
  } catch {
    return undefined
  }
}

/** Escala fixa dos dois lados, então o dígito basta: `Number` traria ruído binário para dinheiro. */
function isPositivePair(input: { readonly te: string; readonly tusd: string }): boolean {
  return BigInt(input.te.replace('.', '')) + BigInt(input.tusd.replace('.', '')) > 0n
}

function toRecord(row: AneelTariffRow): EnergyTariffRecord | undefined {
  const distributorCode = readDistributorCode(row['SigAgente'])
  const distributorTaxId = (row['NumCNPJDistribuidora'] ?? '').trim().toUpperCase()
  const effectiveFrom = readDay(row['DatInicioVigencia'])
  const effectiveTo = readDay(row['DatFimVigencia'])
  const tePerMegawattHour = readAmount(row['VlrTE'])
  const tusdPerMegawattHour = readAmount(row['VlrTUSD'])

  if (
    distributorCode === undefined ||
    !ANEEL_DISTRIBUTOR_TAX_ID_PATTERN.test(distributorTaxId) ||
    effectiveFrom === undefined ||
    effectiveTo === undefined ||
    effectiveTo < effectiveFrom ||
    tePerMegawattHour === undefined ||
    tusdPerMegawattHour === undefined ||
    (row['DscUnidadeTerciaria'] ?? '').trim() !== ANEEL_TARIFF_UNIT ||
    !isPositivePair({ te: tePerMegawattHour, tusd: tusdPerMegawattHour })
  ) {
    return undefined
  }

  return {
    distributorCode,
    distributorTaxId,
    effectiveFrom,
    effectiveTo,
    modality: ANEEL_TARIFF_MODALITY,
    subgroup: ANEEL_TARIFF_SUBGROUP,
    tePerMegawattHour,
    tusdPerMegawattHour,
  }
}

export function selectCurrentTariffs(input: {
  readonly onDay: string
  readonly rows: readonly AneelTariffRow[]
}): EnergyTariffSelection {
  const latestByDistributor = new Map<string, EnergyTariffRecord>()
  let discardedRows = 0

  for (const row of input.rows) {
    const record = toRecord(row)

    if (record === undefined) {
      discardedRows += 1
      continue
    }

    if (record.effectiveFrom > input.onDay || record.effectiveTo < input.onDay) {
      continue
    }

    const current = latestByDistributor.get(record.distributorCode)

    if (current === undefined || record.effectiveFrom > current.effectiveFrom) {
      latestByDistributor.set(record.distributorCode, record)
    }
  }

  return { discardedRows, tariffs: [...latestByDistributor.values()] }
}
