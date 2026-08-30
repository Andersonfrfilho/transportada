/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'
import { Skeleton } from '@/components/ui/skeleton'

import { COMPANY_ROLES } from '../shared/companyUsers.constant'
import type { CompanyGroup, SaveCompanyGroupInput } from '../shared/companyUsers.types'
import { groupPermissions } from '../shared/permissionGroups.constant'
import styles from '../styles/userAdministration.module.css'

type CompanyGroupPanelProps = Readonly<{
  groups: readonly CompanyGroup[]
  isLoading: boolean
  isOpen: boolean
  isPending: boolean
  onRemove: (groupId: string) => void
  onSave: (group: SaveCompanyGroupInput) => void
  onToggle: () => void
  permissions: readonly string[]
  errorCode?: string
}>

type Draft = {
  description: string
  groupId?: string
  name: string
  permissions: readonly string[]
  roles: readonly string[]
}

const EMPTY_DRAFT: Draft = { description: '', name: '', permissions: [], roles: [] }

/**
 * O grupo é o papel que a empresa desenha: papéis do catálogo mais permissões avulsas, atribuído a
 * várias pessoas de uma vez. A tela existe porque conceder acesso era decisão sem lugar — o papel
 * vinha do código e não havia onde a empresa dizer "estes cinco alcançam isto".
 */
