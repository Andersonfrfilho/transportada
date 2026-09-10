/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  ACCESS_CORRIDOR_M,
  DELIVERY_REACH_M,
  STABLE_STACK_SLENDERNESS,
  type CargoPlacement,
  type PlacedBox,
} from '../../src/trips/domain/cargo-placement.policy.js'

/**
 * Spec 118: **a descarga simulada entrega por entrega**, sobre a planta pronta — a primeira entrega sai,
 * depois a segunda, e assim até a última.
 *
 * ⚠️ É uma conferência **independente do empacotador**: geometria real em grade de 1 cm, sem o mapa de
 * alturas de 5 cm que decidiu as posições. Reusar o mapa do empacotador mediria a implementação contra
 * ela mesma.
 *
 * Duas perguntas, as duas do usuário:
 *
 * 1. **Estabilidade.** Cada caixa que fica precisa de apoio nas faces que ficaram livres: parede do baú
 *    ou caixa que ainda está lá, dentro do vão que segura o giro da pilha (`3b/√10`); ou a coluna livre
 *    não passar de três vezes a menor base, contada de onde a contenção termina. A porta nunca apoia.
 * 2. **Acesso.** A próxima entrega sai inteira por quem fica de pé no piso livre ligado à porta, num
 *    corredor de pelo menos `PERSON_WIDTH_M`, alcançando até `ARM_REACH_M` à frente do corpo, e só a
 *    caixa sem nada presente em cima.
 */

/**
 * O corredor e o alcance são **os mesmos números** do empacotador: a geometria é conferida em separado,
 * mas uma segunda declaração da largura de uma pessoa divergiria calada.
 */
export const PERSON_WIDTH_M = ACCESS_CORRIDOR_M
export const ARM_REACH_M = DELIVERY_REACH_M

/** Trecho de face sem contato mais curto que isto não é eixo de tombamento — a célula do empacotador. */
const UNBRACED_RUN_TOLERANCE_M = 0.05
const STABILITY_CELL_M = 0.01
const ACCESS_CELL_M = 0.05
const EPSILON = 1e-6

export type UnloadingBed = Readonly<{ heightM: number; lengthM: number; widthM: number }>

export type UnsupportedBox = Readonly<{ box: PlacedBox; step: number }>

export type StuckDelivery = Readonly<{ count: number; stopSequence: number; total: number }>

export type UnloadingReport = Readonly<{
  /** Caixas sem apoio, com o passo — quantas entregas já saíram — em que isso acontece. */
  unsupported: readonly UnsupportedBox[]
  /** Entregas que não saem inteiras sem subir na carga nem entrar em corredor estreito. */
  stuck: readonly StuckDelivery[]
}>

export function simulateUnloading(
  placement: CargoPlacement,
  bed: UnloadingBed,
  options: Readonly<{ personWidthM?: number; reachM?: number }> = {},
): UnloadingReport {
  const boxes = placement.layers.flatMap((layer) => layer.boxes)

  return {
    stuck: findStuckDeliveries(boxes, bed, options),
    unsupported: findUnsupportedBoxes(boxes, bed),
  }
}

/**
 * ⚠️ **O estado mais fraco de uma caixa é o passo logo antes da entrega dela.** Quem saiu antes só tira
 * apoio, e ela sai na vez dela — então basta conferi-la com as entregas iguais ou posteriores presentes,
 * uma vez só.
 */
