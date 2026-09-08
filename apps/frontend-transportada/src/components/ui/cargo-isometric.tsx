/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'

import { cn } from '@/lib/utils'

import styles from './cargo-isometric.module.css'

/**
 * Uma caixa no espaço do baú, em metros: `xM` do fundo, `yM` da parede, `zM` do piso.
 */
export type IsometricBox = Readonly<{
  color: string
  depthM: number
  heightM: number
  id: string
  isEstimated: boolean
  widthM: number
  xM: number
  yM: number
  zM: number
}>

export type CargoIsometricProps = Readonly<{
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
}>

/** Escala do desenho: unidades do `viewBox` por metro. */
const UNITS_PER_METRE = 46
/** Isometria clássica: 30° em cada eixo do plano. */
const COS_30 = Math.cos(Math.PI / 6)
const SIN_30 = Math.sin(Math.PI / 6)

type Point = Readonly<{ x: number; y: number }>

/**
 * A projeção isométrica de um ponto do baú. **Função pura e exportada** porque é a única coisa aqui
 * que se confere sem DOM — e é dela que todo o resto do desenho depende.
 *
 * ⚠️ `zM` sobe na tela (y diminui): em SVG o eixo vertical cresce para baixo, e esquecer isso desenha
 * a pilha crescendo para dentro do chão.
 */
export function projectIsometric(point: Readonly<{ xM: number; yM: number; zM: number }>): Point {
  return {
    x: (point.xM - point.yM) * COS_30 * UNITS_PER_METRE,
    y: ((point.xM + point.yM) * SIN_30 - point.zM) * UNITS_PER_METRE,
  }
}

export function CargoIsometric({
  ariaLabel,
  bedHeightM,
  bedLengthM,
  bedWidthM,
  boxes,
  className,
  focusLayerZM,
  hasSideDoor,
}: CargoIsometricProps): JSX.Element {
  const corners = [
    projectIsometric({ xM: 0, yM: 0, zM: 0 }),
    projectIsometric({ xM: bedLengthM, yM: 0, zM: 0 }),
    projectIsometric({ xM: bedLengthM, yM: bedWidthM, zM: 0 }),
    projectIsometric({ xM: 0, yM: bedWidthM, zM: 0 }),
    projectIsometric({ xM: 0, yM: 0, zM: bedHeightM }),
    projectIsometric({ xM: bedLengthM, yM: 0, zM: bedHeightM }),
    projectIsometric({ xM: bedLengthM, yM: bedWidthM, zM: bedHeightM }),
    projectIsometric({ xM: 0, yM: bedWidthM, zM: bedHeightM }),
  ]
  const minX = Math.min(...corners.map((corner) => corner.x)) - 12
  const maxX = Math.max(...corners.map((corner) => corner.x)) + 12
  const minY = Math.min(...corners.map((corner) => corner.y)) - 12
  const maxY = Math.max(...corners.map((corner) => corner.y)) + 12

  /**
   * ⚠️ **Algoritmo do pintor**: a caixa mais ao fundo é desenhada primeiro, e a da frente por cima.
   * Sem essa ordenação a pilha sai com as peças de trás cobrindo as da frente — que é o defeito que
   * faz um isométrico parecer quebrado.
   */
  const ordered = [...boxes].sort(
    (first, second) => first.xM + first.yM + first.zM - (second.xM + second.yM + second.zM),
  )

  return (
    <svg
      aria-label={ariaLabel}
      className={cn(styles.root, className)}
      role="img"
      viewBox={`${String(minX)} ${String(minY)} ${String(maxX - minX)} ${String(maxY - minY)}`}
    >
      <defs>
        <pattern
          height="7"
          id="cargo-iso-hatch"
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
          width="7"
        >
          <line className={styles.hatch} x1="0" x2="0" y1="0" y2="7" />
        </pattern>
      </defs>

      {/* O piso do baú, desenhado antes de tudo: é o chão em que a carga assenta. */}
      <polygon
        className={styles.floor}
        points={toPoints([corners[0], corners[1], corners[2], corners[3]])}
      />

      {ordered.map((box) => (
        <IsometricSolid
          box={box}
          dimmed={focusLayerZM !== undefined && Math.abs(box.zM - focusLayerZM) > 0.001}
          key={box.id}
        />
      ))}

      {/* As arestas do baú por cima da carga: o contorno é a referência de tamanho. */}
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

      {/* A porta traseira: a face que fica de frente para quem carrega. */}
      <polygon
        className={styles.rearDoor}
        points={toPoints([corners[1], corners[2], corners[6], corners[5]])}
      />

      {hasSideDoor ? (
        <polygon
          className={styles.sideDoor}
          points={toPoints([
            projectIsometric({ xM: bedLengthM * 0.42, yM: 0, zM: 0 }),
            projectIsometric({ xM: bedLengthM * 0.78, yM: 0, zM: 0 }),
            projectIsometric({ xM: bedLengthM * 0.78, yM: 0, zM: bedHeightM * 0.8 }),
            projectIsometric({ xM: bedLengthM * 0.42, yM: 0, zM: bedHeightM * 0.8 }),
          ])}
        />
      ) : null}
    </svg>
  )
}

/**
 * Uma caixa: três faces visíveis — topo, frente e lateral —, cada uma com um tom. É o sombreado que
 * faz o olho ler volume; sem ele o isométrico vira um mosaico de losangos.
 */
function IsometricSolid({
  box,
  dimmed,
}: Readonly<{ box: IsometricBox; dimmed: boolean }>): JSX.Element {
  const at = (dx: number, dy: number, dz: number): Point =>
    projectIsometric({ xM: box.xM + dx, yM: box.yM + dy, zM: box.zM + dz })

  const fill = box.isEstimated ? 'url(#cargo-iso-hatch)' : box.color

  return (
    <g className={cn(styles.box, dimmed && styles.boxDimmed)}>
      <polygon
        className={styles.faceTop}
        fill={fill}
        points={toPoints([
          at(0, 0, box.heightM),
          at(box.depthM, 0, box.heightM),
          at(box.depthM, box.widthM, box.heightM),
          at(0, box.widthM, box.heightM),
        ])}
      />
      <polygon
        className={styles.faceFront}
        fill={fill}
        points={toPoints([
          at(box.depthM, 0, 0),
          at(box.depthM, box.widthM, 0),
          at(box.depthM, box.widthM, box.heightM),
          at(box.depthM, 0, box.heightM),
        ])}
      />
      <polygon
        className={styles.faceSide}
        fill={fill}
        points={toPoints([
          at(0, box.widthM, 0),
          at(box.depthM, box.widthM, 0),
          at(box.depthM, box.widthM, box.heightM),
          at(0, box.widthM, box.heightM),
        ])}
      />
    </g>
  )
}

function toPoints(points: readonly (Point | undefined)[]): string {
  return points
    .flatMap((point) => (point === undefined ? [] : [`${String(point.x)},${String(point.y)}`]))
    .join(' ')
}
