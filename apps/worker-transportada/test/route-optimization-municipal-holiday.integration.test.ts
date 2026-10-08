/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 238 T1.2a — **caracterização**: o que o roteirizador faz com `municipal_holidays`, contra
 * Postgres e com o repositório real. O feriado vale só para a parada da cidade dele (F1 do roteirizador). Nenhum teste cobria essa leitura, e a T1.2 (migration que
 * acrescenta colunas à tabela) só pode andar se o solver provar depois que continua lendo a data fixa.
 *
 * O efeito observável é a violação `delivery_window` da parada: cliente fechado vira janela impossível
 * (`resolvePoolWindow`) e o solver a declara. Real: repositório, efeito, solver e banco. **Stub: só a
 * matriz** (ADR-0044 §1). A data do roteiro é o dia UTC de hoje e não é injetável, por isso o teste a
 * calcula a cada cenário.
 */
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { handleRouteOptimization } from '../src/routing/application/route-optimization-handler.service.js'
import type { RoutingMatrixPort } from '../src/routing/application/routing-matrix.port.js'
import { createDrizzleRouteOptimizationRepository } from '../src/routing/infrastructure/drizzle-route-optimization.repository.js'
import { createRouteOptimizationPorts } from '../src/routing/infrastructure/route-optimization-ports.factory.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
const db = provider.db

const DEPOT = { addressKey: 'depot-holiday', latitude: '-21.1767000', longitude: '-47.8208000' }
const CNPJ_A = '11222333000181'
const DESTINATIONS = [
  {
    addressKey: '3543402|14099000|910',
    cityCode: '3543402',
    hasClient: true,
    hasWindows: true,
    latitude: '-21.1800000',
    longitude: '-47.8100000',
    taxId: CNPJ_A,
  },
  {
    addressKey: '3550308|01310100|920',
    cityCode: '3550308',
    hasClient: true,
    hasWindows: true,
    latitude: '-23.5614000',
    longitude: '-46.6559000',
    taxId: '44555666000181',
  },
  /** O mesmo CNPJ do cliente A, com uma segunda parada na cidade B. */
  {
    addressKey: '3550308|01310200|930',
    cityCode: '3550308',
    hasClient: false,
    hasWindows: false,
    latitude: '-23.5620000',
    longitude: '-46.6570000',
    taxId: CNPJ_A,
  },
  /** Cliente cadastrado sem nenhuma janela, numa cidade que nenhum outro cliente do arquivo usa. */
  {
    addressKey: '4106902|80010000|940',
    cityCode: '4106902',
    hasClient: true,
    hasWindows: false,
    latitude: '-25.4284000',
    longitude: '-49.2733000',
    taxId: '77888999000181',
  },
] as const
const [CITY_A, CITY_B, CITY_B_SAME_CLIENT_AS_A, CITY_WITHOUT_WINDOWS] = DESTINATIONS
const UNRELATED_CITY_CODE = '3304557'

