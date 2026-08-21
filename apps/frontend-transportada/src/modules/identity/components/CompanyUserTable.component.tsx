/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { CompanyUser } from '../shared/companyUsers.types'
import styles from '../styles/userAdministration.module.css'

type CompanyUserTableProps = Readonly<{
  onChangeStatus: (input: Readonly<{ status: 'active' | 'suspended'; userId: string }>) => void
  onEdit: (user: CompanyUser) => void
  onRemove: (user: CompanyUser) => void
  onResend: (user: CompanyUser) => void
  users: readonly CompanyUser[]
  /** Ausente enquanto `/auth/me` não respondeu; a linha do próprio acesso só some depois disso. */
  currentUserId: string | undefined
}>

const STATUS_CLASS: Readonly<Record<string, string | undefined>> = {
  active: styles.statusActive,
  invited: styles.statusInvited,
  suspended: styles.statusSuspended,
}

export function CompanyUserTable({
  currentUserId,
  onChangeStatus,
  onEdit,
  onRemove,
  onResend,
  users,
}: CompanyUserTableProps) {
  const { t } = useTranslation('identity')

  function statusClassName(status: string): string {
    const modifier = STATUS_CLASS[status]
    return modifier === undefined ? (styles.badge ?? '') : `${styles.badge ?? ''} ${modifier}`
  }

  return (
    <div className={styles.tableScroll}>
      <table className={styles.userTable}>
        <thead>
          <tr>
            <th scope="col">{t('users.columnName')}</th>
            <th scope="col">{t('users.columnContact')}</th>
            <th scope="col">{t('users.columnRoles')}</th>
            <th scope="col">{t('users.columnStatus')}</th>
            <th className={styles.actionsCell} scope="col">
              {t('users.columnActions')}
            </th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>
                <span className={styles.primaryCell}>{user.name}</span>
                <span className={styles.secondaryCell}>{user.username}</span>
              </td>
              <td>
                <span className={styles.primaryCell}>{user.contact.masked}</span>
                <span className={styles.secondaryCell}>
                  {t(`users.channel.${user.contact.channel}`, {
                    defaultValue: user.contact.channel,
                  })}
                </span>
              </td>
              <td>
                <span className={styles.roleList}>
                  {user.roles.map((role) => (
                    <span className={styles.badge} key={role}>
                      {t(`users.role.${role}`, { defaultValue: role })}
                    </span>
                  ))}
                </span>
              </td>
              <td>
                <span className={statusClassName(user.status)}>
                  {t(`users.status.${user.status}`, { defaultValue: user.status })}
                </span>
              </td>
              <td className={styles.actionsCell}>
                <div className={styles.rowActions}>
                  <Button size="sm" type="button" variant="ghost" onClick={() => onEdit(user)}>
                    <Icon name="edit" />
                    {t('users.edit')}
                  </Button>
                  {user.invitation === undefined ? null : (
                    <Button size="sm" type="button" variant="ghost" onClick={() => onResend(user)}>
                      <Icon name="send" />
                      {t('users.resend')}
                    </Button>
                  )}
                  {user.status === 'suspended' ? (
                    <Button
                      size="sm"
                      type="button"
                      variant="secondary"
                      onClick={() => onChangeStatus({ status: 'active', userId: user.id })}
                    >
                      <Icon name="power" />
                      {t('users.activate')}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      type="button"
                      variant="ghost"
                      onClick={() => onChangeStatus({ status: 'suspended', userId: user.id })}
                    >
                      <Icon name="power" />
                      {t('users.suspend')}
                    </Button>
                  )}
                  <Button
                    aria-label={t('users.copyMembershipId')}
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => void navigator.clipboard.writeText(user.membershipId)}
                  >
                    <Icon name="copy" />
                  </Button>
                  {/* Remover a si mesmo é 409 na API: a linha do próprio acesso não oferece a ação. */}
                  {user.id === currentUserId ? null : (
                    <Button size="sm" type="button" variant="ghost" onClick={() => onRemove(user)}>
                      <Icon name="trash" />
                      {t('users.remove')}
                    </Button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