function findUnsupportedBoxes(
  boxes: readonly PlacedBox[],
  bed: UnloadingBed,
): readonly UnsupportedBox[] {
  const columns = Math.ceil(bed.lengthM / STABILITY_CELL_M)
  const lines = Math.ceil(bed.widthM / STABILITY_CELL_M)
  const topM = new Float64Array(columns * lines)
  const stamp = (box: PlacedBox): void => {
    const fromColumn = Math.max(0, Math.ceil(box.xM / STABILITY_CELL_M - 0.5 - 1e-9))
    const toColumn = Math.min(
      columns - 1,
      Math.floor((box.xM + box.depthM) / STABILITY_CELL_M - 0.5 + 1e-9),
    )
    const fromLine = Math.max(0, Math.ceil(box.yM / STABILITY_CELL_M - 0.5 - 1e-9))
    const toLine = Math.min(
      lines - 1,
      Math.floor((box.yM + box.widthM) / STABILITY_CELL_M - 0.5 + 1e-9),
    )
    for (let column = fromColumn; column <= toColumn; column += 1) {
      for (let line = fromLine; line <= toLine; line += 1) {
        const cell = column * lines + line
        topM[cell] = Math.max(topM[cell] ?? 0, box.zM + box.heightM)
      }
    }
  }
  const heightAt = (xM: number, yM: number): number | null => {
    if (yM < 0 || yM >= bed.widthM || xM < 0) return Number.POSITIVE_INFINITY
    if (xM >= bed.lengthM) return null
    const column = Math.min(columns - 1, Math.floor(xM / STABILITY_CELL_M))
    const line = Math.min(lines - 1, Math.floor(yM / STABILITY_CELL_M))
    return topM[column * lines + line] ?? 0
  }

  const unsupported: UnsupportedBox[] = []
  const sequences = [...new Set(boxes.map((box) => box.stopSequence))].sort(
    (first, second) => second - first,
  )
  for (const stopSequence of sequences) {
    const own = boxes.filter((box) => box.stopSequence === stopSequence)
    for (const box of own) stamp(box)
    for (const box of own) {
      if (!isBraced(box, heightAt)) unsupported.push({ box, step: stopSequence - 1 })
    }
  }

  return unsupported
}

type Face = Readonly<{ alongDepth: boolean; faceM: number; sign: 1 | -1 }>

function isBraced(box: PlacedBox, heightAt: (xM: number, yM: number) => number | null): boolean {
  const baseM = Math.min(box.depthM, box.widthM)
  const stackTopM = box.zM + box.heightM
  if (stackTopM <= baseM * STABLE_STACK_SLENDERNESS + EPSILON) return true

  const restraintM = Math.max(0, Math.min(box.zM, stackTopM - baseM * STABLE_STACK_SLENDERNESS))
  const catchGapM = (baseM * STABLE_STACK_SLENDERNESS) / Math.hypot(STABLE_STACK_SLENDERNESS, 1)
  const faces: readonly Face[] = [
    { alongDepth: false, faceM: box.xM + box.depthM, sign: 1 },
    { alongDepth: false, faceM: box.xM, sign: -1 },
    { alongDepth: true, faceM: box.yM + box.widthM, sign: 1 },
    { alongDepth: true, faceM: box.yM, sign: -1 },
  ]

  return faces.every((face) => isFaceBraced({ box, catchGapM, face, heightAt, restraintM }))
}

function isFaceBraced(
  input: Readonly<{
    box: PlacedBox
    catchGapM: number
    face: Face
    heightAt: (xM: number, yM: number) => number | null
    restraintM: number
  }>,
): boolean {
  const { box, face } = input
  const fromM = face.alongDepth ? box.xM : box.yM
  const sizeM = face.alongDepth ? box.depthM : box.widthM
  const samples = Math.max(1, Math.round(sizeM / STABILITY_CELL_M))
  let unbracedM = 0
  for (let sample = 0; sample < samples; sample += 1) {
    const alongM = fromM + (sample + 0.5) * (sizeM / samples)
    if (isPointBraced({ ...input, alongM })) {
      unbracedM = 0
      continue
    }
    unbracedM += sizeM / samples
    if (unbracedM >= UNBRACED_RUN_TOLERANCE_M - 1e-9) return false
  }

  return true
}

function isPointBraced(
  input: Readonly<{
    alongM: number
    catchGapM: number
    face: Face
    heightAt: (xM: number, yM: number) => number | null
    restraintM: number
  }>,
): boolean {
  for (let offsetM = 0.0005; offsetM < input.catchGapM - 1e-9; offsetM += STABILITY_CELL_M / 2) {
    const acrossM = input.face.faceM + input.face.sign * offsetM
    const height = input.face.alongDepth
      ? input.heightAt(input.alongM, acrossM)
      : input.heightAt(acrossM, input.alongM)
    /** A porta: nunca apoia, e o que está além dela não existe. */
    if (height === null) return false
    if (height >= input.restraintM - 1e-9) return true
  }

  return false
}

/**
 * ⚠️ **Quem descarrega fica de pé no piso.** Subir na carga de outra entrega para alcançar a caixa não
 * é descarga, é o acidente que a planta deveria evitar — e é por isso que a caixa em cima de entrega
 * posterior, funda demais para a mão, conta como travada.
 */
