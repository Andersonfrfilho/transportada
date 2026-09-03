/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'

import { cn } from '@/lib/utils'

import styles from './vector-map.module.css'

export type VectorMapShape = Readonly<{
  /**
   * Traço tracejado. Existe porque a forma às vezes precisa dizer **o que ela não sabe**: no mapa
   * do roteiro, sólido é a estrada que o roteirizador devolveu e tracejado é a reta que liga duas
   * paradas — desenhar as duas igual faria quem olha ler caminho onde não há.
   */
  dashed?: boolean | undefined
  fill: string
  /**
   * A forma é um traço, não uma área. Sem isto ela herda a cor de divisa da malha — correta para
   * borda de polígono, invisível para uma rota sobre fundo escuro.
   */
  line?: boolean | undefined
  id: string
  label: string
  path: string
  selected?: boolean | undefined
}>

export type VectorMapProps = Readonly<{
  ariaLabel: string
  className?: string | undefined
  onSelect?: ((id: string) => void) | undefined
  shapes: readonly VectorMapShape[]
  viewBox: string
}>

/**
 * Desenho vetorial de geometria que chega como **dado**, e é por isso que este `<svg>` mora aqui e
 * não na biblioteca de ícones: o `d` de cada forma nasce da malha em tempo de execução, e não há como
 * declará-lo junto dos glifos.
 *
 * O `role="img"` é deliberado mesmo quando as formas respondem ao clique. Leitor de tela não navega
 * polígono, e forma focável dentro de `role="img"` seria parada de foco sem anúncio; quem usa teclado
 * escreve pela busca e pela colagem do campo de cidade ao lado, que fazem a mesma escrita.
 */
export function VectorMap({
  ariaLabel,
  className,
  onSelect,
  shapes,
  viewBox,
}: VectorMapProps): JSX.Element {
  return (
    <svg
      aria-label={ariaLabel}
      className={cn(styles.root, className)}
      focusable="false"
      role="img"
      viewBox={viewBox}
    >
      {shapes.map((shape) => (
        <path
          className={cn(
            styles.shape,
            onSelect === undefined ? undefined : styles.interactive,
            shape.line === true ? styles.line : undefined,
            shape.dashed === true ? styles.dashed : undefined,
            shape.selected === true ? styles.selected : undefined,
          )}
          d={shape.path}
          fill={shape.fill}
          key={shape.id}
          onClick={onSelect === undefined ? undefined : () => onSelect(shape.id)}
        >
          <title>{shape.label}</title>
        </path>
      ))}
    </svg>
  )
}
