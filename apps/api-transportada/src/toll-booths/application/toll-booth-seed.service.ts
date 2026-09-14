/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'

import { createDrizzleTollBoothRepository } from '../infrastructure/drizzle-toll-booth.repository.js'

import { createSeedTollBoothsUseCase } from './seed-toll-booths.use-case.js'
import type { TollBoothSeedRecord } from './toll-booth.port.js'

/**
 * Carrega o extract da spec 090 (T2, `scripts/toll-booth-extract.ts --out <arquivo>`) no banco.
 * Reexecutar não duplica: o upsert é por `osm_node_id` (D1).
 *
 * `observedOn` **não** vem do extract — o JSON de `toll-booth-extract.ts` guarda só a praça, nunca
 * a data em que o extrator rodou (`toll-booth.schema.ts`: a data é do extract, uma só para todas as
 * linhas, não por nó). Ela é obrigatória aqui, e a chamada de linha de comando a preenche com o dia
 * de hoje quando ninguém a informa.
 *
 *   bun src/toll-booths/application/toll-booth-seed.service.ts --input /tmp/toll-booths-extract.json
 *   bun src/toll-booths/application/toll-booth-seed.service.ts --input /tmp/x.json --observed-on 2026-09-07
 */
export async function runTollBoothSeed({
  connectionString,
  extract,
  observedOn,
}: {
  readonly connectionString: string
  readonly extract: readonly (Omit<TollBoothSeedRecord, 'observedOn' | 'osmNodeId'> & {
    readonly osmNodeId: bigint | string
  })[]
  readonly observedOn: string
}): Promise<{ readonly saved: number }> {
  if (connectionString.length === 0) {
    throw new Error('DATABASE_URL is required to seed the toll booths')
  }
  if (extract.length === 0) throw new Error('Toll booth extract is empty')

  const booths: readonly TollBoothSeedRecord[] = extract.map((booth) => ({
    ...booth,
    observedOn,
    osmNodeId: BigInt(booth.osmNodeId),
  }))

  const provider = createDrizzleProvider({
    connection: { adapter: 'postgres', max: 1, url: connectionString },
  })

  try {
    const useCase = createSeedTollBoothsUseCase({
      repository: createDrizzleTollBoothRepository(provider.db),
    })

    return await useCase.save(booths)
  } finally {
    await provider.close()
  }
}

function parseArguments(argv: readonly string[]): Readonly<{ input: string; observedOn: string }> {
  const value = (name: string): null | string => {
    const index = argv.indexOf(`--${name}`)
    return index === -1 ? null : (argv[index + 1] ?? null)
  }

  const input = value('input')
  if (input === null) throw new Error('--input <arquivo> é obrigatório')

  return { input, observedOn: value('observed-on') ?? todayIsoDate() }
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

if (import.meta.main) {
  const options = parseArguments(process.argv.slice(2))
  const extract = (await Bun.file(options.input).json()) as readonly (Omit<
    TollBoothSeedRecord,
    'observedOn' | 'osmNodeId'
  > & { readonly osmNodeId: string })[]

  const { saved } = await runTollBoothSeed({
    connectionString: process.env.DATABASE_URL ?? '',
    extract,
    observedOn: options.observedOn,
  })
  process.stdout.write(`toll booths seeded: ${saved}\n`)
}