describeDatabase('o feriado municipal no roteirizador (spec 238 T1.2a)', () => {
  const companyId = crypto.randomUUID()
  const otherCompanyId = crypto.randomUUID()
  const userId = crypto.randomUUID()
  const importId = crypto.randomUUID()
  const vehicleId = crypto.randomUUID()
  const documentIds = DESTINATIONS.map(() => crypto.randomUUID())

  beforeAll(async () => {
    for (const id of [companyId, otherCompanyId]) {
      await db.execute(sql`insert into companies (id, status) values (${id}, 'active')`)
    }
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(sql`
      insert into user_company_memberships (id, user_id, company_id, status)
      values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')
    `)
    await db.execute(sql`
      insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state, capacity_kg)
      values (${vehicleId}, ${companyId}, 'HOL2T38', 'traction', 'truck', 'SP', 8000)
    `)
    await db.execute(sql`
      insert into nfe_imports
        (id, company_id, correlation_id, idempotency_key, request_fingerprint,
         requested_by_user_id, source, status)
      values (${importId}, ${companyId}, 'holiday-e2e', 'holiday-e2e', 'holiday-e2e', ${userId},
        'upload', 'completed')
    `)
    await db.execute(sql`
      insert into company_route_optimization_settings
        (company_id, origin_address_key, timezone, fallback_weight_kilograms)
      values (${companyId}, ${DEPOT.addressKey}, 'America/Sao_Paulo', '50.00')
    `)
    for (const point of [DEPOT, ...DESTINATIONS]) {
      await db.execute(sql`
        insert into geocoded_addresses (address_key, latitude, longitude, precision, source, external_place_id)
        values (${point.addressKey}, ${point.latitude}, ${point.longitude}, 'rooftop', 'google',
          ${`place-${point.addressKey}`})
        on conflict (address_key) do nothing
      `)
    }

    for (const [index, destination] of DESTINATIONS.entries()) {
      const documentId = documentIds[index] as string
      const objectId = crypto.randomUUID()
      const participantId = crypto.randomUUID()
      const clientId = crypto.randomUUID()
      const [postalCode = '', number = ''] = destination.addressKey.split('|').slice(1)
      const digest = String(index + 5).repeat(64)

      await db.execute(sql`
        insert into stored_objects
          (id, company_id, bucket, object_key, mime_type, provider, purpose, sha256, size_bytes, status)
        values (${objectId}, ${companyId}, 'integration', ${`nfe/holiday-${index}.xml`},
          'application/xml', 's3', 'nfe_document', ${digest}, 100, 'final')
      `)
      await db.execute(sql`
        insert into nfe_documents
          (id, company_id, import_id, access_key, model, series, number, issued_at,
           operation_nature, operation_type, products_value, freight_value, total_value, status,
           source, authorization_protocol, xml_object_id, xml_sha256, created_by_user_id)
        values (${documentId}, ${companyId}, ${importId}, ${`${index + 5}${'3'.repeat(43)}`},
          '55', '1', ${`92000${index}`}, '2026-08-20T06:00:00.000Z', 'Venda', '1',
          '1000.0000', '0.0000', '1000.0000', 'authorized', 'upload',
          ${`protocol-holiday-${index}`}, ${objectId}, ${digest}, ${userId})
      `)
      await db.execute(sql`
        insert into nfe_participants (id, company_id, document_id, role, tax_id, legal_name)
        values (${participantId}, ${companyId}, ${documentId}, 'recipient', ${destination.taxId},
          'Destinatário')
      `)
      await db.execute(sql`
        insert into nfe_addresses
          (id, company_id, participant_id, street, number, district, city, city_code, state, postal_code)
        values (${crypto.randomUUID()}, ${companyId}, ${participantId}, 'Rua', ${number},
          'Centro', 'Cidade', ${destination.cityCode}, 'SP', ${postalCode})
      `)
      if (!destination.hasClient) continue

      await db.execute(sql`
        insert into delivery_clients (id, company_id, tax_id, display_name)
        values (${clientId}, ${companyId}, ${destination.taxId}, ${`Cliente ${index}`})
      `)
      if (!destination.hasWindows) continue

      for (const weekday of [0, 1, 2, 3, 4, 5, 6]) {
        await db.execute(sql`
          insert into delivery_client_windows
            (id, company_id, delivery_client_id, weekday, opens_at, closes_at)
          values (${crypto.randomUUID()}, ${companyId}, ${clientId}, ${weekday}, '08:00', '11:00')
        `)
      }
    }
  })

  afterEach(async () => {
    await db.execute(sql`delete from municipal_holidays where company_id in
      (${companyId}, ${otherCompanyId})`)
  })

  afterAll(async () => {
    for (const table of [
      'route_suggestion_stop_documents',
      'route_suggestion_stops',
      'route_suggestion_documents',
      'route_suggestion_vehicles',
      'route_suggestions',
      'delivery_client_windows',
      'delivery_clients',
      'nfe_addresses',
      'nfe_participants',
      'nfe_documents',
      'stored_objects',
      'nfe_imports',
      'company_route_optimization_settings',
      'fleet_vehicles',
      'user_company_memberships',
    ]) {
      await db.execute(sql`delete from ${sql.identifier(table)} where company_id = ${companyId}`)
    }
    await db.execute(sql`delete from identity_users where id = ${userId}`)
    await db.execute(sql`delete from companies where id in (${companyId}, ${otherCompanyId})`)
    await db.execute(sql`
      delete from geocoded_addresses where address_key in
        (${DEPOT.addressKey}, ${sql.join(
          DESTINATIONS.map((destination) => sql`${destination.addressKey}`),
          sql`, `,
        )})
    `)
    await provider.close?.()
  })

  test('sem feriado cadastrado, ninguém fica fechado', async () => {
    const closed = await closedAddressKeys([0, 1])

    expect(closed).toEqual([])
  })

  test('feriado once na cidade da parada e na data do roteiro fecha o cliente', async () => {
    await insertHoliday({ cityCode: CITY_A.cityCode, holidayOn: today() })

    expect(await closedAddressKeys([0])).toEqual([CITY_A.addressKey])
  })

  test('o mesmo feriado em outra data não fecha o cliente', async () => {
    await insertHoliday({ cityCode: CITY_A.cityCode, holidayOn: shiftDays(today(), 1) })
    await insertHoliday({ cityCode: CITY_A.cityCode, holidayOn: shiftDays(today(), -1) })

    expect(await closedAddressKeys([0])).toEqual([])
  })

  test('feriado de uma cidade que não tem parada no roteiro não fecha ninguém', async () => {
    await insertHoliday({ cityCode: CITY_B.cityCode, holidayOn: today() })
    await insertHoliday({ cityCode: UNRELATED_CITY_CODE, holidayOn: today() })

    expect(await closedAddressKeys([0])).toEqual([])
  })

  test('o feriado de uma cidade fecha só as paradas dela, não o cliente de outra cidade no mesmo roteiro', async () => {
    await insertHoliday({ cityCode: CITY_B.cityCode, holidayOn: today() })

    const closed = await closedAddressKeys([0, 1])

    // O motivo é a cidade da parada: o cliente A tem janela cadastrada e nenhum feriado na cidade dele.
    expect(closed).toEqual([CITY_B.addressKey])
  })

  test('o mesmo CNPJ com parada em A e em B, e feriado só em B, fecha só a parada de B', async () => {
    await insertHoliday({ cityCode: CITY_B.cityCode, holidayOn: today() })

    const closed = await closedAddressKeys([0, 2])

    expect(closed).toEqual([CITY_B_SAME_CLIENT_AS_A.addressKey])
  })

  test('o mesmo CNPJ com parada em A e em B, e feriado só em A, fecha só a parada de A', async () => {
    await insertHoliday({ cityCode: CITY_A.cityCode, holidayOn: today() })

    const closed = await closedAddressKeys([0, 2])

    expect(closed).toEqual([CITY_A.addressKey])
  })

  test('feriado em A e em B fecha as paradas das duas cidades', async () => {
    await insertHoliday({ cityCode: CITY_A.cityCode, holidayOn: today() })
    await insertHoliday({ cityCode: CITY_B.cityCode, holidayOn: today() })

    const closed = await closedAddressKeys([0, 1, 2])

    expect(closed).toEqual(
      [CITY_A.addressKey, CITY_B.addressKey, CITY_B_SAME_CLIENT_AS_A.addressKey].sort(),
    )
  })

  test('cliente sem janela cadastrada numa cidade sem feriado fica aberto', async () => {
    await insertHoliday({ cityCode: CITY_A.cityCode, holidayOn: today() })

    const closed = await closedAddressKeys([0, 3])

    expect(closed).toEqual([CITY_A.addressKey])
  })

  test('cliente sem janela cadastrada numa cidade em feriado fica fechado', async () => {
    await insertHoliday({ cityCode: CITY_WITHOUT_WINDOWS.cityCode, holidayOn: today() })

    const closed = await closedAddressKeys([0, 3])

    expect(closed).toEqual([CITY_WITHOUT_WINDOWS.addressKey])
  })

  test('o feriado de uma cidade que não é a da parada do cliente nunca o fecha', async () => {
    await insertHoliday({ cityCode: CITY_B.cityCode, holidayOn: today() })
    await insertHoliday({ cityCode: UNRELATED_CITY_CODE, holidayOn: today() })

    const closed = await closedAddressKeys([0, 3])

    expect(closed).toEqual([])
  })

  test('feriado de outra empresa não afeta o roteiro', async () => {
    await insertHoliday({ cityCode: CITY_A.cityCode, holidayOn: today(), owner: otherCompanyId })

    expect(await closedAddressKeys([0])).toEqual([])
  })

  test('data 2000-MM-DD (formato yearly da opção A) não casa com a data do roteiro', async () => {
    await insertHoliday({ cityCode: CITY_A.cityCode, holidayOn: `2000-${today().slice(5)}` })

    expect(await closedAddressKeys([0])).toEqual([])
  })

  /** Spec 238 T1.2: a data gerada por uma regra "todo ano" é uma data fixa comum para o roteirizador. */
  test('uma data materializada de uma regra (com source_rule_id) fecha o cliente como a digitada', async () => {
    const ruleId = crypto.randomUUID()
    const [year = '', month = '', day = ''] = today().split('-')

    try {
      await db.execute(sql`
        insert into municipal_holiday_rules
          (id, company_id, city_ibge_code, month, day, kind, name, materialized_through_year)
        values (${ruleId}, ${companyId}, ${CITY_A.cityCode}, ${Number(month)}, ${Number(day)},
          'city_anniversary', 'Aniversário da cidade', ${Number(year)})
      `)
      await db.execute(sql`
        insert into municipal_holidays
          (company_id, city_ibge_code, holiday_on, name, kind, source_rule_id)
        values (${companyId}, ${CITY_A.cityCode}, ${today()}, 'Aniversário da cidade',
          'city_anniversary', ${ruleId})
      `)

      expect(await closedAddressKeys([0])).toEqual([CITY_A.addressKey])
    } finally {
      await db.execute(sql`delete from municipal_holiday_rules where id = ${ruleId}`)
    }
  })

  /** Spec 238 T1.3: a regra "todo ano" é só a regra; o roteirizador casa a data fixa, e sem a linha gerada nada fecha. */
  test('uma regra "todo ano" sem a data gerada para o ano do roteiro não fecha o cliente', async () => {
    const ruleId = crypto.randomUUID()
    const [year = '', month = '', day = ''] = today().split('-')

    try {
      await db.execute(sql`
        insert into municipal_holiday_rules
          (id, company_id, city_ibge_code, month, day, kind, name, materialized_through_year)
        values (${ruleId}, ${companyId}, ${CITY_A.cityCode}, ${Number(month)}, ${Number(day)},
          'city_anniversary', 'Aniversário da cidade', ${Number(year) - 1})
      `)

      expect(await closedAddressKeys([0])).toEqual([])
    } finally {
      await db.execute(sql`delete from municipal_holiday_rules where id = ${ruleId}`)
    }
  })

  async function insertHoliday(input: {
    readonly cityCode: string
    readonly holidayOn: string
    readonly owner?: string
  }): Promise<void> {
    await db.execute(sql`
      insert into municipal_holidays (company_id, city_ibge_code, holiday_on, name)
      values (${input.owner ?? companyId}, ${input.cityCode}, ${input.holidayOn}, 'Feriado de teste')
    `)
  }

  /** Roda o pool real com as notas escolhidas e devolve as paradas com `delivery_window` declarada. */
  async function closedAddressKeys(documentIndexes: readonly number[]): Promise<string[]> {
    const suggestionId = crypto.randomUUID()
    await db.execute(sql`
      insert into route_suggestions (id, company_id, trip_id, status, seed, assumptions)
      values (${suggestionId}, ${companyId}, null, 'queued', 7,
        ${JSON.stringify({ solverTimeBudgetSeconds: 1 })}::jsonb)
    `)
    for (const index of documentIndexes) {
      await db.execute(sql`
        insert into route_suggestion_documents (id, company_id, suggestion_id, nfe_document_id)
        values (${crypto.randomUUID()}, ${companyId}, ${suggestionId}, ${documentIds[index] as string})
      `)
    }
    await db.execute(sql`
      insert into route_suggestion_vehicles (id, company_id, suggestion_id, vehicle_id, position)
      values (${crypto.randomUUID()}, ${companyId}, ${suggestionId}, ${vehicleId}, 0)
    `)

    const disposition = await handleRouteOptimization({
      attempt: 1,
      job: { companyId, correlationId: 'holiday-e2e', suggestionId },
      maxAttempts: 3,
      ports: createRouteOptimizationPorts({
        matrix: constantMatrix(),
        repository: createDrizzleRouteOptimizationRepository(db),
      }),
    })
    expect(disposition).toBe('ack')

    const [suggestion] = (await db.execute(sql`
      select "status" from route_suggestions where "id" = ${suggestionId}
    `)) as unknown as { readonly status: string }[]
    expect(suggestion?.status).toBe('ready')

    const stops = (await db.execute(sql`
      select "address_key", "violations" from route_suggestion_stops
      where "suggestion_id" = ${suggestionId}
    `)) as unknown as {
      readonly address_key: string
      readonly violations: readonly { readonly kind: string }[]
    }[]
    expect(stops).toHaveLength(documentIndexes.length)

    return stops
      .filter((stop) => stop.violations.some((violation) => violation.kind === 'delivery_window'))
      .map((stop) => stop.address_key)
      .sort()
  }
})

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function shiftDays(isoDate: string, days: number): string {
  const shifted = new Date(`${isoDate}T12:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() + days)

  return shifted.toISOString().slice(0, 10)
}

function constantMatrix(): RoutingMatrixPort {
  return {
    async table(coordinates) {
      const size = coordinates.length
      const grid = (value: number): number[][] =>
        Array.from({ length: size }, (_unused, row) =>
          Array.from({ length: size }, (_cell, column) => (row === column ? 0 : value)),
        )

      return { distancesMeters: grid(5_000), durationsSeconds: grid(400) }
    },
  }
}