function findStuckDeliveries(
  boxes: readonly PlacedBox[],
  bed: UnloadingBed,
  options: Readonly<{ personWidthM?: number; reachM?: number }>,
): readonly StuckDelivery[] {
  const personCells = Math.max(
    1,
    Math.round((options.personWidthM ?? PERSON_WIDTH_M) / ACCESS_CELL_M),
  )
  const reachCells = (options.reachM ?? ARM_REACH_M) / ACCESS_CELL_M
  /** Do lado de fora da porta cabe a pessoa inteira e o braço dela. */
  const outsideCells = personCells + Math.ceil(reachCells) + 1
  const columns = Math.ceil(bed.lengthM / ACCESS_CELL_M - 1e-9) + outsideCells
  const lines = Math.ceil(bed.widthM / ACCESS_CELL_M - 1e-9)
  const floor = new Int32Array(columns * lines)
  const cellsOf = (box: PlacedBox): readonly [number, number, number, number] => [
    Math.floor(box.xM / ACCESS_CELL_M + 1e-6),
    Math.ceil((box.xM + box.depthM) / ACCESS_CELL_M - 1e-6),
    Math.floor(box.yM / ACCESS_CELL_M + 1e-6),
    Math.ceil((box.yM + box.widthM) / ACCESS_CELL_M - 1e-6),
  ]
  const markFloor = (box: PlacedBox, delta: number): void => {
    if (box.zM > EPSILON) return
    const [fromColumn, toColumn, fromLine, toLine] = cellsOf(box)
    for (let column = fromColumn; column < toColumn; column += 1) {
      for (let line = fromLine; line < toLine; line += 1) {
        const cell = column * lines + line
        floor[cell] = (floor[cell] ?? 0) + delta
      }
    }
  }
  for (const box of boxes) markFloor(box, 1)

  const carried = mapBoxesAbove(boxes)
  const present = new Set(boxes)
  const stuck: StuckDelivery[] = []
  const sequences = [...new Set(boxes.map((box) => box.stopSequence))].sort(
    (first, second) => first - second,
  )
  for (const stopSequence of sequences) {
    const pending = new Set(boxes.filter((box) => box.stopSequence === stopSequence))
    const total = pending.size
    for (;;) {
      const body = resolveBodyZone({ columns, floor, lines, personCells })
      const leaving = [...pending].filter(
        (box) =>
          (carried.get(box) ?? []).every((other) => !present.has(other)) &&
          isWithinReach({ body, cells: cellsOf(box), columns, lines, reachCells }),
      )
      if (leaving.length === 0) break
      for (const box of leaving) {
        pending.delete(box)
        present.delete(box)
        markFloor(box, -1)
      }
    }
    if (pending.size > 0) stuck.push({ count: pending.size, stopSequence, total })
    /** A entrega foi feita de algum jeito: o que travou sai à força para a próxima ser conferida. */
    for (const box of pending) {
      present.delete(box)
      markFloor(box, -1)
    }
  }

  return stuck
}

/** Quem está sentado em cima de cada caixa — o que precisa sair antes dela. */
function mapBoxesAbove(boxes: readonly PlacedBox[]): ReadonlyMap<PlacedBox, readonly PlacedBox[]> {
  const byBaseMm = new Map<number, PlacedBox[]>()
  for (const box of boxes) {
    const key = Math.round(box.zM * 1000)
    byBaseMm.set(key, [...(byBaseMm.get(key) ?? []), box])
  }
  const carried = new Map<PlacedBox, readonly PlacedBox[]>()
  for (const box of boxes) {
    const candidates = byBaseMm.get(Math.round((box.zM + box.heightM) * 1000)) ?? []
    carried.set(
      box,
      candidates.filter(
        (other) =>
          other.xM < box.xM + box.depthM - EPSILON &&
          box.xM < other.xM + other.depthM - EPSILON &&
          other.yM < box.yM + box.widthM - EPSILON &&
          box.yM < other.yM + other.widthM - EPSILON,
      ),
    )
  }

  return carried
}

/**
 * O piso que o corpo alcança: toda posição de um quadrado da largura da pessoa, livre de carga e ligado
 * ao lado de fora da porta por posições livres.
 */
