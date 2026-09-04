/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

import {
  mdfeManifests,
  tripDeliveryProofs,
  tripDocumentEvents,
  tripDocuments,
  tripDrivers,
  tripStopEvents,
  tripStops,
  trips,
} from '../../src/database/database.schema.js'
import { foreignKeys } from '../fiscal-schema/support.js'

const TRIP_TABLES = [
  { name: 'trips', table: trips },
  { name: 'trip_drivers', table: tripDrivers },
  { name: 'trip_documents', table: tripDocuments },
  { name: 'trip_stops', table: tripStops },
  { name: 'trip_document_events', table: tripDocumentEvents },
  /**
   * ⚠️ As duas entraram em 2026-09-02, tarde: existem desde a spec 057 e ficaram fora desta lista
   * enquanto ninguém as consultava. A 079 abriu a leitura do comprovante para o escritório, e é
   * comprovante que carrega foto de canhoto com o nome de quem recebeu — dado de terceiro.
   */
  { name: 'trip_stop_events', table: tripStopEvents },
  { name: 'trip_delivery_proofs', table: tripDeliveryProofs },
] as const

describe('trip tenant safety', () => {
  test('anchors every trip table to a company', () => {
    for (const { name, table } of TRIP_TABLES) {
      expect(foreignKeys(table)).toContainEqual({
        columns: ['company_id'],
        foreignColumns: ['id'],
        foreignTable: 'companies',
        name: `${name}_company_id_companies_id_fk`,
        onDelete: 'restrict',
        onUpdate: 'cascade',
      })
    }
  })

  // Sem a chave composta, uma viagem poderia adotar um veículo, motorista ou nota de outro tenant
  test('reaches the vehicle, the drivers and the documents through the tenant, never by id alone', () => {
    expect(foreignKeys(trips)).toContainEqual({
      columns: ['company_id', 'vehicle_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'fleet_vehicles',
      name: 'trips_company_vehicle_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(tripDrivers)).toContainEqual({
      columns: ['company_id', 'driver_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'fleet_drivers',
      name: 'trip_drivers_company_driver_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(tripDocuments)).toContainEqual({
      columns: ['company_id', 'nfe_document_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'nfe_documents',
      name: 'trip_documents_company_nfe_document_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(tripDocuments)).toContainEqual({
      columns: ['company_id', 'freight_calculation_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'freight_calculations',
      name: 'trip_documents_company_freight_calculation_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('deletes the trip children with the trip and never across tenants', () => {
    for (const { name, table } of [
      { name: 'trip_drivers', table: tripDrivers },
      { name: 'trip_documents', table: tripDocuments },
      { name: 'trip_stops', table: tripStops },
    ]) {
      expect(foreignKeys(table)).toContainEqual({
        columns: ['company_id', 'trip_id'],
        foreignColumns: ['company_id', 'id'],
        foreignTable: 'trips',
        name: `${name}_company_trip_fk`,
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
    }
  })

  test('deletes the document trail with the document, never with the trip directly', () => {
    expect(foreignKeys(tripDocumentEvents)).toContainEqual({
      columns: ['company_id', 'trip_document_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'trip_documents',
      name: 'trip_document_events_company_document_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
  })

  test('holds the document to the stop by restrict — a composite FK cannot SET NULL company_id', () => {
    // Corrigido pela T010: numa FK composta, ON DELETE SET NULL zeraria company_id junto com
    // stop_id, e company_id é NOT NULL. Quem solta a nota da parada zera stop_id explicitamente
    // antes de apagar a parada (drizzle-trip-route.repository.ts).
    expect(foreignKeys(tripDocuments)).toContainEqual({
      columns: ['company_id', 'stop_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'trip_stops',
      name: 'trip_documents_company_stop_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  // ADR-0023: o manifesto referencia a viagem pela tenant, e nunca é apagado quando a viagem some
  test('links the mdfe manifest to its trip through the tenant, without cascading deletion', () => {
    expect(foreignKeys(mdfeManifests)).toContainEqual({
      columns: ['company_id', 'trip_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'trips',
      name: 'mdfe_manifests_company_trip_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })
})

/**
 * ⚠️ A consulta do comprovante (spec 079 T004) não tinha **nenhum** teste de isolamento.
 *
 * `test/trip-delivery-proof/read.contract.ts` tem um caso chamado "a consulta é sempre escopada
 * pela empresa do contexto" — e ele roda contra um **repositório falso**. O que ele prova é que o
 * caso de uso repassa `companyId` à porta; ele passaria idêntico com as quatro junções do SQL sem
 * `company_id` nenhum, porque `delivery-proof-read.support.ts` não é importado ali.
 *
 * O `CLAUDE.md` é explícito: isolamento se prova neste arquivo. E aqui a prova é por texto de
 * fonte, porque o defeito que ela pega — uma junção perdendo o tenant numa edição futura — compila,
 * e passa em todo teste de caminho feliz.
 */
describe('delivery proof query tenant safety (spec 079 T004)', () => {
  const source = readFileSync(
    new URL('../../src/trips/infrastructure/delivery-proof-read.support.ts', import.meta.url),
    'utf8',
  )

  /**
   * O comprovante pendura em três tabelas. Um degrau sem tenant é o caminho pelo qual o canhoto de
   * uma empresa aparece na tela de outra — e é o degrau do meio que ninguém confere.
   */
  test('carries the company through every join, never only on the outermost table', () => {
    const juncoes = source.split('.innerJoin(').slice(1)

    expect(juncoes.length).toBeGreaterThan(0)
    for (const juncao of juncoes) {
      expect(juncao.slice(0, juncao.indexOf('),'))).toInclude('companyId')
    }
  })

  /**
   * A viagem entra no `where`, não só na assinatura da função: sem ela uma nota de outra viagem da
   * mesma empresa devolveria o comprovante dela, por um id que o chamador já tinha em mãos.
   */
  test('filters by the trip, not just by the document', () => {
    const where = source.slice(source.indexOf('.where('), source.indexOf('.orderBy('))

    expect(where).toInclude('tripDocuments.tripId')
    expect(where).toInclude('companyId')
  })
})
