/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton } from '@/components/ui/skeleton'

import { groupPermissions } from '../shared/permissionGroups.constant'
import type { RolePermissionMatrix } from '../shared/companyUsers.types'
import styles from '../styles/userAdministration.module.css'

type RolePermissionMatrixPanelProps = Readonly<{
  isLoading: boolean
  /**
   * Painel em tela dedicada não se esconde: sem `onToggle` ele nasce aberto e não desenha o botão.
   * O que era estado da página virou ausência de prop — a tela declara o que ela é.
   */
  isOpen?: boolean
  onToggle?: () => void
  errorCode?: string
  matrix?: RolePermissionMatrix
}>

/**
 * A matriz existia em código e era invisível: ninguém respondia "o que este papel enxerga?" sem
 * abrir o repositório — nem quem concede o papel. Esta tela é a resposta, e ela é de leitura: quem
 * muda o que um papel alcança continua sendo o código, com revisão.
 */
export function RolePermissionMatrixPanel({
  errorCode,
  isLoading,
  isOpen = true,
  matrix,
  onToggle,
}: RolePermissionMatrixPanelProps) {
  const { t } = useTranslation('identity')
  const groups = matrix === undefined ? [] : groupPermissions(matrix.permissions)
  const roles = matrix?.roles ?? []

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2>{t('users.matrix.title')}</h2>
        {/* Em tela dedicada não há o que esconder: o painel é a tela. */}
        {onToggle === undefined ? null : (
          <Button onClick={onToggle} type="button" variant="default">
            <Icon name={isOpen ? 'close' : 'search'} />
            {isOpen ? t('users.matrix.hide') : t('users.matrix.show')}
          </Button>
        )}
      </div>

      <p className={styles.intro}>{t('users.matrix.intro')}</p>

      {!isOpen ? null : isLoading ? (
        <Skeleton height="12rem" variant="block" />
      ) : errorCode !== undefined || matrix === undefined ? (
        <p className={styles.feedback} role="alert">
          {t(`users.errors.${errorCode}`, { defaultValue: t('users.errors.default') })}
        </p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={styles.matrixTable}>
            <thead>
              <tr>
                <th scope="col">{t('users.matrix.columnPermission')}</th>
                {roles.map((entry) => (
                  <th key={entry.role} scope="col">
                    {t(`users.role.${entry.role}`, { defaultValue: entry.role })}
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.key}>
                <tr>
                  <th className={styles.matrixGroup} colSpan={roles.length + 1} scope="colgroup">
                    {t(`users.matrix.group.${group.key}`, { defaultValue: group.key })}
                  </th>
                </tr>
                {group.permissions.map((permission) => (
                  <tr key={permission}>
                    <td>
                      <span className={styles.primaryCell}>
                        {t(`users.permission.${permission}.label`, { defaultValue: permission })}
                      </span>
                      {/* O que ela guarda: sem isso a matriz vira uma grade de códigos. */}
                      <span className={styles.secondaryCell}>
                        {t(`users.permission.${permission}.where`, { defaultValue: permission })}
                      </span>
                    </td>
                    {roles.map((entry) => (
                      <td className={styles.matrixCell} key={entry.role}>
                        {/* O ícone é decorativo; quem anuncia ao leitor de tela é o rótulo de fora. */}
                        <span
                          aria-label={
                            entry.permissions.includes(permission)
                              ? t('users.matrix.granted')
                              : t('users.matrix.denied')
                          }
                          role="img"
                        >
                          {entry.permissions.includes(permission) ? <Icon name="check" /> : '—'}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </section>
  )
}
