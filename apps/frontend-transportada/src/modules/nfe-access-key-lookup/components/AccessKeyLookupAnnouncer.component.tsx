/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { parseAccessKey, type AccessKeyLookupRow } from '../shared/accessKeyLookupRow.service'
import styles from '../styles/accessKeyLookup.module.css'

type AccessKeyLookupAnnouncerProps = Readonly<{ rows: readonly AccessKeyLookupRow[] }>

const ANNOUNCED_KINDS = ['failed', 'ready', 'refused'] as const

/** Quem usa o leitor não olha a lista: o leitor de tela fala só da linha que acabou de chegar ao fim. */
export function AccessKeyLookupAnnouncer({ rows }: AccessKeyLookupAnnouncerProps) {
  const { t } = useTranslation('accessKeyLookup')
  const [message, setMessage] = useState('')
  const previousKinds = useRef<ReadonlyMap<string, string> | undefined>(undefined)

  useEffect(() => {
    const previous = previousKinds.current
    previousKinds.current = new Map(rows.map((row) => [row.accessKey, row.state.kind]))
    if (previous === undefined) return
    const sentences = rows.flatMap((row) => {
      const { kind } = row.state
      const isTerminalChange = previous.get(row.accessKey) !== kind
      if (!isTerminalChange || !ANNOUNCED_KINDS.some((announced) => announced === kind)) return []
      return [t(`announce.${kind}`, { number: parseAccessKey(row.accessKey).number })]
    })
    if (sentences.length > 0) setMessage(sentences.join(' '))
  }, [rows, t])

  return (
    <p aria-live="polite" className={styles.visuallyHidden} role="status">
      {message}
    </p>
  )
}
