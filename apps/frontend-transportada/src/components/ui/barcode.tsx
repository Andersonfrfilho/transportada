/* Copyright (c) 2026 Ada Technology. MIT License. */
import { encodeCode128C, totalCode128Width } from './code128.service'
import styles from './barcode.module.css'

type BarcodeProps = Readonly<{
  className?: string | undefined
  label: string
  value: string
}>

const BAR_HEIGHT_MODULES = 30

/**
 * Spec 065 D1b: o que a portaria do cliente bipa. Desenhado em SVG por dois motivos — ele escala sem
 * borrar no celular e **imprime nítido** no romaneio, e um `canvas` não faz nem um nem outro.
 *
 * A chave chega vazia quando a nota importada não a trouxe: aí não há código de barras, e a tela
 * mostra nada em vez de um desenho que nenhum leitor aceita.
 */
export function Barcode({ className, label, value }: BarcodeProps) {
  const widths = safeEncode(value)
  if (widths === null) return null

  const total = totalCode128Width(widths)
  let offset = 0

  return (
    <svg
      aria-label={label}
      className={className ?? styles.barcode}
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${total} ${BAR_HEIGHT_MODULES}`}
    >
      {widths.map((width, index) => {
        const x = offset
        offset += width
        // Índice par é barra, ímpar é espaço: é a alternância que o Code 128 define.
        return index % 2 === 0 ? (
          <rect fill="currentColor" height={BAR_HEIGHT_MODULES} key={x} width={width} x={x} y={0} />
        ) : null
      })}
    </svg>
  )
}

/** Chave fora do formato não vira desenho: um código que o leitor recusa é pior que nenhum. */
function safeEncode(value: string): readonly number[] | null {
  try {
    return encodeCode128C(value)
  } catch {
    return null
  }
}
