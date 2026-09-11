/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useMemo, type JSX, type PointerEvent } from 'react'

import { cn } from '@/lib/utils'

import styles from './cargo-isometric.module.css'

/**
 * Spec 120: `null` é "do mapa recomendado" — sem marca nenhuma. `outOfReach`/`needsRehandling` vêm
 * de `resolveCargoComplement` (`modules/trip/shared/cargoComplement.service.ts`), já reduzidos ao
 * motivo mais forte antes de chegar aqui: o componente de UI não decide qual dos dois pesa mais, só
 * pinta o que já foi decidido — o mesmo motivo pelo qual ele não importa tipo de módulo de domínio.
 */
export type IsometricBoxComplement = 'needsRehandling' | 'outOfReach' | null

/** Uma caixa no espaço do baú, em metros: `xM` do fundo, `yM` da parede, `zM` do piso. */
export type IsometricBox = Readonly<{
  color: string
  complement: IsometricBoxComplement
  depthM: number
  heightM: number
  id: string
  isEstimated: boolean
  /**
   * A parada apagada vira fantasma cinza sólido — nunca sumida, nunca tracejada: a carga dela
   * continua ocupando o espaço que ocupa, e escondê-la faria a escolhida parecer caber em qualquer
   * lugar do baú.
   */
  isGhost: boolean
  /** Carga que não coube na própria fatia: sai contornada, para não se confundir com a que coube. */
  isSplit: boolean
  /** A camada em que a caixa está, contada do piso. */
  layer: number
  /** A parada a que a caixa pertence — é ela que a fatia separa. */
  stopSequence: number
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
  /**
   * A camada em foco: as demais saem esmaecidas, para o olho achar a que está sendo carregada.
   *
   * ⚠️ Pelo **índice**, nunca pela altura: com fatias de caixas de alturas diferentes, duas camadas
   * de índice igual estão em alturas diferentes, e comparar altura acenderia meia camada.
   */
  focusLayer?: number | undefined
  /** Marca a abertura lateral no contorno — o furgão carrega por ali. */
  hasSideDoor: boolean
  onPointerDown?: ((event: PointerEvent<SVGSVGElement>) => void) | undefined
  onPointerMove?: ((event: PointerEvent<SVGSVGElement>) => void) | undefined
  onPointerUp?: ((event: PointerEvent<SVGSVGElement>) => void) | undefined
  /** Deslocamento do enquadramento, em frações da caixa de visão. */
  panX?: number | undefined
  panY?: number | undefined
  /**
   * Divisas entre as fatias das paradas — em metros do fundo em profundidade, e em metros da parede
   * lateral em faixas (spec 100).
   */
  sliceCutsM?: readonly number[] | undefined
  /**
   * ⚠️ Em faixas a divisa é um plano **ao longo do comprimento**, não atravessando o baú. Desenhá-la
   * no eixo antigo cortaria a carga de todas as paradas de uma vez, sugerindo uma separação que o
   * arranjo não tem.
   */
  sliceCutsAcrossWidth?: boolean | undefined
  zoom?: number | undefined
}>

/** Escala do desenho: unidades do `viewBox` por metro. */
const UNITS_PER_METRE = 46

export const DEFAULT_VIEW_ANGLE: ViewAngle = { pitchRad: 0.62, yawRad: -0.62 }

