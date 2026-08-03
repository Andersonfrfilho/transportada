/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import styles from '../styles/nfeWorkspace.module.css'

type CopyButtonVariant = 'boxed' | 'inline'

type CopyButtonProps = Readonly<{
  readonly label: string
  readonly value: string
  readonly variant?: CopyButtonVariant
}>

export function CopyButton({ label, value, variant = 'boxed' }: CopyButtonProps) {
  const { t } = useTranslation('nfeWorkspace')
  const [copied, setCopied] = useState(false)

  async function copyValue(): Promise<void> {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2_000)
    } catch {
      setCopied(false)
    }
  }

  const feedbackLabel = copied ? t('common.copied') : label
  return (
    <button
      aria-label={feedbackLabel}
      className={resolveCopyClass(variant, copied)}
      onClick={() => {
        void copyValue()
      }}
      title={feedbackLabel}
      type="button"
    >
      <Icon name={copied ? 'check' : 'copy'} />
    </button>
  )
}

function resolveCopyClass(variant: CopyButtonVariant, copied: boolean): string {
  if (variant === 'inline') return (copied ? styles.copyInlineDone : styles.copyInline) ?? ''
  return (copied ? styles.copyButtonDone : styles.copyButton) ?? ''
}
