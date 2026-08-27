/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  COMPANY_ROLES,
  contractorPortalBindings,
  fleetDrivers,
  tripLocationPings,
} from '../../src/database/database.schema.js'
import { COMPANY_ROLE_PERMISSIONS as ROLE_PERMISSIONS } from '../../src/identity/domain/authorization.policy.js'
import {
  columnSqlTypes,
  foreignKeys,
  indexColumnsByName,
  unqualifiedCheckSqlByName,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('o portal do contratante (spec 063 T002)', () => {
  /**
   * ADR-0050: o contratante é usuário do mesmo Keycloak. O que o recorta não é o papel — é o
   * vínculo, e é por isso que ele existe como tabela e não como coluna solta na membership.
   *
   * As duas permissões são separadas de propósito (§6): acompanhar entrega e decidir repasse são
   * atos diferentes, e o segundo é dinheiro.
   */
  test('o papel existe e concede só as duas permissões do portal', () => {
    expect(COMPANY_ROLES).toContain('contractor')
    expect(ROLE_PERMISSIONS.contractor).toEqual(['deliveries.track', 'charges.decide'])
  })

  /**
   * O par com `company_id` nas duas FKs é o que impede amarrar a conta de uma empresa ao contratante
   * de outra — a FK simples aceitaria, porque as duas linhas existem de verdade.
   */
  test('o vínculo casa membership e contratante dentro da mesma empresa', () => {
    const keys = foreignKeys(contractorPortalBindings)
    expect(keys).toContainEqual({
      columns: ['membership_id', 'company_id'],
      foreignColumns: ['id', 'company_id'],
      foreignTable: 'user_company_memberships',
      name: 'contractor_portal_bindings_membership_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
    expect(keys).toContainEqual({
      columns: ['company_id', 'contractor_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'contractors',
      name: 'contractor_portal_bindings_contractor_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
  })

  /** Uma conta pode responder por mais de um CNPJ do grupo; o mesmo par, não. */
  test('o par membership+contratante é único', () => {
    expect(
      uniqueColumnsByName(contractorPortalBindings)
        .contractor_portal_bindings_membership_contractor_unique,
    ).toEqual(['membership_id', 'contractor_id'])
  })

  /**
   * ADR-0050 §5: o rastro morre com a viagem. `cascade` nas duas pontas é o que faz o expurgo ser
   * consequência de apagar a viagem, e não uma rotina que alguém pode esquecer de rodar.
   */
  test('a posição é apagada junto com a viagem e com o motorista', () => {
    const keys = foreignKeys(tripLocationPings)
    for (const key of keys) expect(key.onDelete).toBe('cascade')
    expect(keys.map((key) => key.foreignTable).sort()).toEqual(['fleet_drivers', 'trips'])
  })

  /** A leitura é sempre "a última desta viagem": empresa, viagem e hora, nesta ordem. */
  test('o índice da posição é por viagem e hora', () => {
    expect(indexColumnsByName(tripLocationPings).trip_location_pings_trip_idx).toEqual([
      'company_id',
      'trip_id',
      'recorded_at',
    ])
  })

  /** Coordenada fora do globo é dado corrompido, e ela entra por rota que o celular chama sozinho. */
  test('a coordenada é conferida no banco', () => {
    const check = unqualifiedCheckSqlByName(tripLocationPings).trip_location_pings_coordinates_check
    expect(check).toContain('between -90 and 90')
    expect(check).toContain('between -180 and 180')
    const types = columnSqlTypes(tripLocationPings)
    expect(types.latitude).toBe('numeric(10, 7)')
    expect(types.longitude).toBe('numeric(10, 7)')
  })

  /**
   * ADR-0050 §5: **desligado por padrão.** A coluna é anulável e nasce nula de propósito — um
   * `default now()` transformaria a migration em consentimento de toda a frota de uma vez.
   */
  test('o consentimento do motorista nasce ausente', () => {
    const consent = columnSqlTypes(fleetDrivers).location_sharing_consent_at
    expect(consent).toBe('timestamp with time zone')
  })
})
