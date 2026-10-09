/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

import {
  IDENTITY_FILES,
  listIntegrationFiles,
  partitionByWeight,
} from '../scripts/integration-shard.js'

function readCiShardCount(): number {
  const workflow = readFileSync('../../.github/workflows/ci.yml', 'utf8')
  const listed = /shard: \[([\d, ]+)\]/.exec(workflow)?.[1]
  if (listed === undefined) throw new Error('matrix.shard not found in ci.yml')
  return listed.split(',').length
}

describe('integration shard partition', () => {
  test('places every file in exactly one shard', () => {
    const files = ['./a', './b', './c', './d', './e']
    const shards = partitionByWeight({ files, weights: { './a': 50 }, shardCount: 3 })
    expect(shards.flat().sort()).toEqual([...files].sort())
  })

  test('balances by weight instead of by file count', () => {
    const weights = { './heavy': 100, './m1': 40, './m2': 40, './l1': 10, './l2': 10 }
    const shards = partitionByWeight({ files: Object.keys(weights), weights, shardCount: 2 })
    const totals = shards.map((shard) =>
      shard.reduce((sum, file) => sum + (weights[file as keyof typeof weights] ?? 0), 0),
    )
    expect(Math.abs((totals[0] ?? 0) - (totals[1] ?? 0))).toBeLessThanOrEqual(10)
  })

  test('is deterministic', () => {
    const params = { files: ['./x', './y', './z'], weights: {}, shardCount: 2 }
    expect(partitionByWeight(params)).toEqual(partitionByWeight(params))
  })

  test('every integration file in package.json is covered by exactly one shard', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    const files = listIntegrationFiles(packageJson.scripts['test:integration'] ?? '')
    const regular = files.filter((file) => !IDENTITY_FILES.includes(file))
    const shards = partitionByWeight({ files: regular, weights: {}, shardCount: 4 })
    expect([...shards.flat(), ...IDENTITY_FILES].sort()).toEqual([...files].sort())
  })

  test('the CI matrix and the /N it passes to the script say the same number of shards', () => {
    const workflow = readFileSync('../../.github/workflows/ci.yml', 'utf8')
    const counts = [...workflow.matchAll(/\$\{\{ matrix\.shard \}\}\/(\d+)/g)].map((match) =>
      Number(match[1]),
    )
    expect(counts.length).toBeGreaterThanOrEqual(2)
    expect(new Set(counts)).toEqual(new Set([readCiShardCount()]))
  })

  test('with the committed weights the heaviest shard leaves room under the CI job timeout', () => {
    // timeout-minutes: 15 (900s) menos ~150s de preparo (checkout, install, postgres, migrate).
    const maxTestSeconds = 750
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts: Record<string, string>
    }
    const weights = JSON.parse(
      readFileSync('test/integration/shard-weights.json', 'utf8'),
    ) as Record<string, number>
    const files = listIntegrationFiles(packageJson.scripts['test:integration'] ?? '').filter(
      (file) => !IDENTITY_FILES.includes(file),
    )
    const totals = partitionByWeight({ files, weights, shardCount: readCiShardCount() }).map(
      (shard) => shard.reduce((sum, file) => sum + (weights[file] ?? 5), 0),
    )
    expect(Math.max(...totals)).toBeLessThanOrEqual(maxTestSeconds)
  })
})
