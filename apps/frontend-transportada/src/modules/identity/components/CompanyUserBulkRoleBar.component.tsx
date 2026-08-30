/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'

import type { CompanyGroup, CompanyUser } from '../shared/companyUsers.types'
import styles from '../styles/userAdministration.module.css'

type CompanyUserBulkRoleBarProps = Readonly<{
  groups: readonly CompanyGroup[]
  onApply: (roles: readonly string[]) => void
  onApplyGroups: (groupIds: readonly string[]) => void
  onClearSelection: () => void
  onUnselect: (userId: string) => void
  roleChoices: readonly string[]
  selectedUsers: readonly CompanyUser[]
  isPending?: boolean
}>

/**
 * A barra só existe com seleção: uma barra vazia permanente ensina a ignorá-la, e é exatamente
 * quando ela aparece que o operador precisa notar que está prestes a mexer em várias pessoas.
 *
 * Os dois lados viram pills — quem foi escolhido e o que será aplicado. O lote é a ação mais fácil
 * de errar da tela, e a pill é o que deixa o erro visível **antes** do clique, não depois.
 */
export function CompanyUserBulkRoleBar({
  groups,
  isPending = false,
  onApply,
  onApplyGroups,
  onClearSelection,
  onUnselect,
  roleChoices,
  selectedUsers,
}: CompanyUserBulkRoleBarProps) {
  const { t } = useTranslation('identity')
  const [roles, setRoles] = useState<readonly string[]>([])
  const [groupIds, setGroupIds] = useState<readonly string[]>([])

  if (selectedUsers.length === 0) return null

  function handleApply(): void {
    if (roles.length === 0) return
    onApply(roles)
    setRoles([])
  }

  function handleApplyGroups(): void {
    if (groupIds.length === 0) return
    onApplyGroups(groupIds)
    setGroupIds([])
  }

  return (
    <div className={styles.bulkBar} role="group">
      <div className={styles.bulkHead}>
        <strong>{t('users.bulk.selected', { count: selectedUsers.length })}</strong>
        <Button onClick={onClearSelection} size="sm" type="button" variant="ghost">
          <Icon name="close" />
          {t('users.bulk.clearSelection')}
        </Button>
      </div>

      <div className={styles.pillList}>
        {selectedUsers.map((user) => (
          <span className={styles.pill} key={user.id}>
            {user.name === '' ? t('users.noProfile') : user.name}
            <Button
              aria-label={t('users.bulk.unselect', { name: user.name })}
              onClick={() => onUnselect(user.id)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="close" />
            </Button>
          </span>
        ))}
      </div>

      <div className={styles.bulkActions}>
        <MultiSelect
          ariaLabel={t('users.bulk.rolesLabel')}
          clearAllLabel={t('users.bulk.clearRoles')}
          compact
          emptyLabel={t('users.bulk.noRole')}
          onChange={setRoles}
          options={roleChoices.map((role) => ({
            label: t(`users.role.${role}`, { defaultValue: role }),
            value: role,
          }))}
          placeholder={t('users.bulk.rolesPlaceholder')}
          removeLabel={t('users.bulk.removeRole')}
          searchPlaceholder={t('users.bulk.searchRole')}
          summaryLabel={(count) => t('users.bulk.rolesSummary', { count })}
          values={roles}
        />
        <Button disabled={roles.length === 0 || isPending} onClick={handleApply} type="button">
          <Icon name="check" />
          {t('users.bulk.apply', { count: selectedUsers.length })}
        </Button>
      </div>

      {/* O grupo é a via normal de conceder acesso; o papel avulso é o atalho de quem já sabe qual. */}
      {groups.length === 0 ? null : (
        <div className={styles.bulkActions}>
          <MultiSelect
            ariaLabel={t('users.bulk.groupsLabel')}
            clearAllLabel={t('users.bulk.clearGroups')}
            compact
            emptyLabel={t('users.bulk.noGroup')}
            onChange={setGroupIds}
            options={groups.map((group) => ({ label: group.name, value: group.id }))}
            placeholder={t('users.bulk.groupsPlaceholder')}
            removeLabel={t('users.bulk.removeGroup')}
            searchPlaceholder={t('users.bulk.searchGroup')}
            summaryLabel={(count) => t('users.bulk.groupsSummary', { count })}
            values={groupIds}
          />
          <Button
            disabled={groupIds.length === 0 || isPending}
            onClick={handleApplyGroups}
            type="button"
          >
            <Icon name="check" />
            {t('users.bulk.applyGroups', { count: selectedUsers.length })}
          </Button>
        </div>
      )}

      {/* Acrescentar, não trocar: dizer isso antes do clique evita a surpresa que não tem desfazer. */}
      <p className={styles.hint}>{t('users.bulk.addsOnly')}</p>
    </div>
  )
}
