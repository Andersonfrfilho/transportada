/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { JSX } from 'react'

import { cn } from '@/lib/utils'

import styles from './cargo-isometric.module.css'

/** Uma caixa no espaço do baú, em metros: `xM` do fundo, `yM` da parede, `zM` do piso. */
export type IsometricBox = Readonly<{
  color: string
  depthM: number
  heightM: number
  id: string
  isEstimated: boolean
  /** Carga que não coube na própria fatia: sai contornada, para não se confundir com a que coube. */
  isSplit: boolean
  widthM: number
  xM: number
  yM: number
  zM: number
}>

/**
 * O par de ângulos que define a vista. **O isométrico clássico é só um par entre infinitos**, e
 * fixá-lo era o que impedia o desenho de girar.
 */
export type ViewAngle = Readonly<{ pitchRad: number; yawRad: number }>

export type CargoIsometricProps = Readonly<{
  angle?: ViewAngle | undefined
  ariaLabel: string
  bedHeightM: number
  bedLengthM: number
  bedWidthM: number
  boxes: readonly IsometricBox[]
  className?: string | undefined
  /** A camada em foco: as demais saem esmaecidas, para o olho achar a que está sendo carregada. */
  focusLayerZM?: number | undefined
  /** Marca a abertura lateral no contorno — o furgão carrega por ali. */
  hasSideDoor: boolean
  /** Divisas entre as fatias das paradas, em metros do fundo. */
  sliceCutsM?: readonly number[] | undefined
}>

/** Escala do desenho: unidades do `viewBox` por metro. */
const UNITS_PER_METRE = 46

export const DEFAULT_VIEW_ANGLE: ViewAngle = { pitchRad: 0.62, yawRad: -0.62 }

type Point = Readonly<{ x: number; y: number }>
type SpacePoint = Readonly<{ xM: number; yM: number; zM: number }>

/**
 * A projeção de um ponto do baú na tela. **Função pura e exportada** porque é a única coisa aqui que
 * se confere sem DOM — e é dela que todo o resto do desenho depende.
 *
 * ⚠️ `zM` sobe na tela (y diminui): em SVG o eixo vertical cresce para baixo, e esquecer isso desenha
 * a pilha crescendo para dentro do chão.
 */
export function projectIsometric(point: SpacePoint, angle: ViewAngle): Point {
  const cosYaw = Math.cos(angle.yawRad)
  const sinYaw = Math.sin(angle.yawRad)

  return {
    x: (point.xM * cosYaw - point.yM * sinYaw) * UNITS_PER_METRE,
    y:
      ((point.xM * sinYaw + point.yM * cosYaw) * Math.sin(angle.pitchRad) -
        point.zM * Math.cos(angle.pitchRad)) *
      UNITS_PER_METRE,
  }
}

/**
 * A profundidade do ponto na direção de visão — a terceira coordenada, ortogonal às duas da tela.
 *
 * ⚠️ É ela que ordena o desenho. Ordenar por `xM + yM + zM` só funciona no ângulo padrão: girado meia
 * volta, a soma passa a apontar para trás e as caixas do fundo passam a cobrir as da frente.
 */
export function depthAlongView(point: SpacePoint, angle: ViewAngle): number {
  return (
    (point.xM * Math.sin(angle.yawRad) + point.yM * Math.cos(angle.yawRad)) *
      Math.cos(angle.pitchRad) +
    point.zM * Math.sin(angle.pitchRad)
  )
}

export type VisibleFaces = Readonly<{
  x: 'far' | 'near'
  y: 'far' | 'near'
  z: 'bottom' | 'top'
}>

/**
 * Quais faces do sólido estão voltadas para quem olha, no ângulo atual.
 *
 * ⚠️ Desenhar sempre topo, `+X` e `+Y` deixava a caixa **vazada** assim que o giro passava de 90°: as
 * faces desenhadas iam para trás, e as visíveis não existiam no SVG. O sinal da derivada da
 * profundidade em cada eixo é o que diz qual das duas faces do par está de frente.
 */
export function visibleFaces(angle: ViewAngle): VisibleFaces {
  return {
    x: Math.sin(angle.yawRad) * Math.cos(angle.pitchRad) > 0 ? 'far' : 'near',
    y: Math.cos(angle.yawRad) * Math.cos(angle.pitchRad) > 0 ? 'far' : 'near',
    z: Math.sin(angle.pitchRad) >= 0 ? 'top' : 'bottom',
  }
}

