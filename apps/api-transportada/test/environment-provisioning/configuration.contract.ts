/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { EnvironmentProvisioningConfigurationError } from '../../src/database/environment-provisioning.error'
import {
  isEnvironmentProvisioningConfigured,
  readEnvironmentProvisioningConfiguration,
  runEnvironmentProvisioning,
} from '../../src/database/environment-provisioning.service'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000a1'
const ADMIN_SUBJECT = '00000000-0000-4000-8000-0000000000a2'
const ISSUER = 'https://identity.example.test/realms/transportada'
const CONNECTION_STRING = 'postgresql://provision:provision@localhost:1/provision'

const COMPLETE_SOURCE = {
  DATABASE_URL: CONNECTION_STRING,
  KEYCLOAK_ISSUER: ISSUER,
  PROVISION_ADMIN_SUBJECT: ADMIN_SUBJECT,
  PROVISION_COMPANY_ID: COMPANY_ID,
} as const

function sourceWithout(key: keyof typeof COMPLETE_SOURCE): Record<string, string | undefined> {
  const source: Record<string, string | undefined> = { ...COMPLETE_SOURCE }
  delete source[key]
  return source
}

export function runEnvironmentProvisioningConfigurationContract(): void {
  describe('environment provisioning configuration', () => {
    test('reads the environment company and the first administrator from the configuration', () => {
      expect(readEnvironmentProvisioningConfiguration({ ...COMPLETE_SOURCE })).toEqual({
        adminSubject: ADMIN_SUBJECT,
        companyId: COMPANY_ID,
        connectionString: CONNECTION_STRING,
        issuer: ISSUER,
      })
    })

    test('trims the administrator subject and the company identifier', () => {
      expect(
        readEnvironmentProvisioningConfiguration({
          ...COMPLETE_SOURCE,
          PROVISION_ADMIN_SUBJECT: `  ${ADMIN_SUBJECT}  `,
          PROVISION_COMPANY_ID: `  ${COMPANY_ID}  `,
        }),
      ).toEqual({
        adminSubject: ADMIN_SUBJECT,
        companyId: COMPANY_ID,
        connectionString: CONNECTION_STRING,
        issuer: ISSUER,
      })
    })

    test('refuses a database url that is absent or not PostgreSQL', () => {
      expect(() => readEnvironmentProvisioningConfiguration(sourceWithout('DATABASE_URL'))).toThrow(
        EnvironmentProvisioningConfigurationError,
      )
      expect(() =>
        readEnvironmentProvisioningConfiguration({
          ...COMPLETE_SOURCE,
          DATABASE_URL: 'mysql://provision:provision@localhost:1/provision',
        }),
      ).toThrow(EnvironmentProvisioningConfigurationError)
    })

    test('refuses an issuer that is absent or not a trusted identity url', () => {
      expect(() =>
        readEnvironmentProvisioningConfiguration(sourceWithout('KEYCLOAK_ISSUER')),
      ).toThrow(EnvironmentProvisioningConfigurationError)
      expect(() =>
        readEnvironmentProvisioningConfiguration({
          ...COMPLETE_SOURCE,
          KEYCLOAK_ISSUER: 'http://identity.example.test/realms/transportada',
        }),
      ).toThrow(EnvironmentProvisioningConfigurationError)
    })

    test('the environment company alone is complete configuration: the administrator comes from first access', () => {
      const companyOnly = {
        adminSubject: undefined,
        companyId: COMPANY_ID,
        connectionString: CONNECTION_STRING,
        issuer: ISSUER,
      }

      expect(
        readEnvironmentProvisioningConfiguration(sourceWithout('PROVISION_ADMIN_SUBJECT')),
      ).toEqual(companyOnly)
      expect(
        readEnvironmentProvisioningConfiguration({
          ...COMPLETE_SOURCE,
          PROVISION_ADMIN_SUBJECT: '   ',
        }),
      ).toEqual(companyOnly)
    })

    test('refuses a company identifier that is absent or not a uuid', () => {
      expect(() =>
        readEnvironmentProvisioningConfiguration(sourceWithout('PROVISION_COMPANY_ID')),
      ).toThrow(EnvironmentProvisioningConfigurationError)
      expect(() =>
        readEnvironmentProvisioningConfiguration({
          ...COMPLETE_SOURCE,
          PROVISION_COMPANY_ID: 'primeira-empresa',
        }),
      ).toThrow(EnvironmentProvisioningConfigurationError)
    })

    test('refuses an administrator subject declared alone: there is no company to bind it to', () => {
      expect(() =>
        readEnvironmentProvisioningConfiguration(sourceWithout('PROVISION_COMPANY_ID')),
      ).toThrow(EnvironmentProvisioningConfigurationError)
    })

    test('ignores lookalike keys: the company comes from the configuration, never from a payload', () => {
      expect(() =>
        readEnvironmentProvisioningConfiguration({
          ...sourceWithout('PROVISION_COMPANY_ID'),
          companyId: COMPANY_ID,
          company_id: COMPANY_ID,
        }),
      ).toThrow(EnvironmentProvisioningConfigurationError)
    })

    test('keeps the connection string out of the refusal message', () => {
      try {
        readEnvironmentProvisioningConfiguration({
          ...COMPLETE_SOURCE,
          DATABASE_URL: 'mysql://provision:s3cr3t@localhost:1/provision',
        })
        throw new Error('the configuration should have been refused')
      } catch (error) {
        expect(error).toBeInstanceOf(EnvironmentProvisioningConfigurationError)
        expect(JSON.stringify({ error: `${error}` })).not.toContain('s3cr3t')
      }
    })

    test('an environment without company and administrator declared is skipped, not failed', () => {
      expect(isEnvironmentProvisioningConfigured({})).toBe(false)
      expect(
        isEnvironmentProvisioningConfigured({
          PROVISION_ADMIN_SUBJECT: '  ',
          PROVISION_COMPANY_ID: '',
        }),
      ).toBe(false)
    })

    test('either variable declared puts the environment in provisioning, never in skipping', () => {
      expect(isEnvironmentProvisioningConfigured({ PROVISION_COMPANY_ID: COMPANY_ID })).toBe(true)
      expect(isEnvironmentProvisioningConfigured({ PROVISION_ADMIN_SUBJECT: ADMIN_SUBJECT })).toBe(
        true,
      )
    })

    test('refuses an invalid configuration before opening the database', async () => {
      await expect(
        runEnvironmentProvisioning({
          adminSubject: ADMIN_SUBJECT,
          companyId: 'primeira-empresa',
          connectionString: CONNECTION_STRING,
          issuer: ISSUER,
        }),
      ).rejects.toBeInstanceOf(EnvironmentProvisioningConfigurationError)
    })
  })
}
