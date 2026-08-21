/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, desc, eq, exists, ilike, inArray, lt, or } from 'drizzle-orm'

import {
  freightRegionCities,
  freightRegionDriverRates,
  freightRegions,
} from '../../database/database.schema.js'
import type { FreightRegionStatus } from '../../database/freight-region.schema.js'
import { violatedUniqueConstraint } from '../../database/postgres-error.support.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import type {
  FreightRegion,
  FreightRegionFilters,
  FreightRegionInput,
  FreightRegionPage,
  FreightRegionRepositoryPort,
} from '../application/freight-region.port.js'
import { FreightRegionCodeTakenError } from '../domain/freight-region.error.js'
import { mapRegion, toCityColumns, toRegionColumns } from './freight-region.mapper.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

type RegionRecord = typeof freightRegions.$inferSelect
type CityRecord = typeof freightRegionCities.$inferSelect
type RateRecord = typeof freightRegionDriverRates.$inferSelect

const CODE_CONSTRAINT = 'freight_regions_company_id_code_unique'

export class DrizzleFreightRegionRepository implements FreightRegionRepositoryPort {
  public constructor(private readonly database: Database) {}

  public async create(input: {
    readonly companyId: string
    readonly region: FreightRegionInput
  }): Promise<FreightRegion> {
    return runGuarded(async () =>
      // Rota, cidades e valores nascem juntos: rota sem preço já é rota que fatura errado
      this.database.transaction(async (transaction) => {
        const [record] = await transaction
          .insert(freightRegions)
          .values({ ...toRegionColumns(input.region), companyId: input.companyId })
          .returning()
        if (record === undefined) throw new Error('FREIGHT_REGION_CREATE_FAILED')
        const { cities, rates } = await this.writeChildren({
          record,
          region: input.region,
          transaction,
        })
        return mapRegion({ cities, rates, record })
      }),
    )
  }

  public async delete(input: {
    readonly companyId: string
    readonly regionId: string
  }): Promise<boolean> {
    const removed = await this.database
      .delete(freightRegions)
      .where(
        and(eq(freightRegions.companyId, input.companyId), eq(freightRegions.id, input.regionId)),
      )
      .returning({ id: freightRegions.id })
    return removed.length > 0
  }

  public async findById(input: {
    readonly companyId: string
    readonly regionId: string
  }): Promise<FreightRegion | null> {
    const [record] = await this.database
      .select()
      .from(freightRegions)
      .where(
        and(eq(freightRegions.companyId, input.companyId), eq(freightRegions.id, input.regionId)),
      )
      .limit(1)
    if (record === undefined) return null

    const [cities, rates] = await Promise.all([
      this.readCities(input.companyId, [record.id]),
      this.readRates(input.companyId, [record.id]),
    ])
    return mapRegion({ cities, rates, record })
  }

  /**
   * Três consultas para a página inteira — rotas, cidades, valores —, nunca três por rota. Buscar
   * cidade dentro do `map` devolve exatamente o mesmo corpo e transforma a tela da tabela de frete
   * do cliente (84 cidades) em centenas de idas ao banco.
   */
  public async list(input: {
    readonly companyId: string
    readonly cursor: string | null
    readonly filters?: FreightRegionFilters
    readonly limit: number
  }): Promise<FreightRegionPage> {
    const cursor = decodeKeysetCursor(input.cursor)
    const records = await this.database
      .select()
      .from(freightRegions)
      .where(
        and(
          eq(freightRegions.companyId, input.companyId),
          cursor === null
            ? undefined
            : or(
                lt(freightRegions.createdAt, cursor.createdAt),
                and(
                  eq(freightRegions.createdAt, cursor.createdAt),
                  lt(freightRegions.id, cursor.id),
                ),
              ),
          input.filters?.statusEq === undefined
            ? undefined
            : eq(freightRegions.status, input.filters.statusEq),
          input.filters?.cityContains === undefined
            ? undefined
            : exists(
                this.database
                  .select({ id: freightRegionCities.id })
                  .from(freightRegionCities)
                  .where(
                    and(
                      eq(freightRegionCities.companyId, input.companyId),
                      eq(freightRegionCities.regionId, freightRegions.id),
                      ilike(freightRegionCities.city, `%${input.filters.cityContains}%`),
                    ),
                  ),
              ),
        ),
      )
      .orderBy(desc(freightRegions.createdAt), desc(freightRegions.id))
      .limit(input.limit + 1)

    const pageRecords = records.slice(0, input.limit)
    const last = pageRecords.at(-1)
    const nextCursor =
      records.length > input.limit && last !== undefined ? encodeKeysetCursor(last) : null
    if (pageRecords.length === 0) return { items: [], nextCursor }

    const regionIds = pageRecords.map((record) => record.id)
    const [cities, rates] = await Promise.all([
      this.readCities(input.companyId, regionIds),
      this.readRates(input.companyId, regionIds),
    ])
    const citiesByRegion = groupByRegion(cities)
    const ratesByRegion = groupByRegion(rates)

    return {
      items: pageRecords.map((record) =>
        mapRegion({
          cities: citiesByRegion.get(record.id) ?? [],
          rates: ratesByRegion.get(record.id) ?? [],
          record,
        }),
      ),
      nextCursor,
    }
  }

