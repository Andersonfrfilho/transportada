/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  cteEmissionProfileComponents,
  cteEmissionProfileMatchers,
  cteEmissionProfiles,
} from '../../src/database/database.schema.js'
import { foreignKeys } from '../fiscal-schema/support.js'

describe('cte emission profile tenant safety', () => {
  test('anchors every profile to a company', () => {
    expect(foreignKeys(cteEmissionProfiles)).toContainEqual({
      columns: ['company_id'],
      foreignColumns: ['id'],
      foreignTable: 'companies',
      name: 'cte_emission_profiles_company_id_companies_id_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('reaches the freight rule through the tenant, never by id alone', () => {
    expect(foreignKeys(cteEmissionProfiles)).toContainEqual({
      columns: ['company_id', 'freight_rule_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'freight_rules',
      name: 'cte_emission_profiles_company_freight_rule_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('binds the author to an active membership of the same company', () => {
    expect(foreignKeys(cteEmissionProfiles)).toContainEqual({
      columns: ['created_by_user_id', 'company_id'],
      foreignColumns: ['user_id', 'company_id'],
      foreignTable: 'user_company_memberships',
      name: 'cte_emission_profiles_author_membership_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  test('makes a matcher unable to point at another tenant profile', () => {
    expect(foreignKeys(cteEmissionProfileMatchers)).toContainEqual({
      columns: ['company_id', 'profile_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'cte_emission_profiles',
      name: 'cte_emission_profile_matchers_company_profile_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
  })

  test('makes a component unable to point at another tenant profile', () => {
    expect(foreignKeys(cteEmissionProfileComponents)).toContainEqual({
      columns: ['company_id', 'profile_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'cte_emission_profiles',
      name: 'cte_emission_profile_components_company_profile_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
  })
})
