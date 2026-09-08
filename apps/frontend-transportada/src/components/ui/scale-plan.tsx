/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'

import { cn } from '@/lib/utils'

import styles from './scale-plan.module.css'

export type ScalePlanBand = Readonly<{
  color: string
  /** Onde a faixa começa, em metros a partir da borda esquerda (o fundo). */
  offsetM: number
  /** Quanto ela ocupa, em metros. */
  lengthM: number
  /** O que sai dentro dela. Vazio quando não cabe — o rótulo completo vive na legenda ao lado. */
  label: string
  id: string
  /**
   * Carga que não coube e atravessou a porta. Sai hachurada e **fora** do contorno: encolher tudo
   * para caber esconderia o estouro, que é a informação.
   */
  outside?: boolean | undefined
  /** A borda que toca a lateral é alcançável sem descarregar o que está na frente. */
  sideMarked?: boolean | undefined
}>

/**
 * Spec 096: uma caixa **posicionada** dentro do baú, vista de cima. É o que a faixa não diz — a
 * faixa reserva espaço para a parada, a caixa ocupa um lugar.
 */
export type ScalePlanBox = Readonly<{
  color: string
  /** Quanto ocupa no comprimento do baú, em metros. */
  depthM: number
  id: string
  /** Presumida sai hachurada: a diferença entre o que foi medido e o que foi derivado do volume. */
  isEstimated: boolean
  label: string
  widthM: number
  /** Distância do fundo, em metros. */
  xM: number
  /** Distância da parede lateral, em metros. */
  yM: number
}>

export type ScalePlanProps = Readonly<{
  ariaLabel: string
  bands: readonly ScalePlanBand[]
  /**
   * As caixas desta camada. Quando vêm, elas são o desenho: as faixas ficam ao fundo, em traço
   * fraco, marcando de quem é o espaço.
   */
  boxes?: readonly ScalePlanBox[]
  className?: string | undefined
  /** Rótulo da borda direita — é dela que quem carrega se orienta. */
  doorLabel: string
  /**
   * A porta lateral, desenhada na borda de cima — que é o **lado direito** do veículo, porque a
   * planta olha de cima com a frente à esquerda.
   *
   * ⚠️ Ela muda o que a ordem de carregamento significa: com lateral, a última parada no fundo é
   * conveniência; sem, é obrigação. Desenhar as duas iguais faria o conferente descarregar meia
   * carga para alcançar o que dava pela porta do lado.
   */
  sideDoorLabel?: string | undefined
  /** A largura do desenho, em metros: a dimensão curta do baú, vista de cima. */
  widthM: number
  /** O comprimento do baú, em metros. O contorno vai de zero até aqui. */
  lengthM: number
}>

/** Pixels por metro no `viewBox`. Não é tamanho na tela — o CSS escala; é a resolução do desenho. */
const PIXELS_PER_METRE = 100
const MARGIN = 28
const TICK_LENGTH = 6

/**
 * O `viewBox` **é** a promessa de escala: a razão entre largura e altura dele é a razão entre o
 * comprimento e a largura do baú, e é ela que o navegador preserva ao encaixar o desenho. Sai daqui
 * como função pura porque é a única coisa neste arquivo que se pode conferir sem DOM.
 */
export function buildScalePlanViewBox(
  input: Readonly<{ outerLengthM: number; widthM: number }>,
): string {
  const width = input.outerLengthM * PIXELS_PER_METRE + MARGIN * 2
  const height = input.widthM * PIXELS_PER_METRE + MARGIN * 2

  return `0 0 ${String(width)} ${String(height)}`
}

/**
 * Uma planta em escala, vista de cima: um contorno em metros, faixas dentro dele e uma régua na
 * borda. A geometria chega como **dado** — é por isso que este `<svg>` mora aqui e não na
 * biblioteca de ícones, como o `VectorMap`.
 *
 * ⚠️ **A proporção na tela é a proporção real.** É o ponto inteiro do desenho: quem olha mede com
 * a fita o que a tela mostra, e um desenho que se ajusta ao espaço disponível mentiria em metro. O
 * `viewBox` sai das medidas, e o contêiner rola no celular em vez de comprimir o desenho.
 */