/** O cinza do fantasma vem literal porque `fill` é atributo, não classe — o CSS só o esmaece. */
const GHOST_FILL = '#5a6b74'

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
  focusLayer,
  hasSideDoor,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  panX = 0,
  panY = 0,
  sliceCutsAcrossWidth = false,
  sliceCutsM,
  zoom = 1,
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
   * ⚠️ O zoom cresce a caixa de visão **em torno do centro**. Aplicá-lo na origem faria o desenho
   * fugir para o canto a cada clique: a caixa cresce, e é o centro dela que tem de ficar parado.
   */
  const rawWidth = maxX - minX
  const rawHeight = maxY - minY
  const width = rawWidth / zoom
  const height = rawHeight / zoom
  const centreX = (minX + maxX) / 2 - panX * rawWidth * 0.12
  const centreY = (minY + maxY) / 2 - panY * rawHeight * 0.12

  /**
   * ⚠️ **Algoritmo do pintor**, na direção de visão atual: a caixa mais ao fundo é desenhada primeiro
   * e a da frente por cima.
   *
   * ⚠️ **Spec 131: a geometria é projetada uma vez por ângulo, e a profundidade uma vez por caixa.**
   * O comparador refazia a trigonometria de duas caixas a cada comparação — n·log n vezes — e cada
   * caixa virava um componente com três closures. Sem teto de desenho (6000 caixas medidas), era esse
   * o custo que passava de 100 ms ao girar a vista.
   */
  const solids = useMemo(() => projectSolids(boxes, angle), [angle, boxes])

  return (
    <svg
      aria-label={ariaLabel}
      className={cn(styles.root, className)}
      role="img"
      viewBox={`${String(centreX - width / 2)} ${String(centreY - height / 2)} ${String(width)} ${String(height)}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <polygon
        className={styles.floor}
        points={toPoints([corners[0], corners[1], corners[2], corners[3]])}
      />

      {(sliceCutsM ?? []).map((cutM) => (
        <polygon
          className={styles.sliceCut}
          key={cutM}
          points={toPoints(
            sliceCutsAcrossWidth
              ? [
                  at(0, cutM, 0),
                  at(bedLengthM, cutM, 0),
                  at(bedLengthM, cutM, bedHeightM),
                  at(0, cutM, bedHeightM),
                ]
              : [
                  at(cutM, 0, 0),
                  at(cutM, bedWidthM, 0),
                  at(cutM, bedWidthM, bedHeightM),
                  at(cutM, 0, bedHeightM),
                ],
          )}
        />
      ))}

      {solids.map((solid) => (
        <IsometricSolid
          dimmed={focusLayer !== undefined && solid.box.layer !== focusLayer}
          key={solid.box.id}
          solid={solid}
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

type ProjectedSolid = Readonly<{
  box: IsometricBox
  /** Os três tons da face, já calculados: topo, frente (`alongX`) e lado (`alongY`). */
  fills: readonly [string, string, string]
  /** Os pontos de cada face visível, já como o atributo `points` do SVG. */
  points: readonly [string, string, string]
}>

/** Quanto cada face vertical escurece: frente e lado, para o olho ler volume. */
const FRONT_SHADE = 0.78
const SIDE_SHADE = 0.6

/**
 * Escurece uma cor `#rrggbb` pelo fator. Pura e exportada: é o que substituiu o `filter: brightness`
 * do CSS, e ela se confere sem DOM.
 *
 * ⚠️ **Spec 131: o `filter` era pintado polígono a polígono**, e com toda caixa desenhada isso eram
 * 12 000 filtros por quadro. A cor escura calculada uma vez por cor tem o mesmo tom e custo zero no
 * navegador. Cor que não é `#rrggbb` volta intacta — nunca inventada.
 */
export function shadeHexColor(color: string, factor: number): string {
  if (!/^#[0-9a-f]{6}$/iu.test(color)) return color
  const channel = (offset: number): string =>
    Math.round(Number.parseInt(color.slice(offset, offset + 2), 16) * factor)
      .toString(16)
      .padStart(2, '0')

  return `#${channel(1)}${channel(3)}${channel(5)}`
}

/**
 * Projeta toda a carga para um ângulo e a devolve na ordem do pintor. Pura e exportada: a promessa
 * de que **toda caixa recebida é desenhada** (spec 131) se confere aqui, sem DOM.
 */
export function projectSolids(
  boxes: readonly IsometricBox[],
  angle: ViewAngle,
): readonly ProjectedSolid[] {
  const faces = visibleFaces(angle)
  const cosYaw = Math.cos(angle.yawRad)
  const sinYaw = Math.sin(angle.yawRad)
  const sinPitch = Math.sin(angle.pitchRad)
  const cosPitch = Math.cos(angle.pitchRad)
  const shades = new Map<string, readonly [string, string, string]>()
  const shadeOf = (color: string): readonly [string, string, string] => {
    const known = shades.get(color)
    if (known !== undefined) return known
    const made = [
      color,
      shadeHexColor(color, FRONT_SHADE),
      shadeHexColor(color, SIDE_SHADE),
    ] as const
    shades.set(color, made)
    return made
  }

  const withDepth = boxes.map((box) => {
    const at = (dx: number, dy: number, dz: number): string => {
      const xM = box.xM + dx
      const yM = box.yM + dy
      const zM = box.zM + dz
      const x = (xM * cosYaw - yM * sinYaw) * UNITS_PER_METRE
      const y = ((xM * sinYaw + yM * cosYaw) * sinPitch - zM * cosPitch) * UNITS_PER_METRE
      return `${String(x)},${String(y)}`
    }
    const height = faces.z === 'top' ? box.heightM : 0
    const depth = faces.x === 'far' ? box.depthM : 0
    const width = faces.y === 'far' ? box.widthM : 0
    const horizontal = `${at(0, 0, height)} ${at(box.depthM, 0, height)} ${at(box.depthM, box.widthM, height)} ${at(0, box.widthM, height)}`
    const alongX = `${at(depth, 0, 0)} ${at(depth, box.widthM, 0)} ${at(depth, box.widthM, box.heightM)} ${at(depth, 0, box.heightM)}`
    const alongY = `${at(0, width, 0)} ${at(box.depthM, width, 0)} ${at(box.depthM, width, box.heightM)} ${at(0, width, box.heightM)}`
    const [top, front, side] = shadeOf(box.isGhost ? GHOST_FILL : box.color)

    return {
      depth: (box.xM * sinYaw + box.yM * cosYaw) * cosPitch + box.zM * sinPitch,
      solid: { box, fills: [top, front, side], points: [horizontal, alongX, alongY] } as const,
    }
  })
  withDepth.sort((first, second) => first.depth - second.depth)

  return withDepth.map((entry) => entry.solid)
}

/**
 * Uma caixa: as **três faces voltadas para quem olha** — a horizontal e uma de cada par vertical —,
 * cada uma com um tom. É o sombreado que faz o olho ler volume; sem ele o isométrico vira um mosaico
 * de losangos.
 *
 * ⚠️ Toda face é preenchida com **cor sólida**: a da nota (spec 121), escurecida nas faces verticais
 * por `shadeHexColor` (spec 131 — antes um `filter` de CSS). A presumida é marcada pelo **contorno
 * pontilhado**, não pelo tom: a lavagem de antes clareava justamente o que hoje distingue a nota.
 * Hachura continua recusada: o risco diagonal cruza as arestas e lê como rachadura na quina, e um
 * padrão SVG tem fundo transparente, o que deixava a caixa vazada.
 *
 * Spec 120: `complement` soma uma terceira marca, própria — tracejado longo cor de cobre, mais
 * grosso quando o motivo é `needsRehandling`. Ela convive com `isSplit` (contorno vermelho) e com o
 * contorno pontilhado da presumida: são três traços independentes, e uma caixa pode carregar mais
 * de um ao mesmo tempo.
 */
function IsometricSolid({
  dimmed,
  solid,
}: Readonly<{ dimmed: boolean; solid: ProjectedSolid }>): JSX.Element {
  const { box } = solid
  const shades = [styles.faceTop, styles.faceFront, styles.faceSide]
  const complementClass =
    box.complement === 'needsRehandling' ? styles.faceComplementStrong : styles.faceComplement

  return (
    <g
      className={cn(styles.box, dimmed && styles.boxDimmed, box.isGhost && styles.boxGhost)}
      data-box-id={box.id}
    >
      {solid.points.map((points, index) => (
        <FaceGroup
          complementClass={box.complement !== null && !box.isGhost ? complementClass : undefined}
          fill={solid.fills[index] ?? box.color}
          key={index}
          points={points}
          presumedClass={cn(shades[index], box.isEstimated && !box.isGhost && styles.facePresumed)}
          splitClass={box.isSplit && !box.isGhost ? styles.faceSplit : undefined}
        />
      ))}
    </g>
  )
}

function FaceGroup({
  complementClass,
  fill,
  points,
  presumedClass,
  splitClass,
}: Readonly<{
  complementClass: string | undefined
  fill: string
  points: string
  presumedClass: string
  splitClass: string | undefined
}>): JSX.Element {
  return (
    <>
      <polygon className={presumedClass} fill={fill} points={points} />
      {splitClass === undefined ? null : <polygon className={splitClass} points={points} />}
      {complementClass === undefined ? null : (
        <polygon className={complementClass} points={points} />
      )}
    </>
  )
}

/**
 * A amostra da cor de uma nota, para a lista da ficha (spec 121). Mora aqui, ao lado do desenho,
 * porque a amostra e a face da caixa recebem a **mesma string de cor** — em lugares separados, a
 * amostra podia pintar por um caminho e a caixa por outro, e a ficha diria uma cor que o baú não tem.
 */
export function CargoNoteSwatch({
  className,
  color,
}: Readonly<{ className?: string | undefined; color: string }>): JSX.Element {
  return <span aria-hidden className={cn(styles.swatch, className)} style={{ color }} />
}

function toPoints(points: readonly (Point | undefined)[]): string {
  return points
    .flatMap((point) => (point === undefined ? [] : [`${String(point.x)},${String(point.y)}`]))
    .join(' ')
}
