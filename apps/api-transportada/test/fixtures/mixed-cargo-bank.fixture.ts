/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { PlacementBox } from '../../src/trips/domain/cargo-placement.policy.js'

/**
 * Spec 139: **o banco de carga mista toda medida**, gerado por semente.
 *
 * ⚠️ As specs 115–136 foram validadas sempre contra as mesmas quatro viagens, com a caixa presumida de
 * 371 × 261 × 210 mm, e o empacotador ficou ajustado àquela medida: com a presumida mudando 2–4 mm, só 4
 * de 168 variações do Atego colocavam todas as caixas. No uso real toda caixa é medida antes da montagem
 * (aba Caixas), e cada medida é um tamanho novo — carga com muitos tamanhos é o caso de projeto, não a
 * exceção. Este banco é o que toda mudança no empacotador tem de passar, além das quatro viagens.
 *
 * As formas saem das seis caixas medidas da base (2026-09-11) e de caixas plausíveis de 15 a 60 cm; o
 * sorteio é determinístico, e a mesma semente dá sempre a mesma carga.
 */
export const REAL_MEASURED_SHAPES: readonly (readonly [number, number, number])[] = [
  [310, 230, 220],
  [340, 240, 200],
  [360, 260, 210],
  [380, 280, 220],
  [385, 260, 210],
  [400, 300, 250],
]

export type MixedBed = Readonly<{
  bed: Readonly<{
    heightM: string
    lengthM: string
    source: 'measured' | 'reference'
    widthM: string
  }>
  loadingAccess: 'rear' | 'rear_and_side'
  name: string
  payloadRatio: string
}>

/** Os quatro baús das viagens reais, com o teto de massa de cada uma. */
export const MIXED_BEDS: readonly MixedBed[] = [
  {
    bed: { heightM: '1.800', lengthM: '4.200', source: 'measured', widthM: '2.100' },
    loadingAccess: 'rear',
    name: 'Daily',
    payloadRatio: '0.9007',
  },
  {
    bed: { heightM: '1.900', lengthM: '3.400', source: 'measured', widthM: '1.780' },
    loadingAccess: 'rear_and_side',
    name: 'Sprinter',
    payloadRatio: '0.9789',
  },
  {
    bed: { heightM: '2.200', lengthM: '5.320', source: 'reference', widthM: '2.080' },
    loadingAccess: 'rear',
    name: 'Accelo',
    payloadRatio: '0.6144',
  },
  {
    bed: { heightM: '2.300', lengthM: '7.400', source: 'measured', widthM: '2.470' },
    loadingAccess: 'rear',
    name: 'Atego',
    payloadRatio: '0.9897',
  },
]

/** Mulberry32: pequeno, determinístico e sem dependência. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

export type MixedLoadInput = Readonly<{
  bed: MixedBed['bed']
  /** Fração do volume do baú que a carga pede. */
  occupancy: number
  seed: number
  shapeCount: number
  stopCount?: number
}>

export type MixedLoad = Readonly<{
  boxes: readonly PlacementBox[]
  shapes: readonly (readonly [number, number, number])[]
}>

/** Uma carga toda medida, com `shapeCount` tamanhos distintos repartidos por `stopCount` entregas. */
export function createMixedLoad(input: MixedLoadInput): MixedLoad {
  const stopCount = input.stopCount ?? 20
  const random = createRandom(
    input.seed * 7919 + input.shapeCount * 131 + Math.round(input.occupancy * 100),
  )
  const shapes: (readonly [number, number, number])[] = []
  for (let index = 0; index < input.shapeCount; index += 1) {
    const real = REAL_MEASURED_SHAPES[index]
    if (real !== undefined && random() < 0.5) {
      shapes.push(real)
      continue
    }
    const first = 150 + Math.round(random() * 450)
    const second = 150 + Math.round(random() * 450)
    const height = 150 + Math.round(random() * 300)
    shapes.push([Math.max(first, second), Math.min(first, second), height])
  }
  const bedVolumeM3 =
    Number(input.bed.lengthM) * Number(input.bed.widthM) * Number(input.bed.heightM)
  const counts = new Map<string, number>()
  let volumeM3 = 0
  while (volumeM3 < bedVolumeM3 * input.occupancy) {
    const stop = Math.floor(random() * stopCount) + 1
    const shapeIndex = Math.floor(random() * input.shapeCount)
    const shape = shapes[shapeIndex]
    if (shape === undefined) break
    const key = `${String(stop)}|${String(shapeIndex)}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
    volumeM3 += (shape[0] * shape[1] * shape[2]) / 1e9
  }

  return { boxes: toBoxes(counts, shapes), shapes }
}

function toBoxes(
  counts: ReadonlyMap<string, number>,
  shapes: readonly (readonly [number, number, number])[],
): readonly PlacementBox[] {
  const boxes: PlacementBox[] = []
  for (const [key, count] of counts) {
    const [stop, shapeIndex] = key.split('|').map(Number)
    const shape = shapes[shapeIndex ?? 0]
    if (shape === undefined || stop === undefined) continue
    boxes.push({
      count,
      heightMm: shape[2],
      isFragile: null,
      isStackable: null,
      keepUpright: null,
      label: `P${String(stop)}`,
      lengthMm: shape[0],
      maxStackCount: null,
      source: 'measured',
      stopSequence: stop,
      widthMm: shape[1],
    })
  }

  return boxes.sort((first, second) => first.stopSequence - second.stopSequence)
}

/** A mesma carga, com uma medida de uma forma mexida em `deltaMm` — a pergunta da estabilidade. */
export function nudgeShape(
  load: MixedLoad,
  input: Readonly<{
    axis: 'heightMm' | 'lengthMm' | 'widthMm'
    deltaMm: number
    shapeIndex: number
  }>,
): readonly PlacementBox[] {
  const shape = load.shapes[input.shapeIndex]
  if (shape === undefined) return load.boxes

  return load.boxes.map((box) =>
    box.lengthMm === shape[0] && box.widthMm === shape[1] && box.heightMm === shape[2]
      ? { ...box, [input.axis]: (box[input.axis] ?? 0) + input.deltaMm }
      : box,
  )
}
