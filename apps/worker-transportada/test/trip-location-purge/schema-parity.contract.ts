/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import { companyLocationRetentionSettings } from '../../src/database/company-location-retention-settings.schema.js'
import {
  tripDeliveryProofs,
  tripDocumentOccurrences,
  tripLocationPings,
  tripStatusEvents,
  tripStopEvents,
  tripStopOccurrences,
} from '../../src/database/trip-execution.schema.js'

const WORKER_SCHEMA = new URL('../../src/database/trip-execution.schema.ts', import.meta.url)
const API_SCHEMA = new URL('../../../api-transportada/src/database/trip.schema.ts', import.meta.url)
const WORKER_SETTINGS_SCHEMA = new URL(
  '../../src/database/company-location-retention-settings.schema.ts',
  import.meta.url,
)
const API_SETTINGS_SCHEMA = new URL(
  '../../../api-transportada/src/database/company-location-retention-settings.schema.ts',
  import.meta.url,
)

const COLUMN_LINE = /^\s+[a-zA-Z]+: (uuid|numeric|timestamp|varchar|boolean|integer)\(.*,$/

/**
 * A chave e os carimbos de tempo ficam de fora da comparação linha a linha: a API os declara com o
 * default que preenche a linha (`.defaultRandom()`, `.defaultNow()`), e o worker nunca insere nestas
 * tabelas — só lê e apaga. Copiar o default seria copiar uma afirmação que esta cópia não faz. A
 * presença dessas colunas é conferida pelo nome, no segundo teste.
 */
const SCAFFOLDING_COLUMNS = ['id:', 'createdAt:', 'recordedAt:']

/**
 * `.$type<EventLocationState>()` só existe do lado da API, que é quem tem o tipo: o worker não
 * importa código dela. O que precisa bater é a coluna — nome, tipo e precisão —, não o refinamento
 * de TypeScript em cima dela.
 */
function extractColumnLines(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => COLUMN_LINE.test(line))
    .map((line) => line.trim().replace(/\.\$type<[^>]*>\(\)/, ''))
}

function extractPurgedColumnLines(source: string): string[] {
  return extractColumnLines(source).filter(
    (line) => !SCAFFOLDING_COLUMNS.some((prefix) => line.startsWith(prefix)),
  )
}

/**
 * ⚠️ **Cópia por valor.** O expurgo apaga a coordenada a partir da própria cópia; coluna renomeada
 * na API e não aqui é `UPDATE` que falha em produção, calado, e a retenção de noventa dias que o
 * `docs/SECURITY.md` promete deixa de existir sem ninguém ver.
 *
 * Desde a spec 196 a cópia carrega também `location_state`, e esse é mais do que um nome a casar: o
 * CHECK de consistência da API amarra `captured` à existência da coordenada, então o expurgo que
 * apaga a posição **tem** de carimbar `expired` no mesmo `UPDATE`, ou o lote inteiro cai com 23514.
 */
describe('trip location mirror parity (spec 196 D2)', () => {
  test('every column the purge touches reads exactly as the API declares it', async () => {
    const [worker, api] = await Promise.all([
      readFile(WORKER_SCHEMA, 'utf8'),
      readFile(API_SCHEMA, 'utf8'),
    ])

    const workerColumns = extractPurgedColumnLines(worker)
    const apiColumns = new Set(extractColumnLines(api))

    /**
     * Cinco do evento de parada, quatro do comprovante e cinco em cada uma das três tabelas da 196,
     * mais o `company_id` das cinco (spec 239 D2: a junção do expurgo por empresa) — o ping não tem
     * coluna de posição: a linha inteira cai.
     */
    expect(workerColumns.length).toBe(29)
    for (const line of workerColumns) {
      expect(apiColumns.has(line)).toBeTrue()
    }
  })

  test('points at the tables the API migrates, with the columns the purge reads and writes', () => {
    expect(getTableConfig(tripStopEvents).name).toBe('trip_stop_events')
    expect(getTableConfig(tripStopEvents).columns.map((column) => column.name)).toEqual([
      'id',
      'company_id',
      'latitude',
      'longitude',
      'accuracy_meters',
      'captured_at',
      'location_state',
      'created_at',
    ])

    expect(getTableConfig(tripDeliveryProofs).name).toBe('trip_delivery_proofs')
    expect(getTableConfig(tripDeliveryProofs).columns.map((column) => column.name)).toEqual([
      'id',
      'company_id',
      'latitude',
      'longitude',
      'accuracy_meters',
      'location_state',
      'created_at',
    ])

    const eventColumns = [
      'id',
      'company_id',
      'latitude',
      'longitude',
      'accuracy_meters',
      'captured_at',
      'location_state',
    ]
    expect(getTableConfig(tripStatusEvents).name).toBe('trip_status_events')
    expect(getTableConfig(tripStatusEvents).columns.map((column) => column.name)).toEqual([
      ...eventColumns,
      'recorded_at',
    ])
    expect(getTableConfig(tripStopOccurrences).name).toBe('trip_stop_occurrences')
    expect(getTableConfig(tripStopOccurrences).columns.map((column) => column.name)).toEqual([
      ...eventColumns,
      'created_at',
    ])
    expect(getTableConfig(tripDocumentOccurrences).name).toBe('trip_document_occurrences')
    expect(getTableConfig(tripDocumentOccurrences).columns.map((column) => column.name)).toEqual([
      ...eventColumns,
      'created_at',
    ])

    expect(getTableConfig(tripLocationPings).name).toBe('trip_location_pings')
    expect(getTableConfig(tripLocationPings).columns.map((column) => column.name)).toEqual([
      'id',
      'recorded_at',
    ])
  })
})

/**
 * Spec 239 D2: o worker lê a configuração por empresa na própria varredura. A cópia carrega só o que
 * a junção lê — o resto (`updated_by_user_id`, carimbos, `.default(...)`) é da API, que é quem grava.
 */
describe('company_location_retention_settings mirror parity (spec 239 D2)', () => {
  const READ_PROPERTIES = ['companyId', 'purgeEnabled', 'retentionDays', 'purgeEffectiveAt']

  function extractSignature(source: string, property: string): string | undefined {
    const line = source.split('\n').find((candidate) => candidate.trim().startsWith(`${property}:`))
    return line
      ?.trim()
      .replace(/\.default\([^)]*\)/, '')
      .replace(/,$/, '')
  }

  test('every column the worker reads has the signature the API declares', async () => {
    const [worker, api] = await Promise.all([
      readFile(WORKER_SETTINGS_SCHEMA, 'utf8'),
      readFile(API_SETTINGS_SCHEMA, 'utf8'),
    ])

    for (const property of READ_PROPERTIES) {
      const workerSignature = extractSignature(worker, property)
      expect(workerSignature).toBeDefined()
      expect(workerSignature).toBe(extractSignature(api, property)!)
    }
  })

  test('the copy declares only the columns the worker reads, with no defaults', async () => {
    const worker = await readFile(WORKER_SETTINGS_SCHEMA, 'utf8')

    expect(getTableConfig(companyLocationRetentionSettings).name).toBe(
      'company_location_retention_settings',
    )
    expect(
      getTableConfig(companyLocationRetentionSettings).columns.map((column) => column.name),
    ).toEqual(['company_id', 'purge_enabled', 'retention_days', 'purge_effective_at'])
    expect(worker).not.toContain('updatedByUserId')
    expect(worker).not.toContain('.default(')
  })
})
