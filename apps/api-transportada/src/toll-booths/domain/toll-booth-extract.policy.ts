/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 154, D10/RF3b — o extrato do catálogo é registrado em tabela, nunca descoberto no bucket
 * (`@adatechnology/object-storage-provider` não tem `list`). `buildExtractObjectKey` é a única
 * fonte da chave do objeto: ela aparece no upload, na recarga (T302) e no runbook, e o CHECK
 * `toll_booth_extracts_object_key_check` da migration (T101) exige exatamente esta forma.
 */
import type { TollBoothSeedRecord } from '../application/toll-booth.port.js'

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

/** A praça do JSON com `osmNodeId` ainda em texto ou já `bigint` — a CLI aceita os dois. */
export type TollBoothExtractSeedInput = Omit<TollBoothExtractRowInput, 'osmNodeId'> &
  Readonly<{ osmNodeId: bigint | string }>

/**
 * O extrato vira entrada do seed com **uma** data para todas as praças: a do extrato, nunca a de
 * hoje (`toll-booth.schema.ts`). Usada pela CLI (`toll-booth-seed.service.ts`) e pela recarga (T302).
 */
export function toTollBoothSeedRecords(input: {
  readonly booths: readonly TollBoothExtractSeedInput[]
  readonly observedOn: string
}): readonly TollBoothSeedRecord[] {
  return input.booths.map((booth) => ({
    chargeCar: booth.chargeCar,
    chargePerAxle: booth.chargePerAxle,
    latitude: booth.latitude,
    longitude: booth.longitude,
    name: booth.name,
    observedOn: input.observedOn,
    operator: booth.operator,
    osmNodeId: BigInt(booth.osmNodeId),
  }))
}

/** Nó repetido no mesmo extrato faria o upsert em lote falhar (`ON CONFLICT` duas vezes na mesma linha). */
export function hasRepeatedOsmNodeId(rows: readonly TollBoothExtractRowInput[]): boolean {
  return new Set(rows.map((row) => row.osmNodeId)).size !== rows.length
}

/**
 * `audit_logs.entity_id` é `uuid`, e o extrato tem chave natural: os primeiros 32 hex do sha256 dão
 * um id determinístico — a mesma recarga do mesmo extrato aponta sempre para o mesmo alvo.
 */
export function buildTollBoothExtractAuditEntityId(sha256: string): string {
  return [
    sha256.slice(0, 8),
    sha256.slice(8, 12),
    sha256.slice(12, 16),
    sha256.slice(16, 20),
    sha256.slice(20, 32),
  ].join('-')
}
