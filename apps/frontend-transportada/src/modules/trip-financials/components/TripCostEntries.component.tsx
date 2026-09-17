/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { TripCostEntryFormFields } from '../shared/tripCostEntryForm.service'
import type { TripCostEntry } from '../shared/tripFinancials.types'
import styles from '../styles/tripFinancials.module.css'
import { TripCostEntryForm } from './TripCostEntryForm.component'

type TripCostEntriesProps = Readonly<{
  canRecord: boolean
  entries: readonly TripCostEntry[]
  isError: boolean
  isLoading: boolean
  isRecording: boolean
  onRecord: (fields: TripCostEntryFormFields) => Promise<boolean>
  onRetry: () => void
}>

const momentFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

/**
 * Spec 143 D6: o que já foi lançado nesta viagem, com autor e momento, e o campo para lançar mais.
 *
 * ⚠️ A falha desta lista **não apaga o painel**: ela tem bandeira e nova tentativa próprias, porque
 * o ramo de erro do painel devolveria só a caixa de erro e o ledger sumiria junto.
 */
export function TripCostEntries({
  canRecord,
  entries,
  isError,
  isLoading,
  isRecording,
  onRecord,
  onRetry,
}: TripCostEntriesProps) {
  const { t } = useTranslation('tripFinancials')

  return (
    <div className={styles.costEntries}>
      <h3>{t('costEntries.title')}</h3>
      {isLoading ? (
        <SkeletonGroup label={t('costEntries.loading')}>
          <Skeleton height="1.5rem" />
          <Skeleton height="1.5rem" />
        </SkeletonGroup>
      ) : null}
      {isError ? (
        <>
          <p className={styles.hint} role="alert">
            {t('costEntries.error')}
          </p>
          <Button onClick={onRetry} size="sm" type="button" variant="ghost">
            <Icon name="refresh" />
            {t('costEntries.retry')}
          </Button>
        </>
      ) : null}
      {!isLoading && !isError && entries.length === 0 ? (
        <p className={styles.hint}>{t('costEntries.empty')}</p>
      ) : null}
      {/* ⚠️ A ordem é a que a API devolveu (mais recente primeiro) — reordenar aqui divergiria dela. */}
      {entries.length === 0 ? null : (
        <ul className={styles.costEntryList}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <span className={styles.amountOut}>{formatAmount(entry.amount)}</span>
              <span>{t(`costEntries.kinds.${entry.kind}`)}</span>
              <span className={styles.costEntryDescription}>{entry.description}</span>
              <span className={styles.hint}>
                {t('costEntries.by', {
                  actor: entry.actor.name === '' ? t('costEntries.unknownActor') : entry.actor.name,
                  moment: momentFormatter.format(new Date(entry.createdAt)),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canRecord ? <TripCostEntryForm isRecording={isRecording} onRecord={onRecord} /> : null}
    </div>
  )
}
