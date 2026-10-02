/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { readFileSync } from 'node:fs'

const DEFAULT_FILE_WEIGHT_SECONDS = 5

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
  const { index, count } = parseShardArgument(process.argv[2])
  const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts: Record<string, string>
  }
  const weights = JSON.parse(readFileSync('test/integration/shard-weights.json', 'utf8')) as Record<
    string,
    number
  >
  const files = listIntegrationFiles(packageJson.scripts['test:integration'] ?? '')
  const shard = partitionByWeight({ files, weights, shardCount: count })[index - 1] ?? []
  process.stdout.write(`${shard.join(' ')}\n`)
}

if (import.meta.main) main()