function resolveBodyZone(
  input: Readonly<{ columns: number; floor: Int32Array; lines: number; personCells: number }>,
): Uint8Array {
  const { columns, lines, personCells } = input
  const stride = lines + 1
  const occupied = new Int32Array((columns + 1) * stride)
  for (let column = 0; column < columns; column += 1) {
    for (let line = 0; line < lines; line += 1) {
      occupied[(column + 1) * stride + line + 1] =
        ((input.floor[column * lines + line] ?? 0) > 0 ? 1 : 0) +
        (occupied[column * stride + line + 1] ?? 0) +
        (occupied[(column + 1) * stride + line] ?? 0) -
        (occupied[column * stride + line] ?? 0)
    }
  }
  const squareIsFree = (column: number, line: number): boolean => {
    if (column < 0 || line < 0 || column + personCells > columns || line + personCells > lines) {
      return false
    }
    const toColumn = column + personCells
    const toLine = line + personCells
    return (
      (occupied[toColumn * stride + toLine] ?? 0) -
        (occupied[column * stride + toLine] ?? 0) -
        (occupied[toColumn * stride + line] ?? 0) +
        (occupied[column * stride + line] ?? 0) ===
      0
    )
  }

  const reached = new Uint8Array(columns * lines)
  const queue: number[] = []
  for (let line = 0; line + personCells <= lines; line += 1) {
    const column = columns - personCells
    if (!squareIsFree(column, line)) continue
    reached[column * lines + line] = 1
    queue.push(column * lines + line)
  }
  while (queue.length > 0) {
    const cell = queue.pop() ?? 0
    const column = Math.floor(cell / lines)
    const line = cell % lines
    for (const [stepColumn, stepLine] of NEIGHBOUR_STEPS) {
      const nextColumn = column + stepColumn
      const nextLine = line + stepLine
      if (nextColumn < 0 || nextLine < 0 || nextColumn >= columns || nextLine >= lines) continue
      const next = nextColumn * lines + nextLine
      if (reached[next] === 1 || !squareIsFree(nextColumn, nextLine)) continue
      reached[next] = 1
      queue.push(next)
    }
  }

  return dilateSquares({ columns, lines, personCells, reached })
}

const NEIGHBOUR_STEPS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]

/** De cada canto alcançado, o quadrado inteiro que o corpo ocupa. */
function dilateSquares(
  input: Readonly<{ columns: number; lines: number; personCells: number; reached: Uint8Array }>,
): Uint8Array {
  const { columns, lines, personCells } = input
  const stride = lines + 1
  const sums = new Int32Array((columns + 1) * stride)
  for (let column = 0; column < columns; column += 1) {
    for (let line = 0; line < lines; line += 1) {
      sums[(column + 1) * stride + line + 1] =
        (input.reached[column * lines + line] ?? 0) +
        (sums[column * stride + line + 1] ?? 0) +
        (sums[(column + 1) * stride + line] ?? 0) -
        (sums[column * stride + line] ?? 0)
    }
  }
  const body = new Uint8Array(columns * lines)
  for (let column = 0; column < columns; column += 1) {
    for (let line = 0; line < lines; line += 1) {
      const fromColumn = Math.max(0, column - personCells + 1)
      const fromLine = Math.max(0, line - personCells + 1)
      const count =
        (sums[(column + 1) * stride + line + 1] ?? 0) -
        (sums[fromColumn * stride + line + 1] ?? 0) -
        (sums[(column + 1) * stride + fromLine] ?? 0) +
        (sums[fromColumn * stride + fromLine] ?? 0)
      if (count > 0) body[column * lines + line] = 1
    }
  }

  return body
}

function isWithinReach(
  input: Readonly<{
    body: Uint8Array
    cells: readonly [number, number, number, number]
    columns: number
    lines: number
    reachCells: number
  }>,
): boolean {
  const [fromColumn, toColumn, fromLine, toLine] = input.cells
  /** ⚠️ Inclusivo nas duas pontas: a célula a exatamente o alcance ainda é alcançada. */
  const reach = Math.ceil(input.reachCells) + 1
  for (let column = fromColumn - reach; column < toColumn + reach; column += 1) {
    for (let line = fromLine - reach; line < toLine + reach; line += 1) {
      if (column < 0 || line < 0 || column >= input.columns || line >= input.lines) continue
      if (input.body[column * input.lines + line] !== 1) continue
      const acrossColumns =
        column < fromColumn ? fromColumn - column - 1 : column >= toColumn ? column - toColumn : 0
      const acrossLines = line < fromLine ? fromLine - line - 1 : line >= toLine ? line - toLine : 0
      if (Math.hypot(acrossColumns, acrossLines) <= input.reachCells + 1e-9) return true
    }
  }

  return false
}
