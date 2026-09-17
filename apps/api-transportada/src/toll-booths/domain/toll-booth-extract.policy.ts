/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, D10/RF3b — o extrato do catálogo é registrado em tabela, nunca descoberto no bucket
 * (`@adatechnology/object-storage-provider` não tem `list`). `buildExtractObjectKey` é a única
 * fonte da chave do objeto: ela aparece no upload, na recarga (T302) e no runbook, e o CHECK
 * `toll_booth_extracts_object_key_check` da migration (T101) exige exatamente esta forma.
 */
const OBJECT_KEY_PREFIX = 'toll-booths/osm'
const OBJECT_KEY_FILENAME = 'toll-booths.json'

export type TollBoothExtractRow = Readonly<{
  boothCount: number
  boothsWithAxleCharge: number
  boothsWithCharge: number
  dataset: string
  missingObjectObservedAt: Date | null
  objectKey: string
  observedOn: string
  reloadedAt: Date | null
  reloadedBoothCount: number | null
  reloadedByUserId: string | null
  sha256: string
  uploadedByUserId: string
}>

/**
 * Uma linha do extrato, na forma em que o extrator (`scripts/toll-booth-extract.ts`) escreve o
 * JSON — todos os valores em texto, `osmNodeId` incluso (RNF5, e T001 mediu a forma real).
 */
export type TollBoothExtractRowInput = Readonly<{
  chargeCar: null | string
  chargePerAxle: null | string
  latitude: string
  longitude: string
  name: null | string
  operator: null | string
  osmNodeId: string
}>

export function buildExtractObjectKey(input: {
  readonly dataset: string
  readonly observedOn: string
}): string {
  return `${OBJECT_KEY_PREFIX}/${input.dataset}/${input.observedOn}/${OBJECT_KEY_FILENAME}`
}

export type TollBoothExtractCounts = Readonly<{
  boothCount: number
  boothsWithAxleCharge: number
  boothsWithCharge: number
}>

/**
 * `boothsWithCharge`/`boothsWithAxleCharge` espelham o manifesto medido no T001
 * (`withCharge`/`withChargePerAxle`) — ter tarifa por eixo implica ter tarifa (CHECK da T101).
 */
export function summarizeTollBoothExtract(
  rows: readonly TollBoothExtractRowInput[],
): TollBoothExtractCounts {
  let boothsWithCharge = 0
  let boothsWithAxleCharge = 0

  for (const row of rows) {
    if (row.chargeCar !== null) boothsWithCharge += 1
    else if (row.chargePerAxle !== null) boothsWithCharge += 1
    if (row.chargePerAxle !== null) boothsWithAxleCharge += 1
  }

  return { boothCount: rows.length, boothsWithAxleCharge, boothsWithCharge }
}
