/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O extrator de praças da spec 090, T2 — passo do runbook `docs/runbooks/osrm-extract.md`, não
 * chamada de rede em tempo de execução. Lê `barrier=toll_booth` do `.osm.pbf` que já alimenta o
 * OSRM e emite cada praça com o `charge` decomposto em `charge_per_axle` (`hgv/axle`) e `charge_car`
 * (`motorcar`).
 *
 * Duas etapas de `osmium`, cada uma lendo a saída da anterior — o mesmo padrão de duas fases do
 * pipeline MLD do OSRM:
 *
 *   osmium tags-filter <pbf> n/barrier=toll_booth -o <tmp>          # só os nós de praça
 *   osmium export <tmp> -f jsonseq -u type_id -o -                  # um GeoJSON Feature por linha
 *
 * `-u type_id` é o que preserva o id do nó (`"n33554488"`) na saída — sem ele a praça perde a
 * identidade que a D1 usa para casar com a rota, e vira `"counter"` sequencial sem sentido nenhum.
 *
 *   bun scripts/toll-booth-extract.ts --pbf deploy/osrm/data/ribeirao.osm.pbf
 *   bun scripts/toll-booth-extract.ts --pbf deploy/osrm/data/ribeirao.osm.pbf --out /tmp/booths.json
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { mapOsmTollBoothFeature } from '../src/toll-booths/domain/osm-toll-booth.mapper.js'
import type {
  OsmTollBoothFeature,
  TollBoothExtractRecord,
} from '../src/toll-booths/domain/osm-toll-booth.types.js'

const OSMIUM_BINARY = 'osmium'

export function extractTollBooths(pbfPath: string): readonly TollBoothExtractRecord[] {
  const workingDirectory = mkdtempSync(join(tmpdir(), 'toll-booth-extract-'))
  const filteredPbfPath = join(workingDirectory, 'toll-booths.osm.pbf')

  try {
    execFileSync(OSMIUM_BINARY, [
      'tags-filter',
      pbfPath,
      'n/barrier=toll_booth',
      '-o',
      filteredPbfPath,
      '--overwrite',
    ])

    const jsonSeq = execFileSync(OSMIUM_BINARY, [
      'export',
      filteredPbfPath,
      '-f',
      'jsonseq',
      '-u',
      'type_id',
      '-o',
      '-',
    ]).toString('utf8')

    return parseJsonSeq(jsonSeq).map(mapOsmTollBoothFeature)
  } finally {
    rmSync(workingDirectory, { force: true, recursive: true })
  }
}

/** RFC 7464: cada registro é prefixado por RS (`\x1e`) — sem tirá-lo o `JSON.parse` recusa a linha. */
const RECORD_SEPARATOR = String.fromCharCode(0x1e)

function parseJsonSeq(jsonSeq: string): readonly OsmTollBoothFeature[] {
  return jsonSeq
    .split('\n')
    .map((line) => line.replace(RECORD_SEPARATOR, '').trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as OsmTollBoothFeature)
}

function summarize(booths: readonly TollBoothExtractRecord[]): string {
  const withCharge = booths.filter((booth) => booth.chargeCar !== null).length
  const withAxleCharge = booths.filter((booth) => booth.chargePerAxle !== null).length

  return [
    `praças              ${booths.length}`,
    `com tarifa          ${withCharge}`,
    `com tarifa por eixo ${withAxleCharge}`,
    '',
  ].join('\n')
}

function parseArguments(argv: readonly string[]): Readonly<{ out: null | string; pbf: string }> {
  const value = (name: string): null | string => {
    const index = argv.indexOf(`--${name}`)
    return index === -1 ? null : (argv[index + 1] ?? null)
  }

  const pbf = value('pbf')
  if (pbf === null) throw new Error('--pbf <caminho> é obrigatório')

  return { out: value('out'), pbf }
}

if (import.meta.main) {
  const options = parseArguments(process.argv.slice(2))
  const booths = extractTollBooths(options.pbf)

  process.stdout.write(summarize(booths))

  if (options.out !== null) {
    writeFileSync(
      options.out,
      JSON.stringify(
        booths,
        (_key, value) => (typeof value === 'bigint' ? value.toString() : value),
        2,
      ),
    )
    process.stdout.write(`gravado em ${options.out}\n`)
  }
}
