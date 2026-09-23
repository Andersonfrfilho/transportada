/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

import { formatAmount, sumScaledAmounts } from '@/modules/shared/decimalAmount.service'

import type { TripRevenueEntryFormFields } from '../shared/tripRevenueEntryForm.service'
import type { CompanyEntryKind, TripRevenueEntry } from '../shared/tripFinancials.types'
import styles from '../styles/tripFinancials.module.css'
import { TripRevenueEntryForm } from './TripRevenueEntryForm.component'

type TripRevenueEntriesProps = Readonly<{
  canRecord: boolean
  entries: readonly TripRevenueEntry[]
  entryKinds: readonly CompanyEntryKind[]
  isError: boolean
  isLoading: boolean
  isRecording: boolean
  isRemoving: boolean
  onRecord: (fields: TripRevenueEntryFormFields) => Promise<boolean>
  onRemove: (entryId: string) => Promise<boolean>
  onRetry: () => void
}>

const momentFormatter = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
})

/**
 * Spec 169 P1/RF4: "Receita lançada" — linha **separada** do frete previsto (decisão registrada no
 * topo do spec.md), com autor e momento, e o campo para lançar mais uma. Espelha
 * `TripCostEntries.component.tsx`.
 *
 * ⚠️ A falha desta lista **não apaga o painel**: ela tem bandeira e nova tentativa próprias.
 */
export function TripRevenueEntries({
  canRecord,
  entries,
  entryKinds,
  isError,
  isLoading,
  isRecording,
  isRemoving,
  onRecord,
  onRemove,
  onRetry,
}: TripRevenueEntriesProps) {
  const { t } = useTranslation('tripFinancials')

  return (
    <div className={styles.costEntries}>
      <header className={styles.costEntriesHeader}>
        <h3 className={styles.costEntriesTitle}>{t('revenueEntries.title')}</h3>
        {/* O total do bloco poupa a soma de cabeça: a lista já diz quanto foi lançado. */}
        {entries.length === 0 ? null : (
          <p className={styles.costEntriesTotal}>
            <span className={styles.costEntriesTotalLabel}>{t('revenueEntries.total')}</span>
            <span className={cn(styles.costEntriesTotalAmount, styles.amountIn)}>
              {formatAmount(sumScaledAmounts(entries.map((entry) => entry.amount)))}
            </span>
          </p>
        )}
      </header>
      {isLoading ? (
        <SkeletonGroup label={t('revenueEntries.loading')}>
          <Skeleton height="1.5rem" />
          <Skeleton height="1.5rem" />
        </SkeletonGroup>
      ) : null}
      {isError ? (
        <>
          <p className={styles.hint} role="alert">
            {t('revenueEntries.error')}
          </p>
          <Button onClick={onRetry} size="sm" type="button" variant="ghost">
            <Icon name="refresh" />
            {t('revenueEntries.retry')}
          </Button>
        </>
      ) : null}
      {!isLoading && !isError && entries.length === 0 ? (
        <p className={styles.costEntriesEmpty}>{t('revenueEntries.empty')}</p>
      ) : null}
      {/* ⚠️ A ordem é a que a API devolveu (mais recente primeiro) — reordenar aqui divergiria dela. */}
      {entries.length === 0 ? null : (
        <ul className={styles.costEntryList}>
          {entries.map((entry) => (
            <li key={entry.id}>
              <span className={cn(styles.costEntryAmount, styles.amountIn)}>
                {formatAmount(entry.amount)}
              </span>
              <div className={styles.costEntryBody}>
                <span className={styles.costEntryKind}>{entry.entryKind.name}</span>
                <span className={styles.costEntryDescription}>{entry.description}</span>
                <span className={styles.costEntryMeta}>
                  {t('revenueEntries.by', {
                    actor:
                      entry.actor.name === '' ? t('revenueEntries.unknownActor') : entry.actor.name,
                    moment: momentFormatter.format(new Date(entry.createdAt)),
                  })}
                </span>
              </div>
              {canRecord ? (
                <div className={styles.costEntryAction}>
                  <Button
                    className={styles.costEntryRemove}
                    disabled={isRemoving}
                    onClick={() => void onRemove(entry.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Icon name="trash" />
                    {t('revenueEntries.remove')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canRecord ? (
        <TripRevenueEntryForm
          entryKinds={entryKinds}
          isRecording={isRecording}
          onRecord={onRecord}
        />
      ) : null}
    </div>
  )
}