  /**
   * A importação compara o arquivo inteiro com o cadastro inteiro: paginar aqui daria diff parcial,
   * e rota fora da página seria lida como rota que sumiu do arquivo — inativada sem motivo.
   */
  public async listAll(input: { readonly companyId: string }): Promise<readonly FreightRegion[]> {
    const records = await this.database
      .select()
      .from(freightRegions)
      .where(eq(freightRegions.companyId, input.companyId))
      .orderBy(asc(freightRegions.code))
    if (records.length === 0) return []

    const regionIds = records.map((record) => record.id)
    const [cities, rates] = await Promise.all([
      this.readCities(input.companyId, regionIds),
      this.readRates(input.companyId, regionIds),
    ])
    const citiesByRegion = groupByRegion(cities)
    const ratesByRegion = groupByRegion(rates)

    return records.map((record) =>
      mapRegion({
        cities: citiesByRegion.get(record.id) ?? [],
        rates: ratesByRegion.get(record.id) ?? [],
        record,
      }),
    )
  }

  public async update(input: {
    readonly companyId: string
    readonly expectedVersion: string
    readonly region: FreightRegionInput
    readonly regionId: string
    readonly status: FreightRegionStatus
  }): Promise<FreightRegion | null> {
    return runGuarded(async () =>
      this.database.transaction(async (transaction) => {
        const [record] = await transaction
          .update(freightRegions)
          .set({
            ...toRegionColumns(input.region),
            status: input.status,
            updatedAt: new Date(),
            version: BigInt(input.expectedVersion) + 1n,
          })
          .where(
            and(
              eq(freightRegions.companyId, input.companyId),
              eq(freightRegions.id, input.regionId),
              eq(freightRegions.version, BigInt(input.expectedVersion)),
            ),
          )
          .returning()
        if (record === undefined) return null

        // Substituir é a operação: cidade retirada da tabela do cliente deixa de valer no mesmo passo
        await transaction
          .delete(freightRegionCities)
          .where(
            and(
              eq(freightRegionCities.companyId, input.companyId),
              eq(freightRegionCities.regionId, record.id),
            ),
          )
        await transaction
          .delete(freightRegionDriverRates)
          .where(
            and(
              eq(freightRegionDriverRates.companyId, input.companyId),
              eq(freightRegionDriverRates.regionId, record.id),
            ),
          )
        const { cities, rates } = await this.writeChildren({
          record,
          region: input.region,
          transaction,
        })
        return mapRegion({ cities, rates, record })
      }),
    )
  }

  private async writeChildren(input: {
    readonly record: RegionRecord
    readonly region: FreightRegionInput
    readonly transaction: Transaction
  }): Promise<{ readonly cities: readonly CityRecord[]; readonly rates: readonly RateRecord[] }> {
    const { record, region, transaction } = input
    const cities =
      region.cities.length === 0
        ? []
        : await transaction
            .insert(freightRegionCities)
            .values(
              region.cities.map((city) => ({
                ...toCityColumns(city),
                companyId: record.companyId,
                regionId: record.id,
              })),
            )
            .returning()
    const rates =
      region.rates.length === 0
        ? []
        : await transaction
            .insert(freightRegionDriverRates)
            .values(
              region.rates.map((rate) => ({
                companyId: record.companyId,
                driverAmount: rate.driverAmount,
                freightClass: rate.freightClass,
                regionId: record.id,
              })),
            )
            .returning()

    return { cities: sortCities(cities), rates: sortRates(rates) }
  }

  private async readCities(
    companyId: string,
    regionIds: readonly string[],
  ): Promise<readonly CityRecord[]> {
    return this.database
      .select()
      .from(freightRegionCities)
      .where(
        and(
          eq(freightRegionCities.companyId, companyId),
          inArray(freightRegionCities.regionId, [...regionIds]),
        ),
      )
      .orderBy(asc(freightRegionCities.city), asc(freightRegionCities.state))
  }

  private async readRates(
    companyId: string,
    regionIds: readonly string[],
  ): Promise<readonly RateRecord[]> {
    return this.database
      .select()
      .from(freightRegionDriverRates)
      .where(
        and(
          eq(freightRegionDriverRates.companyId, companyId),
          inArray(freightRegionDriverRates.regionId, [...regionIds]),
        ),
      )
      .orderBy(asc(freightRegionDriverRates.freightClass))
  }
}

function groupByRegion<TRecord extends { readonly regionId: string }>(
  records: readonly TRecord[],
): ReadonlyMap<string, TRecord[]> {
  const grouped = new Map<string, TRecord[]>()
  for (const record of records) {
    const bucket = grouped.get(record.regionId)
    if (bucket === undefined) grouped.set(record.regionId, [record])
    else bucket.push(record)
  }
  return grouped
}

/** A escrita devolve a lista na mesma ordem da leitura — senão criar e listar discordam. */
function sortCities(records: readonly CityRecord[]): readonly CityRecord[] {
  return [...records].sort(
    (first, second) =>
      first.city.localeCompare(second.city) || first.state.localeCompare(second.state),
  )
}

function sortRates(records: readonly RateRecord[]): readonly RateRecord[] {
  return [...records].sort((first, second) => first.freightClass.localeCompare(second.freightClass))
}

async function runGuarded<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
  try {
    return await operation()
  } catch (error) {
    if (violatedUniqueConstraint(error) === CODE_CONSTRAINT) throw new FreightRegionCodeTakenError()
    throw error
  }
}
