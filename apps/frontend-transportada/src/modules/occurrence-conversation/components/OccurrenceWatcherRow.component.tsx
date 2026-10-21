/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'

import type { OccurrenceWatcherItem } from '../shared/occurrenceWatchers.types'
import styles from '../styles/occurrenceConversation.module.css'

type OccurrenceWatcherRowProps = Readonly<{
  isBusy: boolean
  onRemove: () => void
  onToggle: (isActive: boolean) => void
  watcher: OccurrenceWatcherItem
}>

/** O usuário, o interruptor Ativo/Inativo (PATCH) e o "Remover". Inelegível continua na lista, marcado. */
export function OccurrenceWatcherRow({
  isBusy,
  onRemove,
  onToggle,
  watcher,
}: OccurrenceWatcherRowProps) {
  const { t } = useTranslation('occurrenceConversation')
  const name = watcher.name === '' ? t('watchers.unknownUser') : watcher.name

  return (
    <li
      className={[
        styles.watcherRow,
        watcher.status === 'active' ? '' : styles.watcherInactive,
      ].join(' ')}
    >
      <div className={styles.watcherIdentity}>
        <span className={styles.watcherName}>
          <strong>{name}</strong>
          {watcher.eligible ? null : <span className={styles.tag}>{t('watchers.ineligible')}</span>}
        </span>
        {watcher.maskedEmail === null ? (
          <span className={styles.hint}>{t('watchers.noEmail')}</span>
        ) : (
          <span className={styles.hint}>{watcher.maskedEmail}</span>
        )}
      </div>
      <div className={styles.quickReplyActions}>
        <Checkbox
          checked={watcher.status === 'active'}
          disabled={isBusy}
          label={t('watchers.active')}
          onChange={onToggle}
        />
        <Button disabled={isBusy} onClick={onRemove} size="sm" type="button" variant="secondary">
          {t('watchers.remove')}
        </Button>
      </div>
    </li>
  )
}
