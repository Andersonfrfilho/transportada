/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { CteProfileForm } from '../components/CteProfileForm.component'
import { CteProfileList } from '../components/CteProfileList.component'
import { useCteProfiles } from '../hooks/useCteProfiles.hook'
import type { CteProfileDetail } from '../shared/cteProfiles.types'
import styles from '../styles/cteProfiles.module.css'

type ListPanelProps = Readonly<{
  onEdit: (profile?: CteProfileDetail) => void
  workspace: ReturnType<typeof useCteProfiles>
}>

function ListPanel({ onEdit, workspace }: ListPanelProps) {
  const { t } = useTranslation('cteProfiles')
  const { viewModel } = workspace

  return (
    <section className={styles.panel} aria-labelledby="cte-profiles-list">
      <div className={styles.panelHead}>
        <h2 id="cte-profiles-list">{t('listTitle')}</h2>
        {viewModel.canManageProfiles ? (
          <Button size="sm" type="button" onClick={() => onEdit(undefined)}>
            <Icon name="add" />
            {t('newProfile')}
          </Button>
        ) : null}
      </div>
      {viewModel.status === 'forbidden' ? <p className={styles.hint}>{t('readOnly')}</p> : null}
      {viewModel.status === 'loading' ? <p className={styles.hint}>{t('loading')}</p> : null}
      {viewModel.status === 'error' ? <p className={styles.hint}>{t('error')}</p> : null}
      {viewModel.status === 'empty' ? <p className={styles.hint}>{t('empty')}</p> : null}
      {viewModel.status === 'ready' && viewModel.profiles !== undefined ? (
        <CteProfileList
          profiles={viewModel.profiles}
          {...(viewModel.selectedProfileId === undefined
            ? {}
            : { selectedProfileId: viewModel.selectedProfileId })}
          onActivate={(input) => workspace.activateProfileMutation.mutate(input)}
          onDeactivate={(input) => workspace.deactivateProfileMutation.mutate(input)}
          onEdit={onEdit}
        />
      ) : null}
    </section>
  )
}

export function CteProfilesPage() {
  const { t } = useTranslation('cteProfiles')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const companyId = authQuery.data?.data.company.id
  const workspace = useCteProfiles({
    ...(companyId === undefined ? {} : { companyId }),
    permissions,
  })
  const [editing, setEditing] = useState<null | { profile?: CteProfileDetail }>(null)
  const isEditing = editing !== null && workspace.viewModel.canManageProfiles
  const deckClassName = isEditing
    ? `${styles.workspaceDeck} ${styles.workspaceDeckEditing}`
    : styles.workspaceDeck

  return (
    <main className={styles.cteProfilesShell}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('kicker')}</p>
        <h1>{t('title')}</h1>
        <p className={styles.intro}>{t('intro')}</p>
      </header>
      <section className={deckClassName}>
        <ListPanel
          onEdit={(profile) => setEditing({ ...(profile ? { profile } : {}) })}
          workspace={workspace}
        />
        {!isEditing || editing === null ? null : (
          <CteProfileForm
            key={editing.profile?.id ?? 'new-profile'}
            {...(editing.profile === undefined ? {} : { profile: editing.profile })}
            onCancel={() => setEditing(null)}
            onCreate={(body) => workspace.createProfileMutation.mutateAsync(body)}
            onUpdate={(input) => workspace.updateProfileMutation.mutateAsync(input)}
          />
        )}
      </section>
    </main>
  )
}
