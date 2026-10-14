/* Copyright (c) 2026 Ada Technology. MIT License. */
import styles from '../styles/driverTrip.module.css'

/**
 * Pedido do usuário (14/10): "um personagem marretando a imagem". Um bonequinho de traço bate com
 * a marreta na foto, que amassa a cada pancada — é o que o motorista vê enquanto a foto é reduzida.
 * Só desenho: `aria-hidden`, o texto de contagem ao lado é quem fala com o leitor de tela. As cores
 * vêm de `currentcolor` e do cobre do tema; o movimento mora no CSS e some com "reduzir animações".
 */
export function ProofReducingMallet() {
  return (
    <svg
      aria-hidden="true"
      className={styles.proofMallet}
      fill="none"
      focusable="false"
      height="44"
      viewBox="0 -4 72 44"
      width="72"
    >
      <line
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity="0.3"
        x1="2"
        x2="70"
        y1="37"
        y2="37"
      />
      <g className={styles.proofMalletPhoto}>
        <rect
          fill="var(--color-copper)"
          fillOpacity="0.18"
          height="18"
          rx="2"
          stroke="var(--color-copper)"
          strokeWidth="2"
          width="22"
          x="36"
          y="19"
        />
        <circle cx="42" cy="25" fill="var(--color-copper)" r="2" />
        <path d="M38 33l6-5 4 3 4-4 4 6z" fill="var(--color-copper)" />
      </g>
      <circle cx="14" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
      <line
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        x1="14"
        x2="14"
        y1="17"
        y2="28"
      />
      <line
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        x1="14"
        x2="9"
        y1="28"
        y2="36"
      />
      <line
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        x1="14"
        x2="19"
        y1="28"
        y2="36"
      />
      <g className={styles.proofMalletArm}>
        <line
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
          x1="14"
          x2="30"
          y1="20"
          y2="20"
        />
        <line
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
          x1="30"
          x2="30"
          y1="14"
          y2="26"
        />
        <rect fill="var(--color-copper)" height="9" rx="1.5" width="8" x="26" y="9" />
      </g>
    </svg>
  )
}