export function CompanyGroupPanel({
  errorCode,
  groups,
  isLoading,
  isOpen,
  isPending,
  onRemove,
  onSave,
  onToggle,
  permissions,
}: CompanyGroupPanelProps) {
  const { t } = useTranslation('identity')
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [isEditing, setEditing] = useState(false)

  function startEditing(group?: CompanyGroup): void {
    setDraft(
      group === undefined
        ? EMPTY_DRAFT
        : {
            description: group.description,
            groupId: group.id,
            name: group.name,
            permissions: [...group.permissions],
            roles: [...group.roles],
          },
    )
    setEditing(true)
  }

  function submit(): void {
    if (draft.name.trim() === '') return
    onSave(draft)
    setDraft(EMPTY_DRAFT)
    setEditing(false)
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2>{t('users.groups.title')}</h2>
        <div className={styles.panelActions}>
          {isOpen ? (
            <Button onClick={() => startEditing()} type="button" variant="default">
              <Icon name="add" />
              {t('users.groups.new')}
            </Button>
          ) : null}
          <Button onClick={onToggle} type="button" variant="ghost">
            <Icon name={isOpen ? 'close' : 'search'} />
            {isOpen ? t('users.groups.hide') : t('users.groups.show')}
          </Button>
        </div>
      </div>

      <p className={styles.intro}>{t('users.groups.intro')}</p>

      {!isOpen ? null : (
        <>
          {errorCode === undefined ? null : (
            <p className={styles.feedback} role="alert">
              {t(`users.errors.${errorCode}`, { defaultValue: t('users.errors.default') })}
            </p>
          )}

          {isEditing ? (
            <div className={styles.bulkBar} role="group">
              <div className={styles.fieldGrid}>
                <label className={`${styles.field ?? ''} ${styles.wideField ?? ''}`}>
                  <span>{t('users.groups.name')}</span>
                  <input
                    onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                    type="text"
                    value={draft.name}
                  />
                </label>
                <label className={`${styles.field ?? ''} ${styles.wideField ?? ''}`}>
                  <span>{t('users.groups.description')}</span>
                  <input
                    onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    type="text"
                    value={draft.description}
                  />
                </label>
              </div>

              <div className={styles.bulkActions}>
                <MultiSelect
                  ariaLabel={t('users.groups.roles')}
                  clearAllLabel={t('users.bulk.clearRoles')}
                  compact
                  emptyLabel={t('users.bulk.noRole')}
                  onChange={(roles) => setDraft({ ...draft, roles })}
                  options={COMPANY_ROLES.map((role) => ({
                    label: t(`users.role.${role}`, { defaultValue: role }),
                    value: role,
                  }))}
                  placeholder={t('users.groups.rolesPlaceholder')}
                  removeLabel={t('users.bulk.removeRole')}
                  searchPlaceholder={t('users.bulk.searchRole')}
                  summaryLabel={(count) => t('users.bulk.rolesSummary', { count })}
                  values={draft.roles}
                />
                <MultiSelect
                  ariaLabel={t('users.groups.permissions')}
                  clearAllLabel={t('users.groups.clearPermissions')}
                  compact
                  emptyLabel={t('users.groups.noPermission')}
                  onChange={(chosen) => setDraft({ ...draft, permissions: chosen })}
                  options={groupPermissions(permissions).flatMap((group) =>
                    group.permissions.map((permission) => ({
                      label: `${t(`users.matrix.group.${group.key}`, { defaultValue: group.key })} · ${t(
                        `users.permission.${permission}.label`,
                        { defaultValue: permission },
                      )}`,
                      value: permission,
                    })),
                  )}
                  placeholder={t('users.groups.permissionsPlaceholder')}
                  removeLabel={t('users.groups.removePermission')}
                  searchPlaceholder={t('users.groups.searchPermission')}
                  summaryLabel={(count) => t('users.groups.permissionsSummary', { count })}
                  values={draft.permissions}
                />
                <Button
                  disabled={draft.name.trim() === '' || isPending}
                  onClick={submit}
                  type="button"
                >
                  <Icon name="save" />
                  {t('users.groups.save')}
                </Button>
                <Button onClick={() => setEditing(false)} type="button" variant="ghost">
                  <Icon name="close" />
                  {t('users.groups.cancel')}
                </Button>
              </div>

              {/* O grupo pode conceder só permissões avulsas: papel é opcional, e dizer isso evita o
                  formulário parecer incompleto. */}
              <p className={styles.hint}>{t('users.groups.rolesOptional')}</p>
            </div>
          ) : null}

          {isLoading ? (
            <Skeleton height="8rem" variant="block" />
          ) : groups.length === 0 ? (
            <p className={styles.intro}>{t('users.groups.empty')}</p>
          ) : (
            <div className={styles.tableScroll}>
              <table>
                <thead>
                  <tr>
                    <th scope="col">{t('users.groups.columnName')}</th>
                    <th scope="col">{t('users.groups.columnGrants')}</th>
                    <th scope="col">{t('users.groups.columnMembers')}</th>
                    <th scope="col">{t('users.groups.columnSync')}</th>
                    <th className={styles.actionsCell} scope="col">
                      {t('users.columnActions')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((group) => (
                    <tr key={group.id}>
                      <td>
                        <span className={styles.primaryCell}>{group.name}</span>
                        <span className={styles.secondaryCell}>{group.description || '—'}</span>
                      </td>
                      <td>
                        <span className={styles.roleList}>
                          {group.roles.map((role) => (
                            <span className={styles.badge} key={role}>
                              {t(`users.role.${role}`, { defaultValue: role })}
                            </span>
                          ))}
                          {group.permissions.map((permission) => (
                            <span className={styles.badge} key={permission}>
                              {t(`users.permission.${permission}.label`, {
                                defaultValue: permission,
                              })}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td>{group.memberCount}</td>
                      <td>
                        {/* Nulo é "ainda não existe no realm" — estado real, não falha a esconder. */}
                        <span
                          className={`${styles.badge ?? ''} ${
                            group.keycloakGroupId === null
                              ? (styles.statusInvited ?? '')
                              : (styles.statusActive ?? '')
                          }`}
                        >
                          {group.keycloakGroupId === null
                            ? t('users.groups.syncPending')
                            : t('users.groups.synced')}
                        </span>
                      </td>
                      <td>
                        <div className={styles.rowActions}>
                          <Button
                            onClick={() => startEditing(group)}
                            size="sm"
                            title={t('users.groups.edit')}
                            type="button"
                            variant="ghost"
                          >
                            <Icon name="edit" />
                            {t('users.groups.edit')}
                          </Button>
                          <Button
                            disabled={isPending}
                            onClick={() => onRemove(group.id)}
                            size="sm"
                            title={t('users.groups.remove')}
                            type="button"
                            variant="ghost"
                          >
                            <Icon name="trash" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  )
}
