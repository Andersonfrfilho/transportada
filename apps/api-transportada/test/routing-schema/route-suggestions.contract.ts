/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { getTableConfig } from 'drizzle-orm/pg-core'

import {
  ROUTE_SUGGESTION_STATUSES,
  companyRouteOptimizationSettings,
  driverAssignmentFeedback,
  routeSuggestionStops,
  routeSuggestionVehicleHelpers,
  routeSuggestionVehicles,
  routeSuggestions,
} from '../../src/database/database.schema.js'
import { DRIVER_SOURCES } from '../../src/shared/suggestion-driver-source.constant.js'
import {
  checkSqlByName,
  unqualifiedCheckSqlByName,
  columnNames,
  foreignKeys,
  indexColumnsByName,
  requiredColumnNames,
  uniqueColumnsByName,
} from '../fiscal-schema/support.js'

describe('route suggestions (ADR-0044 §5)', () => {
  test('closes the status on the lifecycle, stale included', () => {
    const checks = checkSqlByName(routeSuggestions)

    for (const status of ROUTE_SUGGESTION_STATUSES) {
      expect(checks.route_suggestions_status_check).toContain(`'${status}'`)
    }
  })

  /**
   * ADR-0044 §8: a semente que rodou fica gravada, ou "mesma entrada, mesma saída" não é
   * verificável — e a reclamação de que "ontem deu outro roteiro" não é depurável.
   */
  test('records the seed, because determinism is a requirement and not a convenience', () => {
    expect(requiredColumnNames(routeSuggestions)).toContain('seed')
  })

  /** Decisão humana tem autor e hora, ou é linha que mudou sozinha. */
  test('ties a decided status to when it was decided, in both directions', () => {
    expect(unqualifiedCheckSqlByName(routeSuggestions).route_suggestions_decided_check).toContain(
      `("status" in ('accepted', 'rejected')) = ("decided_at" is not null)`,
    )
  })

  /** Falha tem causa nomeada; sucesso não carrega código de erro pendurado. */
  test('pairs failure with a reason, and success with none', () => {
    expect(
      unqualifiedCheckSqlByName(routeSuggestions).route_suggestions_error_code_check,
    ).toContain(`("status" = 'failed') = (length("error_code") > 0)`)
  })

  /**
   * A multi-veículo (P2) distribui um pool de notas antes de existir viagem: ela propõe as viagens,
   * e só o aceite as cria. Exigir `trip_id` aqui mataria a história inteira.
   */
  test('allows a suggestion with no trip yet, which is what the multi-vehicle case is', () => {
    expect(requiredColumnNames(routeSuggestions)).not.toContain('trip_id')
    expect(requiredColumnNames(routeSuggestions)).not.toContain('vehicle_id')
  })

  test('reaches trip and vehicle through the tenant, never by id alone', () => {
    expect(foreignKeys(routeSuggestions)).toContainEqual({
      columns: ['company_id', 'trip_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'trips',
      name: 'route_suggestions_company_trip_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(routeSuggestions)).toContainEqual({
      columns: ['company_id', 'vehicle_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'fleet_vehicles',
      name: 'route_suggestions_company_vehicle_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })
})

/**
 * Decisão do usuário (2026-09-13): o tempo da proposta soma a volta ao barracão, e ela precisa ser
 * gravada — o solver já a somava no custo, mas nenhuma coluna a guardava.
 */
describe('route suggestion vehicles — a perna de volta', () => {
  /** Nula é legítima: sugestão anterior à coluna, política sem retorno ou par inalcançável. */
  test('records the return leg, nullable', () => {
    expect(columnNames(routeSuggestionVehicles)).toContain('return_distance_meters')
    expect(columnNames(routeSuggestionVehicles)).toContain('return_duration_seconds')
    expect(requiredColumnNames(routeSuggestionVehicles)).not.toContain('return_distance_meters')
    expect(requiredColumnNames(routeSuggestionVehicles)).not.toContain('return_duration_seconds')
  })

  test('refuses a negative return leg', () => {
    expect(
      unqualifiedCheckSqlByName(routeSuggestionVehicles).route_suggestion_vehicles_return_leg_check,
    ).toContain('"return_duration_seconds" >= 0')
  })
})

/** Spec 149 / ADR-0065: de onde veio o motorista do veículo, e quem vai de ajudante. */
describe('route suggestion crew (spec 149)', () => {
  test('records where the driver came from only when there is a driver', () => {
    expect(columnNames(routeSuggestionVehicles)).toContain('driver_source')
    expect(requiredColumnNames(routeSuggestionVehicles)).not.toContain('driver_source')

    const check =
      unqualifiedCheckSqlByName(
        routeSuggestionVehicles,
      ).route_suggestion_vehicles_driver_source_check
    expect(check).toContain('"driver_source" is null')
    expect(check).toContain('"driver_id" is not null')
    for (const source of DRIVER_SOURCES) {
      expect(check).toContain(`'${source}'`)
    }
  })

  test('exposes the tenant-scoped vehicle key the helpers hang from', () => {
    expect(uniqueColumnsByName(routeSuggestionVehicles)).toMatchObject({
      route_suggestion_vehicles_company_suggestion_vehicle_unique: [
        'company_id',
        'suggestion_id',
        'vehicle_id',
      ],
    })
  })

  test('hangs helpers from the suggested vehicle and removes them with it', () => {
    expect(getTableConfig(routeSuggestionVehicleHelpers).name).toBe(
      'route_suggestion_vehicle_helpers',
    )
    expect(requiredColumnNames(routeSuggestionVehicleHelpers)).toEqual(
      columnNames(routeSuggestionVehicleHelpers),
    )
    expect(foreignKeys(routeSuggestionVehicleHelpers)).toContainEqual({
      columns: ['company_id', 'suggestion_id', 'vehicle_id'],
      foreignColumns: ['company_id', 'suggestion_id', 'vehicle_id'],
      foreignTable: 'route_suggestion_vehicles',
      name: 'route_suggestion_vehicle_helpers_vehicle_fk',
      onDelete: 'cascade',
      onUpdate: 'cascade',
    })
    expect(foreignKeys(routeSuggestionVehicleHelpers)).toContainEqual({
      columns: ['company_id', 'driver_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'fleet_drivers',
      name: 'route_suggestion_vehicle_helpers_driver_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
  })

  /** A mesma pessoa em dois veículos seriam duas viagens simultâneas dela (RF-2 da ADR-0055). */
  test('keeps a person on at most one vehicle of the suggestion as helper', () => {
    expect(uniqueColumnsByName(routeSuggestionVehicleHelpers)).toMatchObject({
      route_suggestion_vehicle_helpers_suggestion_driver_unique: [
        'company_id',
        'suggestion_id',
        'driver_id',
      ],
    })
  })
})

describe('driver assignment feedback (spec 149)', () => {
  test('keeps the last choice per suggested vehicle', () => {
    expect(getTableConfig(driverAssignmentFeedback).name).toBe('driver_assignment_feedback')
    expect(uniqueColumnsByName(driverAssignmentFeedback)).toMatchObject({
      driver_assignment_feedback_company_suggestion_vehicle_unique: [
        'company_id',
        'suggestion_id',
        'vehicle_id',
      ],
    })
    expect(indexColumnsByName(driverAssignmentFeedback)).toMatchObject({
      driver_assignment_feedback_company_vehicle_created_idx: [
        'company_id',
        'vehicle_id',
        'created_at',
      ],
    })
  })

  test('needs at least one of the two drivers', () => {
    expect(requiredColumnNames(driverAssignmentFeedback)).not.toContain('recommended_driver_id')
    expect(requiredColumnNames(driverAssignmentFeedback)).not.toContain('chosen_driver_id')
    expect(
      unqualifiedCheckSqlByName(driverAssignmentFeedback).driver_assignment_feedback_driver_check,
    ).toContain('"recommended_driver_id" is not null or "chosen_driver_id" is not null')
  })

  test('reaches suggestion, vehicle and both drivers through the tenant', () => {
    const keys = foreignKeys(driverAssignmentFeedback)

    expect(keys).toContainEqual({
      columns: ['company_id', 'suggestion_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'route_suggestions',
      name: 'driver_assignment_feedback_suggestion_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    expect(keys).toContainEqual({
      columns: ['company_id', 'vehicle_id'],
      foreignColumns: ['company_id', 'id'],
      foreignTable: 'fleet_vehicles',
      name: 'driver_assignment_feedback_vehicle_fk',
      onDelete: 'restrict',
      onUpdate: 'cascade',
    })
    for (const [column, name] of [
      ['recommended_driver_id', 'driver_assignment_feedback_recommended_driver_fk'],
      ['chosen_driver_id', 'driver_assignment_feedback_chosen_driver_fk'],
    ] as const) {
      expect(keys).toContainEqual({
        columns: ['company_id', column],
        foreignColumns: ['company_id', 'id'],
        foreignTable: 'fleet_drivers',
        name,
        onDelete: 'restrict',
        onUpdate: 'cascade',
      })
    }
  })
})

describe('route suggestion stops (ADR-0044 §5)', () => {
  /**
   * O ETA e a sua procedência viajam juntos: um tempo de serviço sem origem declarada é um ETA em
   * que ninguém confia, e a spec cobra que `default` ou `measured` apareça na resposta.
   */
  test('keeps the service time and where it came from inseparable', () => {
    expect(
      unqualifiedCheckSqlByName(routeSuggestionStops).route_suggestion_stops_service_time_check,
    ).toContain('("service_time_seconds" is null) = ("service_time_source" is null)')
  })

  /** Precisão `city` é palpite de ~8km: ela sai da otimização, marcada, esperando decisão humana. */
  test('can mark a stop as kept out of the optimization', () => {
    expect(columnNames(routeSuggestionStops)).toContain('excluded_from_optimization')
    expect(columnNames(routeSuggestionStops)).toContain('geocoding_precision')
  })

  /** Nota sem peso entra com o médio da empresa — e o conferente vê que aquilo é estimativa. */
  test('marks an estimated weight, so the operator sees it before accepting', () => {
    expect(columnNames(routeSuggestionStops)).toContain('weight_estimated')
  })

  /** A violação aparece explícita; nunca é escondida escolhendo uma ordem pior. */
  test('carries violations per stop instead of hiding them in a worse order', () => {
    expect(requiredColumnNames(routeSuggestionStops)).toContain('violations')
  })
})

describe('company route optimization settings (spec 058 RF-7)', () => {
  /**
   * D6b: o modelo de transporte não é o mesmo para todo mundo. Distribuição urbana com retorno ao
   * barracão não se parece com viagem interestadual, e uma restrição rígida no lugar errado só
   * empobrece a solução sem proteger ninguém. Nulo é "não é restrição aqui".
   */
  test('leaves every duty limit nullable, because duty is opt-in per company', () => {
    const required = requiredColumnNames(companyRouteOptimizationSettings)

    expect(required).not.toContain('max_driving_seconds_per_day')
    expect(required).not.toContain('mandatory_break_seconds')
    expect(required).not.toContain('break_every_seconds')
    expect(required).not.toContain('max_duty_seconds_per_day')
  })

  /** Pausa obrigatória sem frequência não é pausa; frequência sem pausa não pausa nada. */
  test('requires the break and its frequency to arrive together or not at all', () => {
    expect(
      unqualifiedCheckSqlByName(companyRouteOptimizationSettings)
        .company_route_optimization_settings_break_check,
    ).toContain('("mandatory_break_seconds" is null) = ("break_every_seconds" is null)')
  })

  /** Terminar num endereço declarado exige o endereço; as outras políticas não o admitem. */
  test('demands an end address exactly when the policy is to end at one', () => {
    expect(
      unqualifiedCheckSqlByName(companyRouteOptimizationSettings)
        .company_route_optimization_settings_end_address_check,
    ).toContain(`("end_policy" = 'address') = (length("end_address_key") > 0)`)
  })

  /** O orçamento do solver é teto, não sugestão: sem limite superior ele roda para sempre. */
  test('bounds the solver time budget on both ends', () => {
    expect(
      checkSqlByName(companyRouteOptimizationSettings)
        .company_route_optimization_settings_budget_check,
    ).toContain('between 1 and 600')
  })
})
