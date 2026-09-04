/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState, type JSX } from 'react'

import { Icon } from '@/components/ui/icon'

import styles from './copy-button.module.css'

/** Quanto tempo o ✓ fica no lugar do ícone de cópia antes de o botão voltar ao normal. */
export const COPY_FEEDBACK_MS = 2_000

type CopyButtonVariant = 'boxed' | 'inline'

type CopyButtonProps = Readonly<{
  /** O que o botão faz, para o leitor de tela e para a dica. */
  label: string
  /** O que ele diz depois de copiar. O texto é de quem chama: o primitivo não tem vocabulário. */
  copiedLabel: string
  value: string
  /** `inline` some dentro do texto e é revelada pelo hospedeiro; `boxed` fica sempre visível. */
  variant?: CopyButtonVariant
}>

/**
 * Copiar um valor da tela para a área de transferência.
 *
 * ⚠️ O rótulo entra por prop, não por `useTranslation` aqui dentro: um primitivo com namespace de
 * módulo só serviria àquele módulo — foi o que prendeu este botão ao `nfe-workspace` até agora, e é
 * a razão de "Copiado" existir escrito em quatro lugares do produto.
 */
export function CopyButton({
  copiedLabel,
  label,
  value,
  variant = 'boxed',
}: CopyButtonProps): JSX.Element {
  const [hasCopied, setHasCopied] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Desmontar com o temporizador armado deixaria um `setState` mirando componente que já saiu. */
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    },
    [],
  )

  async function copyValue(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      /** Área de transferência negada é recusa do navegador, não erro do produto: o ✓ não sai. */
      return
    }
    setHasCopied(true)
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setHasCopied(false), COPY_FEEDBACK_MS)
  }

  const currentLabel = hasCopied ? copiedLabel : label
  return (
    <button
      aria-label={currentLabel}
      className={resolveClassName(variant, hasCopied)}
      /** O hospedeiro revela a variante em linha por este atributo, nunca pelo nome da classe. */
      {...(variant === 'inline' ? { 'data-copy-inline': 'true' } : {})}
      onClick={() => void copyValue()}
      title={currentLabel}
      type="button"
    >
      <Icon name={hasCopied ? 'check' : 'copy'} />
    </button>
  )
}

function resolveClassName(variant: CopyButtonVariant, hasCopied: boolean): string {
  if (variant === 'inline') return (hasCopied ? styles.inlineDone : styles.inline) ?? ''
  return (hasCopied ? styles.boxedDone : styles.boxed) ?? ''
}
