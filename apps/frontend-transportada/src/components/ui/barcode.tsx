/* Copyright (c) 2026 Ada Technology. MIT License. */
import { buildCode128Layout, type Code128Layout } from './code128.service'
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
  const layout = safeLayout(value)
  if (layout === null) return null

  return (
    <svg
      aria-label={label}
      className={className ?? styles.barcode}
      preserveAspectRatio="none"
      role="img"
      viewBox={`0 0 ${layout.totalWidth} ${BAR_HEIGHT_MODULES}`}
    >
      {/*
        ⚠️ Barra escura sobre papel claro, sempre — nunca `currentColor`. No tema escuro a barra
        herdava a cor do texto e saía clara sobre fundo escuro: o desenho fica certo e **nenhum
        leitor lê**, porque o Code 128 pressupõe tinta escura sobre papel claro.
      */}
      <rect
        className={styles.paper}
        height={BAR_HEIGHT_MODULES}
        width={layout.totalWidth}
        x={0}
        y={0}
      />
      {layout.bars.map((bar) => (
        <rect
          className={styles.bar}
          height={BAR_HEIGHT_MODULES}
          key={bar.x}
          width={bar.width}
          x={bar.x}
          y={0}
        />
      ))}
    </svg>
  )
}

/** Chave fora do formato não vira desenho: um código que o leitor recusa é pior que nenhum. */
function safeLayout(value: string): Code128Layout | null {
  try {
    return buildCode128Layout(value)
  } catch {
    return null
  }
}
