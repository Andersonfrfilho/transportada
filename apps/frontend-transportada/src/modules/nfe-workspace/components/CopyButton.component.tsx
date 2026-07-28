/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  )
}

function resolveCopyClass(variant: CopyButtonVariant, copied: boolean): string {
  if (variant === 'inline') return (copied ? styles.copyInlineDone : styles.copyInline) ?? ''
  return (copied ? styles.copyButtonDone : styles.copyButton) ?? ''
}

function CopyIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <rect height="13" rx="2" width="13" x="9" y="9" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="m5 13 4 4L19 7" />
    </svg>
  )
}
