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
})
