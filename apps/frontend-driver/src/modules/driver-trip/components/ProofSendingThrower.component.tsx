/* Copyright (c) 2026 Ada Technology. MIT License. */
import styles from '../styles/driverTrip.module.css'

/**
 * Pedido do usuário (14/10): "uma animação de enviando a foto para a API", na mesma linha do
 * bonequinho da redução. O boneco arremessa a foto, que voa em arco até a nuvem. Só desenho
 * (`aria-hidden`); o texto "Enviando" ao lado é quem fala com o leitor de tela, e o movimento mora
 * no CSS e some com "reduzir animações".
 */
export function ProofSendingThrower() {
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
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="2" />
      <line
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        x1="12"
        x2="12"
        y1="17"
        y2="29"
      />
      <line
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        x1="12"
        x2="8"
        y1="29"
        y2="37"
      />
      <line
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        x1="12"
        x2="17"
        y1="29"
        y2="37"
      />
      <line
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
        x1="12"
        x2="21"
        y1="21"
        y2="16"
      />
      <path
        d="M50 22a6 6 0 0 1 11-3 5 5 0 0 1 1 10H52a5 5 0 0 1-2-7z"
        fill="var(--color-copper)"
        fillOpacity="0.18"
        stroke="var(--color-copper)"
        strokeWidth="2"
      />
      <g className={styles.proofSendingPhoto}>
        <rect
          fill="var(--color-copper)"
          fillOpacity="0.25"
          height="8"
          rx="1.5"
          stroke="var(--color-copper)"
          strokeWidth="1.5"
          width="11"
          x="20"
          y="10"
        />
      </g>
    </svg>
  )
}