export function ScalePlan({
  ariaLabel,
  bands,
  boxes = [],
  className,
  sideDoorLabel,
  doorLabel,
  widthM,
  lengthM,
}: ScalePlanProps): JSX.Element {
  const outerRight = Math.max(lengthM, ...bands.map((band) => band.offsetM + band.lengthM))
  /** Uma marca por metro; a régua é o que transforma o desenho em medida. */
  const ticks = Array.from({ length: Math.floor(outerRight) + 1 }, (_, metre) => metre)

  return (
    <div className={cn(styles.frame, className)}>
      <svg
        aria-label={ariaLabel}
        className={styles.root}
        role="img"
        viewBox={buildScalePlanViewBox({ outerLengthM: outerRight, widthM })}
        style={{ width: `${String(outerRight * 4)}rem` }}
      >
        <defs>
          <pattern
            height="8"
            id="scale-plan-hatch"
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
            width="8"
          >
            <line className={styles.hatch} x1="0" x2="0" y1="0" y2="8" />
          </pattern>
        </defs>

        {/*
          ⚠️ Com caixas, as faixas ficam **atrás e fracas**: elas dizem de quem é o espaço, e a
          caixa diz o que ocupa. Desenhar as duas com o mesmo peso faria a faixa competir com a
          carga que está dentro dela.
        */}
        {boxes.length > 0 ? (
          <g className={styles.bandsBehind}>
            {bands.map((band) => (
              <rect
                fill={band.color}
                height={widthM * PIXELS_PER_METRE}
                key={`faixa-${band.id}`}
                width={band.lengthM * PIXELS_PER_METRE}
                x={MARGIN + band.offsetM * PIXELS_PER_METRE}
                y={MARGIN}
              />
            ))}
          </g>
        ) : null}

        {boxes.map((cargoBox) => (
          <g key={cargoBox.id}>
            <rect
              className={styles.box}
              fill={cargoBox.isEstimated ? 'url(#scale-plan-hatch)' : cargoBox.color}
              height={cargoBox.widthM * PIXELS_PER_METRE}
              width={cargoBox.depthM * PIXELS_PER_METRE}
              x={MARGIN + cargoBox.xM * PIXELS_PER_METRE}
              y={MARGIN + cargoBox.yM * PIXELS_PER_METRE}
            />
            {/* Contorno na cor da parada mesmo na presumida: a hachura tira a cor do preenchimento. */}
            {cargoBox.isEstimated ? (
              <rect
                className={styles.boxEstimatedEdge}
                height={cargoBox.widthM * PIXELS_PER_METRE}
                stroke={cargoBox.color}
                width={cargoBox.depthM * PIXELS_PER_METRE}
                x={MARGIN + cargoBox.xM * PIXELS_PER_METRE}
                y={MARGIN + cargoBox.yM * PIXELS_PER_METRE}
              />
            ) : null}
          </g>
        ))}

        {boxes.length > 0
          ? null
          : bands.map((band) => (
              <g key={band.id}>
                {/*
              ⚠️ A cor da parada fica **por baixo** da hachura, sempre. Trocar o preenchimento pela
              hachura apagava a cor da faixa inteira mesmo quando só uma ponta dela sai do baú — e é
              a cor que liga a faixa à legenda e ao pino do mapa.
            */}
                <rect
                  className={band.outside === true ? styles.bandOutside : styles.band}
                  fill={band.color}
                  height={widthM * PIXELS_PER_METRE}
                  width={band.lengthM * PIXELS_PER_METRE}
                  x={MARGIN + band.offsetM * PIXELS_PER_METRE}
                  y={MARGIN}
                />
                {band.outside !== true ? null : (
                  <rect
                    className={styles.bandOutside}
                    fill="url(#scale-plan-hatch)"
                    height={widthM * PIXELS_PER_METRE}
                    width={band.lengthM * PIXELS_PER_METRE}
                    x={MARGIN + band.offsetM * PIXELS_PER_METRE}
                    y={MARGIN}
                  />
                )}
                {band.sideMarked !== true ? null : (
                  <line
                    className={styles.sideMark}
                    x1={MARGIN + band.offsetM * PIXELS_PER_METRE}
                    x2={MARGIN + (band.offsetM + band.lengthM) * PIXELS_PER_METRE}
                    y1={MARGIN}
                    y2={MARGIN}
                  />
                )}
                {band.label === '' ? null : (
                  <text
                    className={styles.bandLabel}
                    x={MARGIN + (band.offsetM + band.lengthM / 2) * PIXELS_PER_METRE}
                    y={MARGIN + (widthM * PIXELS_PER_METRE) / 2}
                  >
                    {band.label}
                  </text>
                )}
              </g>
            ))}

        {/* O contorno vem depois das faixas para a borda ficar por cima delas, e a porta é dele. */}
        <rect
          className={styles.outline}
          height={widthM * PIXELS_PER_METRE}
          width={lengthM * PIXELS_PER_METRE}
          x={MARGIN}
          y={MARGIN}
        />
        {/*
          ⚠️ A porta é uma **borda desenhada**, não uma legenda: é dela que o conferente se orienta,
          e um rótulo solto ao lado do desenho não diz de que lado do papel ele está.
        */}
        <line
          className={styles.door}
          x1={MARGIN + lengthM * PIXELS_PER_METRE}
          x2={MARGIN + lengthM * PIXELS_PER_METRE}
          y1={MARGIN}
          y2={MARGIN + widthM * PIXELS_PER_METRE}
        />

        {/*
          A porta lateral, na borda de cima — o **lado direito** do veículo, porque a planta olha de
          cima com a frente à esquerda. Ela ocupa o terço traseiro, que é onde o furgão a instala.
        */}
        {sideDoorLabel === undefined ? null : (
          <>
            <line
              className={styles.sideDoor}
              x1={MARGIN + lengthM * 0.42 * PIXELS_PER_METRE}
              x2={MARGIN + lengthM * 0.78 * PIXELS_PER_METRE}
              y1={MARGIN}
              y2={MARGIN}
            />
            <text
              className={styles.doorLabel}
              x={MARGIN + lengthM * 0.6 * PIXELS_PER_METRE}
              y={MARGIN - TICK_LENGTH}
            >
              {sideDoorLabel}
            </text>
          </>
        )}
        <text
          className={styles.doorLabel}
          x={MARGIN + lengthM * PIXELS_PER_METRE}
          y={MARGIN + widthM * PIXELS_PER_METRE + MARGIN - TICK_LENGTH}
        >
          {doorLabel}
        </text>

        {ticks.map((metre) => (
          <g key={metre}>
            <line
              className={styles.tick}
              x1={MARGIN + metre * PIXELS_PER_METRE}
              x2={MARGIN + metre * PIXELS_PER_METRE}
              y1={MARGIN - TICK_LENGTH}
              y2={MARGIN}
            />
            <text
              className={styles.tickLabel}
              x={MARGIN + metre * PIXELS_PER_METRE}
              y={MARGIN - TICK_LENGTH * 2}
            >
              {metre}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}