export function CargoIsometric({
  angle = DEFAULT_VIEW_ANGLE,
  ariaLabel,
  bedHeightM,
  bedLengthM,
  bedWidthM,
  boxes,
  className,
  focusLayerZM,
  hasSideDoor,
  sliceCutsM,
}: CargoIsometricProps): JSX.Element {
  const at = (xM: number, yM: number, zM: number): Point => projectIsometric({ xM, yM, zM }, angle)
  const corners = [
    at(0, 0, 0),
    at(bedLengthM, 0, 0),
    at(bedLengthM, bedWidthM, 0),
    at(0, bedWidthM, 0),
    at(0, 0, bedHeightM),
    at(bedLengthM, 0, bedHeightM),
    at(bedLengthM, bedWidthM, bedHeightM),
    at(0, bedWidthM, bedHeightM),
  ]
  const minX = Math.min(...corners.map((corner) => corner.x)) - 12
  const maxX = Math.max(...corners.map((corner) => corner.x)) + 12
  const minY = Math.min(...corners.map((corner) => corner.y)) - 12
  const maxY = Math.max(...corners.map((corner) => corner.y)) + 12

  /**
   * ⚠️ **Algoritmo do pintor**, na direção de visão atual: a caixa mais ao fundo é desenhada primeiro
   * e a da frente por cima.
   */
  const ordered = [...boxes].sort(
    (first, second) =>
      depthAlongView({ xM: first.xM, yM: first.yM, zM: first.zM }, angle) -
      depthAlongView({ xM: second.xM, yM: second.yM, zM: second.zM }, angle),
  )
  const faces = visibleFaces(angle)

  return (
    <svg
      aria-label={ariaLabel}
      className={cn(styles.root, className)}
      role="img"
      viewBox={`${String(minX)} ${String(minY)} ${String(maxX - minX)} ${String(maxY - minY)}`}
    >
      <polygon
        className={styles.floor}
        points={toPoints([corners[0], corners[1], corners[2], corners[3]])}
      />

      {(sliceCutsM ?? []).map((cutM) => (
        <polygon
          className={styles.sliceCut}
          key={cutM}
          points={toPoints([
            at(cutM, 0, 0),
            at(cutM, bedWidthM, 0),
            at(cutM, bedWidthM, bedHeightM),
            at(cutM, 0, bedHeightM),
          ])}
        />
      ))}

      {ordered.map((box) => (
        <IsometricSolid
          angle={angle}
          box={box}
          dimmed={focusLayerZM !== undefined && Math.abs(box.zM - focusLayerZM) > 0.001}
          faces={faces}
          key={box.id}
        />
      ))}

      <polygon
        className={styles.bedEdge}
        points={toPoints([corners[4], corners[5], corners[6], corners[7]])}
      />
      {[0, 1, 2, 3].map((index) => (
        <line
          className={styles.bedEdge}
          key={index}
          x1={corners[index]?.x}
          x2={corners[index + 4]?.x}
          y1={corners[index]?.y}
          y2={corners[index + 4]?.y}
        />
      ))}

      <polygon
        className={styles.rearDoor}
        points={toPoints([corners[1], corners[2], corners[6], corners[5]])}
      />

      {hasSideDoor ? (
        <polygon
          className={styles.sideDoor}
          points={toPoints([
            at(bedLengthM * 0.42, 0, 0),
            at(bedLengthM * 0.78, 0, 0),
            at(bedLengthM * 0.78, 0, bedHeightM * 0.8),
            at(bedLengthM * 0.42, 0, bedHeightM * 0.8),
          ])}
        />
      ) : null}
    </svg>
  )
}

/**
 * Uma caixa: as **três faces voltadas para quem olha** — a horizontal e uma de cada par vertical —,
 * cada uma com um tom. É o sombreado que faz o olho ler volume; sem ele o isométrico vira um mosaico
 * de losangos.
 *
 * ⚠️ Toda face é preenchida com **cor sólida**, e a presumida recebe uma **lavagem** por cima — a
 * mesma cor, mais clara. Hachura não serve: o risco diagonal cruza as arestas e lê como rachadura na
 * quina, e um padrão SVG tem fundo transparente, o que deixava a caixa vazada.
 */
function IsometricSolid({
  angle,
  box,
  dimmed,
  faces,
}: Readonly<{
  angle: ViewAngle
  box: IsometricBox
  dimmed: boolean
  faces: VisibleFaces
}>): JSX.Element {
  const at = (dx: number, dy: number, dz: number): Point =>
    projectIsometric({ xM: box.xM + dx, yM: box.yM + dy, zM: box.zM + dz }, angle)

  const horizontal =
    faces.z === 'top'
      ? [
          at(0, 0, box.heightM),
          at(box.depthM, 0, box.heightM),
          at(box.depthM, box.widthM, box.heightM),
          at(0, box.widthM, box.heightM),
        ]
      : [at(0, 0, 0), at(box.depthM, 0, 0), at(box.depthM, box.widthM, 0), at(0, box.widthM, 0)]
  const alongX =
    faces.x === 'far'
      ? [
          at(box.depthM, 0, 0),
          at(box.depthM, box.widthM, 0),
          at(box.depthM, box.widthM, box.heightM),
          at(box.depthM, 0, box.heightM),
        ]
      : [at(0, 0, 0), at(0, box.widthM, 0), at(0, box.widthM, box.heightM), at(0, 0, box.heightM)]
  const alongY =
    faces.y === 'far'
      ? [
          at(0, box.widthM, 0),
          at(box.depthM, box.widthM, 0),
          at(box.depthM, box.widthM, box.heightM),
          at(0, box.widthM, box.heightM),
        ]
      : [at(0, 0, 0), at(box.depthM, 0, 0), at(box.depthM, 0, box.heightM), at(0, 0, box.heightM)]

  const face = (points: readonly Point[], shade: string): JSX.Element => (
    <>
      <polygon className={shade} fill={box.color} points={toPoints(points)} />
      {box.isEstimated ? <polygon className={styles.faceWash} points={toPoints(points)} /> : null}
      {box.isSplit ? <polygon className={styles.faceSplit} points={toPoints(points)} /> : null}
    </>
  )

  return (
    <g className={cn(styles.box, dimmed && styles.boxDimmed)} data-box-id={box.id}>
      {face(horizontal, styles.faceTop ?? '')}
      {face(alongX, styles.faceFront ?? '')}
      {face(alongY, styles.faceSide ?? '')}
    </g>
  )
}

function toPoints(points: readonly (Point | undefined)[]): string {
  return points
    .flatMap((point) => (point === undefined ? [] : [`${String(point.x)},${String(point.y)}`]))
    .join(' ')
}
