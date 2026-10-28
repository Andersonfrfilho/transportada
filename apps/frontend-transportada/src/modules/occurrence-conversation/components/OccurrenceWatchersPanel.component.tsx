/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import {
  useOccurrenceWatcherCandidatesQuery,
  useOccurrenceWatcherMutations,
  useOccurrenceWatchersQuery,
} from '../queries/occurrenceWatchers.query'
import { OccurrenceConversationRequestError } from '../shared/occurrenceConversationClient.service'
import {
  OCCURRENCE_WATCHER_MAX_ACTIVE,
  availableWatcherCandidates,
  canAddOccurrenceWatcher,
  describeWatcherListSource,
} from '../shared/occurrenceWatchers.service'
import type {
  OccurrenceWatcherItem,
  OccurrenceWatcherScope,
} from '../shared/occurrenceWatchers.types'
import styles from '../styles/occurrenceConversation.module.css'
import { OccurrenceWatcherRemoveDialog } from './OccurrenceWatcherRemoveDialog.component'
import { OccurrenceWatcherRow } from './OccurrenceWatcherRow.component'

const KNOWN_ERRORS = new Set([
  'OCCURRENCE_WATCHER_NOT_ELIGIBLE',
  'OCCURRENCE_WATCHER_LIST_TOO_LONG',
  'OCCURRENCE_WATCHER_NOT_FOUND',
  'CONTRACTOR_NOT_FOUND',
])

function errorKey(error: unknown): string {
  if (error instanceof OccurrenceConversationRequestError && KNOWN_ERRORS.has(error.code)) {
    return `watchers.error.${error.code}`
  }
  return 'watchers.error.generic'
}

type OccurrenceWatchersPanelProps = Readonly<{
  canManage: boolean
  scope: OccurrenceWatcherScope
}>

/**
 * Spec 267 RF1/RF2: os responsáveis por ocorrências que vão em cópia no e-mail da contratante, autocontido — a aba de
 * Configurações (empresa) e a ficha da contratante só decidem onde mostrá-lo. Na ficha, diz qual lista vale.
 */
export function OccurrenceWatchersPanel({ canManage, scope }: OccurrenceWatchersPanelProps) {
  const { t } = useTranslation('occurrenceConversation')
  const query = useOccurrenceWatchersQuery({ enabled: canManage, scope })
  const candidates = useOccurrenceWatcherCandidatesQuery({ enabled: canManage })
  const mutations = useOccurrenceWatcherMutations(scope)
  const [selectedUserId, setSelectedUserId] = useState('')
  const [removing, setRemoving] = useState<OccurrenceWatcherItem | null>(null)

  if (query.isLoading) {
    return (
      <SkeletonGroup label={t('watchers.loading')}>
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="6rem" width="100%" />
      </SkeletonGroup>
    )
  }
  if (query.isError) {
    return (
      <p className={styles.hint} role="alert">
        {t('watchers.loadError')}
      </p>
    )
  }

  const list = query.data
  const watchers = list?.watchers ?? []
  const failure = [mutations.add, mutations.remove, mutations.setStatus].find(
    (mutation) => mutation.isError,
  )
  const isBusy =
    mutations.add.isPending || mutations.setStatus.isPending || mutations.remove.isPending
  const options = availableWatcherCandidates(candidates.data ?? [], watchers).map((candidate) => ({
    label:
      candidate.maskedEmail === null
        ? candidate.name
        : `${candidate.name} · ${candidate.maskedEmail}`,
    value: candidate.userId,
  }))
  const canAdd = canAddOccurrenceWatcher(watchers)

  function handleAdd(): void {
    if (selectedUserId === '') return
    mutations.add.mutate(selectedUserId, { onSuccess: () => setSelectedUserId('') })
  }

  return (
    <div className={`${styles.panel} ${styles.settingsPanel}`}>
      <div className={styles.settingsHeading}>
        {scope.kind === 'company' ? <h2>{t('watchers.title')}</h2> : null}
        <p className={styles.hint}>
          {scope.kind === 'company'
            ? t('watchers.description')
            : t(
                `watchers.source.${describeWatcherListSource(list?.effectiveSource ?? null, watchers.length)}`,
              )}
        </p>
      </div>
      {failure === undefined ? null : (
        <p className={styles.error} role="alert">
          {t(errorKey(failure.error))}
        </p>
      )}
      {watchers.length === 0 ? (
        <p className={styles.hint}>
          {t(scope.kind === 'company' ? 'watchers.empty' : 'watchers.emptyContractor')}
        </p>
      ) : (
        <ul className={styles.watcherList}>
          {watchers.map((watcher) => (
            <OccurrenceWatcherRow
              isBusy={isBusy}
              key={watcher.userId}
              onRemove={() => setRemoving(watcher)}
              onToggle={(isActive) =>
                mutations.setStatus.mutate({
                  status: isActive ? 'active' : 'inactive',
                  userId: watcher.userId,
                })
              }
              watcher={watcher}
            />
          ))}
        </ul>
      )}
      <div className={styles.watcherAdd}>
        <div className={styles.field}>
          <span>{t('watchers.addLabel')}</span>
          <Select
            ariaLabel={t('watchers.addLabel')}
            disabled={isBusy || !canAdd || options.length === 0}
            emptyLabel={t('watchers.noCandidates')}
            onChange={setSelectedUserId}
            options={options}
            placeholder={t('watchers.addPlaceholder')}
            value={selectedUserId}
          />
        </div>
        <Button disabled={isBusy || selectedUserId === ''} onClick={handleAdd} type="button">
          {t('watchers.add')}
        </Button>
      </div>
      {canAdd ? null : (
        <p className={styles.hint}>
          {t('watchers.limit', { count: OCCURRENCE_WATCHER_MAX_ACTIVE })}
        </p>
      )}
      {removing === null ? null : (
        <OccurrenceWatcherRemoveDialog
          isPending={mutations.remove.isPending}
          name={removing.name === '' ? t('watchers.unknownUser') : removing.name}
          onCancel={() => setRemoving(null)}
          onConfirm={() =>
            mutations.remove.mutate(removing.userId, { onSettled: () => setRemoving(null) })
          }
        />
      )}
    </div>
  )
}
