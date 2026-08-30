/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

import type { CompanyGroup, CompanyUser } from '../shared/companyUsers.types'
import styles from '../styles/userAdministration.module.css'

type CompanyGroupAssignmentPanelProps = Readonly<{
  groups: readonly CompanyGroup[]
  hasMoreCandidates: boolean
  isLoading: boolean
  isPending: boolean
  onAssign: () => void
  onSelectGroup: (groupId: string) => void
  onSelectUsers: (userIds: readonly string[]) => void
  selectedGroupId: string
  selectedUserIds: readonly string[]
  users: readonly CompanyUser[]
  errorCode?: string
}>

/**
 * Atribuir o grupo a várias pessoas de uma vez. A mesma operação existe na barra de seleção da
 * listagem, e as duas são legítimas por caminhos opostos: lá se parte **das pessoas** que estão na
 * tela, aqui se parte **do grupo** que acabou de ser desenhado.
 *
 * A atribuição **soma** — nunca tira. Quem já está no grupo é ignorado pela chave, não por laço.
 */
export function CompanyGroupAssignmentPanel({
  errorCode,
  groups,
  hasMoreCandidates,
  isLoading,
  isPending,
  onAssign,
  onSelectGroup,
  onSelectUsers,
  selectedGroupId,
  selectedUserIds,
  users,
}: CompanyGroupAssignmentPanelProps) {
  const { t } = useTranslation('identity')

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2>{t('profiles.assign.title')}</h2>
      </div>

      <p className={styles.intro}>{t('profiles.assign.intro')}</p>

      {isLoading ? (
        <Skeleton height="6rem" variant="block" />
      ) : (
        <>
          {errorCode === undefined ? null : (
            <p className={styles.feedback} role="alert">
              {t(`users.errors.${errorCode}`, { defaultValue: t('users.errors.default') })}
            </p>
          )}

          <div className={styles.bulkActions}>
            <Select
              ariaLabel={t('profiles.assign.groupLabel')}
              onChange={onSelectGroup}
              options={groups.map((group) => ({ label: group.name, value: group.id }))}
              placeholder={t('profiles.assign.groupPlaceholder')}
              value={selectedGroupId}
            />
            <MultiSelect
              ariaLabel={t('profiles.assign.usersLabel')}
              clearAllLabel={t('profiles.assign.clearUsers')}
              emptyLabel={t('profiles.assign.noUsers')}
              onChange={onSelectUsers}
              options={users.map((user) => ({
                label: user.name === '' ? user.contact.masked : user.name,
                value: user.id,
              }))}
              placeholder={t('profiles.assign.usersPlaceholder')}
              removeLabel={t('profiles.assign.removeUser')}
              searchPlaceholder={t('profiles.assign.searchUser')}
              summaryLabel={(count) => t('profiles.assign.usersSummary', { count })}
              values={selectedUserIds}
            />
            <Button
              disabled={selectedGroupId === '' || selectedUserIds.length === 0 || isPending}
              onClick={onAssign}
              type="button"
            >
              <Icon name="check" />
              {t('profiles.assign.submit')}
            </Button>
          </div>

          {/* Lista cortada em silêncio manda procurar para sempre alguém que ela não trouxe. */}
          {hasMoreCandidates ? (
            <p className={styles.hint} role="status">
              {t('profiles.assign.truncated')}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
