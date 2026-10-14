/* Copyright (c) 2026 Ada Technology. MIT License. */
import styles from '../styles/driverTrip.module.css'

/**
 * Pedido do usuário (14/10): "Foto pronta, falta confirmar" — outra animação, diferente da caixa na
 * nuvem, porque aqui nada está subindo: a foto já está salva e só falta o toque em "Confirmar
 * entrega". A foto ganha um visto que pulsa e uma seta que balança apontando para o botão. Só
 * desenho (`aria-hidden`); o texto ao lado é quem fala com o leitor de tela, e o movimento mora no
 * CSS e some com "reduzir animações".
 */
export function ProofReadyToConfirm() {
  return (
    <svg
      aria-hidden="true"
      className={styles.proofMallet}
      fill="none"
      focusable="false"
      height="44"
      viewBox="0 0 72 44"
      width="72"
    >
      <rect
        fill="var(--color-copper)"
        fillOpacity="0.18"
        height="22"
        rx="2"
        stroke="var(--color-copper)"
        strokeWidth="2"
        width="30"
        x="6"
        y="8"
      />
      <path
        d="M11 25l7-7 6 6 4-4 6 6"
        stroke="var(--color-copper)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <g className={styles.proofReadyCheck}>
        <circle cx="36" cy="10" fill="var(--color-ready)" r="7" />
        <path
          d="M32.5 10l2.5 2.5 4.5-5"
          stroke="var(--color-ink-on-accent)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2"
        />
      </g>
      <g className={styles.proofReadyArrow}>
        <path
          d="M58 12v18m-7-7l7 7 7-7"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.5"
        />
      </g>
    </svg>
  )
}
