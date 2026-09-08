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

export type ScalePlanProps = Readonly<{
  ariaLabel: string
  bands: readonly ScalePlanBand[]
  className?: string | undefined
  /** Rótulo da borda direita — é dela que quem carrega se orienta. */
  doorLabel: string
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
  className,
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

        {bands.map((band) => (
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
