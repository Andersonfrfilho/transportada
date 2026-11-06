/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCnpj } from '@/modules/shared/taxId.service'

import {
  deriveRowFlags,
  describeRowState,
  parseAccessKey,
  type AccessKeyLookupRow as AccessKeyLookupRowModel,
  type AccessKeyLookupRowState,
} from '../shared/accessKeyLookupRow.service'
import styles from '../styles/accessKeyLookup.module.css'

export type AccessKeyLookupRowProps = Readonly<{
  /** O pai decide quais botões a linha oferece: sem o callback, o botão não existe. */
  onAdd?: (accessKey: string, documentId: string) => void
  onOpen?: (accessKey: string, documentId: string) => void
  onRetry?: (accessKey: string) => void
  onSendXml?: (accessKey: string) => void
  row: AccessKeyLookupRowModel
  /** Avisos do pai (ex.: nota já em outra viagem), mostrados abaixo da mensagem. */
  children?: ReactNode
}>

const BADGE_VARIANT: Readonly<
  Record<AccessKeyLookupRowState['kind'], NonNullable<BadgeProps['variant']>>
> = {
  checking: 'info',
  error: 'warning',
  failed: 'warning',
  ready: 'success',
  refused: 'warning',
  searching: 'info',
  stalled: 'warning',
  waiting: 'secondary',
}

function formatWindowTime(notBefore: string, language: string): string | undefined {
  const moment = new Date(notBefore)
  if (Number.isNaN(moment.getTime())) return undefined
  return new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(moment)
}

export function AccessKeyLookupRow({
  children,
  onAdd,
  onOpen,
  onRetry,
  onSendXml,
  row,
}: AccessKeyLookupRowProps) {
  const { i18n, t } = useTranslation('accessKeyLookup')
  const parsed = parseAccessKey(row.accessKey)
  const flags = deriveRowFlags(row.state)
  const { state } = row
  const messageKey = describeRowState(state)
  const windowTime =
    state.kind === 'waiting' && state.notBefore !== null
      ? formatWindowTime(state.notBefore, i18n.language)
      : undefined
  const progressMessage =
    state.kind === 'checking'
      ? t('state.checking')
      : state.kind === 'searching'
        ? t('state.searching')
        : state.kind === 'waiting'
          ? windowTime === undefined
            ? t('state.waitingNoTime')
            : t('state.waiting', { time: windowTime })
          : undefined
  const documentId = state.kind === 'ready' ? state.documentId : undefined

  return (
    <li className={styles.row} data-state={state.kind}>
      <div className={styles.identity}>
        <span className={styles.number}>{t('row.number', { number: parsed.number })}</span>
        <span className={styles.meta}>{t('row.series', { series: parsed.series })}</span>
        <span className={styles.meta}>
          {t('row.issuer', { taxId: formatCnpj(parsed.issuerTaxId) })}
        </span>
        <Badge variant={BADGE_VARIANT[state.kind]}>{t(`badge.${state.kind}`)}</Badge>
      </div>
      {progressMessage === undefined ? null : (
        <p aria-live="polite" className={styles.message}>
          {progressMessage}
        </p>
      )}
      {messageKey === undefined ? null : <p className={styles.message}>{t(messageKey)}</p>}
      {children}
      <div className={styles.actions}>
        {flags.canAdd && documentId !== undefined && onAdd !== undefined ? (
          <Button onClick={() => onAdd(row.accessKey, documentId)} size="sm" type="button">
            {t('action.add')}
          </Button>
        ) : null}
        {documentId !== undefined && onOpen !== undefined ? (
          <Button
            onClick={() => onOpen(row.accessKey, documentId)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {t('action.open')}
          </Button>
        ) : null}
        {flags.canSendXml && onSendXml !== undefined ? (
          <Button
            onClick={() => onSendXml(row.accessKey)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {t('action.sendXml')}
          </Button>
        ) : null}
        {flags.canRetry && onRetry !== undefined ? (
          <Button
            onClick={() => onRetry(row.accessKey)}
            size="sm"
            type="button"
            variant="secondary"
          >
            {t('action.retry')}
          </Button>
        ) : null}
      </div>
    </li>
  )
}
