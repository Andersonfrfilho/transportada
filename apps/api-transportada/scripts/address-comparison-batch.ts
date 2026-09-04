/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { createCompareAddressesBatchUseCase } from '../src/addresses/application/compare-addresses-batch.use-case.js'
import {
  createDrizzleAddressComparisonRepository,
  createDrizzleCityDirectory,
} from '../src/addresses/infrastructure/drizzle-address-comparison.repository.js'
import { createGoogleAddressLookupGateway } from '../src/addresses/infrastructure/google-address-lookup.gateway.js'
import { GEOCODING_PRECISIONS, type GeocodingPrecision } from '../src/database/database.schema.js'

/**
 * O lote de medição da **ADR-0061**, e o gatilho dela.
 *
 * ⚠️ **A ADR autoriza "uma execução decidida por uma pessoa, com escopo e custo declarados antes".
 * É este arquivo que faz disso uma coisa executável, e não uma intenção.** Sem `--confirm` ele
 * imprime o escopo e o custo e sai sem gastar um centavo. Uma rota HTTP no lugar disto seria a
 * escalada que o adendo da ADR-0044 recusou usando outro nome: qualquer coisa capaz de chamá-la
 * passaria a gastar.
 *
 *   bun scripts/address-comparison-batch.ts --precision city --limit 200
 *   bun scripts/address-comparison-batch.ts --precision city --limit 200 --confirm
 */
const USD_PER_LOOKUP = 0.005

async function main(): Promise<void> {
  const options = parseArguments(process.argv.slice(2))

  const databaseUrl = process.env.DATABASE_URL ?? ''
  const apiKey = process.env.GOOGLE_MAPS_API_KEY ?? ''
  if (databaseUrl.length === 0) throw new Error('DATABASE_URL ausente')
  if (apiKey.length === 0) throw new Error('GOOGLE_MAPS_API_KEY ausente')

  const provider = createDrizzleProvider({ connection: databaseUrl })
  const comparisons = createDrizzleAddressComparisonRepository(provider.db)

  const companyId = options.companyId ?? (await resolveSingleCompany(provider.db))
  const candidates = await comparisons.findCandidates({
    companyId,
    limit: options.limit,
    precisions: options.precisions,
  })

  process.stdout.write(
    [
      `empresa      ${companyId}`,
      `precisão     ${options.precisions.join(', ')}`,
      `a medir      ${candidates.length} endereço(s) — já medidos ficam de fora`,
      `custo        ~US$ ${(candidates.length * USD_PER_LOOKUP).toFixed(2)}`,
      '',
    ].join('\n'),
  )

  if (!options.confirm) {
    process.stdout.write('nada foi consultado. repita com --confirm para executar.\n')
    return
  }

  const useCase = createCompareAddressesBatchUseCase({
    cityDirectory: createDrizzleCityDirectory(provider.db, companyId),
    comparisons,
    lookup: createGoogleAddressLookupGateway({ apiKey }),
  })

  const summary = await useCase.run({
    companyId,
    limit: options.limit,
    precisions: options.precisions,
  })

  process.stdout.write(
    [
      '',
      `medidos            ${summary.compared}`,
      `pulados (falha)    ${summary.skipped}`,
      `  rooftop            ${summary.byMatchLevel.rooftop}`,
      `  range_interpolated ${summary.byMatchLevel.range_interpolated}`,
      `  approximate        ${summary.byMatchLevel.approximate}`,
      `  not_found          ${summary.byMatchLevel.not_found}`,
      `rua divergente     ${summary.streetDiverging}`,
      `CEP divergente     ${summary.postalCodeDiverging}`,
      `bairro divergente  ${summary.districtDiverging}`,
      `outro município    ${summary.cityMismatches}`,
      '',
    ].join('\n'),
  )
}

type Options = Readonly<{
  companyId: null | string
  confirm: boolean
  limit: number
  precisions: readonly GeocodingPrecision[]
}>

function parseArguments(argv: readonly string[]): Options {
  const value = (name: string): null | string => {
    const index = argv.indexOf(`--${name}`)
    return index === -1 ? null : (argv[index + 1] ?? null)
  }

  const precision = value('precision')
  if (precision !== null && !GEOCODING_PRECISIONS.includes(precision as GeocodingPrecision)) {
    throw new Error(`precisão desconhecida: ${precision}`)
  }

  return {
    companyId: value('company'),
    confirm: argv.includes('--confirm'),
    limit: Number(value('limit') ?? '50'),
    precisions: precision === null ? GEOCODING_PRECISIONS : [precision as GeocodingPrecision],
  }
}

/** Instalação dedicada (ADR-0021): uma empresa é o caso normal, e duas exigem `--company`. */
async function resolveSingleCompany(
  database: ReturnType<typeof createDrizzleProvider>['db'],
): Promise<string> {
  const { companies } = await import('../src/database/database.schema.js')
  const rows = await database.select({ id: companies.id }).from(companies).limit(2)
  const [first] = rows
  if (first === undefined) throw new Error('nenhuma empresa na base')
  if (rows.length > 1) throw new Error('mais de uma empresa: informe --company <uuid>')

  return first.id
}

await main()
