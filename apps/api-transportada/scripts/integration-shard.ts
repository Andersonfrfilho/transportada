/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

const DEFAULT_FILE_WEIGHT_SECONDS = 5

export const IDENTITY_FILES: readonly string[] = [
  './test/integration/auth-me.integration.ts',
  './test/integration/company-user-fleet-link.integration.ts',
  './test/integration/identity-subject-relink.integration.ts',
  './test/integration/local-identity-seed.integration.ts',
  './test/integration/server.integration.ts',
  './test/integration/whatsapp-command-settlement.integration.ts',
  './test/integration/whatsapp-issuance-confirm.integration.ts',
]

type PartitionParams = {
  readonly files: readonly string[]
  readonly weights: Readonly<Record<string, number>>
  readonly shardCount: number
}

export function partitionByWeight({ files, weights, shardCount }: PartitionParams): string[][] {
  const shards: string[][] = Array.from({ length: shardCount }, () => [])
  const totals: number[] = Array.from({ length: shardCount }, () => 0)
  const weightOf = (file: string): number => weights[file] ?? DEFAULT_FILE_WEIGHT_SECONDS
  const heaviestFirst = [...files].sort((a, b) => weightOf(b) - weightOf(a) || a.localeCompare(b))

  for (const file of heaviestFirst) {
    const lightestIndex = totals.indexOf(Math.min(...totals))
    shards[lightestIndex]?.push(file)
    totals[lightestIndex] = (totals[lightestIndex] ?? 0) + weightOf(file)
  }
  return shards
}

export function listIntegrationFiles(testIntegrationScript: string): string[] {
  return testIntegrationScript.match(/\.\/test\/\S+/g) ?? []
}

function parseShardArgument(argument: string | undefined): { index: number; count: number } {
  const match = /^(\d+)\/(\d+)$/.exec(argument ?? '')
  if (!match) throw new Error('uso: bun scripts/integration-shard.ts <índice>/<total>')
  const index = Number(match[1])
  const count = Number(match[2])
  if (index < 1 || index > count) throw new Error(`shard ${argument} fora do intervalo`)
  return { index, count }
}

function main(): void {
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>
  }
  const allFiles = listIntegrationFiles(packageJson.scripts['test:integration'] ?? '')
  if (process.argv[2] === 'identity') {
    process.stdout.write(`${IDENTITY_FILES.join(' ')}\n`)
    return
  }
  const { index, count } = parseShardArgument(process.argv[2])
  const weights = JSON.parse(readFileSync('test/integration/shard-weights.json', 'utf8')) as Record<
    string,
    number
  >
  const files = allFiles.filter((file) => !IDENTITY_FILES.includes(file))
  const shard = partitionByWeight({ files, weights, shardCount: count })[index - 1] ?? []
  process.stdout.write(`${shard.join(' ')}\n`)
}

if (import.meta.main) main()
