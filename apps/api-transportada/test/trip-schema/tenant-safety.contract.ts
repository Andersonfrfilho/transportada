/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  mdfeManifests,
  tripDocuments,
  tripDrivers,
  trips,
} from '../../src/database/database.schema.js'
import { foreignKeys } from '../fiscal-schema/support.js'

const TRIP_TABLES = [
  { name: 'trips', table: trips },
  { name: 'trip_drivers', table: tripDrivers },
  { name: 'trip_documents', table: tripDocuments },
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
