/**
 * Recupera dimensões perdidas pelo bug do toCellNumber (v1.8.0): células com
 * sufixo de unidade ("250,0 cm") viravam NaN → edges {}. As rows capturadas já
 * contêm os valores; basta recomputar edges com o parser corrigido. Não navega.
 *
 * Uso: bun scripts/box-catalog-harvest/recover-captured-dims.ts
 * Faz backup do JSONL em <arquivo>.bak-<timestamp> antes de reescrever.
 */

import { readFileSync, writeFileSync, copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const JSONL_PATH = join(
  homedir(),
  'Library',
  'Application Support',
  'transportada',
  'box-catalog-harvest.jsonl',
)

const MISSING_CELL = /^[-–—]?$/
const UNIT_SUFFIX = /\s*(?:cm|mm|m|kg|g)\s*$/i

function toCellNumber(cell) {
  if (MISSING_CELL.test(cell)) return undefined
  const value = Number(cell.replace(UNIT_SUFFIX, '').replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? cell : undefined
}

const cellUnit = (cell) => ((cell || '').match(/(cm|mm|m|kg|g)\s*$/i)?.[1] ?? 'cm').toLowerCase()

function cartonRow(rows) {
  return (
    rows?.find((cells) => /^[1-8]\d{13}$/.test(cells[0])) ??
    rows?.find((cells) => Number(cells[2]) > 1)
  )
}

function recoverEdges(record) {
  const rows = record.extracted?.rows
  const carton = cartonRow(rows)
  if (!carton) return { count: 0 }
  const dimensionCells = carton.slice(5, 8).map(toCellNumber)
  const edges = dimensionCells.every(Boolean)
    ? {
        comprimento: { value: dimensionCells[0], unit: cellUnit(carton[5]) },
        altura: { value: dimensionCells[1], unit: cellUnit(carton[6]) },
        largura: { value: dimensionCells[2], unit: cellUnit(carton[7]) },
      }
    : {}
  return {
    count: Object.keys(edges).length,
    edges,
    grossWeight: toCellNumber(carton[8])
      ? { value: carton[8], unit: cellUnit(carton[8]) || 'kg' }
      : undefined,
    netWeight: toCellNumber(carton[9])
      ? { value: carton[9], unit: cellUnit(carton[9]) || 'kg' }
      : undefined,
    unitsPerCarton: Number(carton[2]) || undefined,
    palletLayerCount: Number(carton[3]) || undefined,
    layerCount: Number(carton[4]) || undefined,
    cartonGtin: carton[0],
    packaging: carton[1],
  }
}

const lines = readFileSync(JSONL_PATH, 'utf8').trim().split('\n')
let recovered = 0
let madeEdges = 0
let hadEdges = 0
const output = lines.map((line) => {
  const record = JSON.parse(line)
  const before = Object.keys(record.extracted?.edges ?? {}).length
  const { count, ...recovery } = recoverEdges(record)
  if (count >= 3) {
    if (before < 3) {
      record.extracted.edges = recovery.edges
      if (recovery.grossWeight) record.extracted.grossWeight = recovery.grossWeight
      if (recovery.netWeight) record.extracted.netWeight = recovery.netWeight
      record.extracted.unitsPerCarton = recovery.unitsPerCarton ?? record.extracted.unitsPerCarton
      record.extracted.palletLayerCount =
        recovery.palletLayerCount ?? record.extracted.palletLayerCount
      record.extracted.layerCount = recovery.layerCount ?? record.extracted.layerCount
      record.extracted.cartonGtin = recovery.cartonGtin
      record.extracted.packaging = recovery.packaging
      record.status = 'found'
      record.recovered = { from: 'toCellNumber-v1.8.0-bug', at: new Date().toISOString() }
      recovered++
    } else {
      hadEdges++
    }
  }
  return JSON.stringify(record)
})
madeEdges = recovered

if (recovered === 0) {
  console.log('Nenhum registro precisava de recuperação.')
  process.exit(0)
}

const backup = `${JSONL_PATH}.bak-${new Date().toISOString().replace(/[:.]/g, '-')}`
copyFileSync(JSONL_PATH, backup)
writeFileSync(JSONL_PATH, `${output.join('\n')}\n`)

console.log(JSON.stringify({ recovered, hadEdges, backup, total: lines.length }, null, 2))
