/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  ROUTE_SUGGESTION_STATUSES,
  companyRouteOptimizationSettings,
  routeSuggestionStops,
  routeSuggestions,
} from '../../src/database/database.schema.js'
import {
  checkSqlByName,
  unqualifiedCheckSqlByName,
  columnNames,
  foreignKeys,
  requiredColumnNames,
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
