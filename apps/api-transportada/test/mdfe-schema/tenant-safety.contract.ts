/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  mdfeFiscalDocuments,
  mdfeIssuanceAttempts,
  mdfeIssuanceEvents,
  mdfeIssuanceOutbox,
  mdfeIssuancePayloads,
  mdfeManifestDrivers,
  mdfeManifestItems,
  mdfeManifestLoadingCities,
  mdfeManifests,
  mdfeProcessedMessages,
} from '../../src/database/database.schema.js'
import { foreignKeys } from '../fiscal-schema/support.js'

const MDFE_TABLES = [
  { name: 'mdfe_manifests', table: mdfeManifests },
  { name: 'mdfe_manifest_drivers', table: mdfeManifestDrivers },
  { name: 'mdfe_manifest_items', table: mdfeManifestItems },
  { name: 'mdfe_manifest_loading_cities', table: mdfeManifestLoadingCities },
  { name: 'mdfe_fiscal_documents', table: mdfeFiscalDocuments },
  { name: 'mdfe_issuance_attempts', table: mdfeIssuanceAttempts },
  { name: 'mdfe_issuance_events', table: mdfeIssuanceEvents },
  { name: 'mdfe_issuance_outbox', table: mdfeIssuanceOutbox },
  { name: 'mdfe_issuance_payloads', table: mdfeIssuancePayloads },
  { name: 'mdfe_processed_messages', table: mdfeProcessedMessages },
] as const

describe('mdfe tenant safety', () => {
  test('anchors every manifest table to a company', () => {
    for (const { name, table } of MDFE_TABLES) {
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

  // Sem a chave composta, um manifesto poderia adotar um veículo ou um CT-e de outro tenant
  test('reaches the vehicle, the drivers and the CT-e through the tenant, never by id alone', () => {
    expect(foreignKeys(mdfeManifests)).toContainEqual({
      columns: ['company_id', 'vehicle_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'fleet_vehicles',
      name: 'mdfe_manifests_company_vehicle_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(mdfeManifestDrivers)).toContainEqual({
      columns: ['company_id', 'driver_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'fleet_drivers',
      name: 'mdfe_manifest_drivers_company_driver_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(mdfeManifestItems)).toContainEqual({
      columns: ['company_id', 'cte_fiscal_document_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'cte_fiscal_documents',
      name: 'mdfe_manifest_items_company_document_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('deletes the manifest children with the manifest and never across tenants', () => {
    for (const { name, table } of [
      { name: 'mdfe_manifest_drivers', table: mdfeManifestDrivers },
      { name: 'mdfe_manifest_items', table: mdfeManifestItems },
      { name: 'mdfe_manifest_loading_cities', table: mdfeManifestLoadingCities },
    ]) {
      expect(foreignKeys(table)).toContainEqual({
        columns: ['company_id', 'manifest_id'],
        foreignColumns: ['company_id', 'id'],
        foreignTable: 'mdfe_manifests',
        name: `${name}_company_manifest_fk`,
        onDelete: 'cascade',
        onUpdate: 'cascade',
      })
    }
  })

  test('keeps the fiscal trail of a manifest inside the tenant that issued it', () => {
    expect(foreignKeys(mdfeFiscalDocuments)).toContainEqual({
      columns: ['company_id', 'attempt_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'mdfe_issuance_attempts',
      name: 'mdfe_fiscal_documents_company_attempt_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(mdfeFiscalDocuments)).toContainEqual({
      columns: ['company_id', 'xml_object_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'stored_objects',
      name: 'mdfe_fiscal_documents_company_xml_object_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(mdfeIssuancePayloads)).toContainEqual({
      columns: ['company_id', 'attempt_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'mdfe_issuance_attempts',
      name: 'mdfe_issuance_payloads_company_attempt_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(mdfeIssuanceOutbox)).toContainEqual({
      columns: ['actor_user_id', 'company_id'],
      foreignColumns: ['user_id', 'company_id'],
      foreignTable: 'user_company_memberships',
      name: 'mdfe_issuance_outbox_actor_membership_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })
})
