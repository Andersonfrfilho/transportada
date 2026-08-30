/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'
import { Skeleton } from '@/components/ui/skeleton'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import {
  navigateToFleetDriver,
  navigateToFleetVehicle,
  createBrowserWorkspaceNavigator,
} from '../shared/fleetNavigation.service'
import type { CompanyUser } from '../shared/companyUsers.types'
import { groupPermissions } from '../shared/permissionGroups.constant'
import styles from '../styles/userAdministration.module.css'

type CompanyUserPermissionsDialogProps = Readonly<{
  catalog: readonly string[]
  granted: readonly string[]
  isLoading: boolean
  isPending: boolean
  onClose: () => void
  onGrant: (permissions: readonly string[]) => void
  onRevoke: (permission: string) => void
  user: CompanyUser | null
}>

/**
 * A permissão avulsa é **exceção**: o caminho normal é o grupo, e o que se espera é que quase
 * ninguém tenha uma. Ela vive aqui, no detalhe da pessoa, e não na listagem — conceder acesso fora
 * do grupo é decisão sobre um indivíduo, e a tela precisa mostrar de quem se está falando.
 *
 * É aqui também que mora o caminho por extenso para a ficha da frota: na linha ele é ação rápida
 * com ícone, e o rótulo inteiro competia com o papel da pessoa, que é o que se lê na listagem.
 */
export function CompanyUserPermissionsDialog({
  catalog,
  granted,
  isLoading,
  isPending,
  onClose,
  onGrant,
  onRevoke,
  user,
}: CompanyUserPermissionsDialogProps) {
  const { t } = useTranslation('identity')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen: user !== null, onClose })
  const [chosen, setChosen] = useState<readonly string[]>([])
  const navigator = createBrowserWorkspaceNavigator()

  if (user === null) return null

  function grant(): void {
    if (chosen.length === 0) return
    onGrant(chosen)
    setChosen([])
  }

  return createPortal(
    <div className={styles.overlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="company-user-permissions-title"
        aria-modal="true"
        className={styles.dialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.dialogHeader}>
          <div>
            <h2 id="company-user-permissions-title">
              {user.name === '' ? t('users.noProfile') : user.name}
            </h2>
            <p className={styles.hint}>{t('users.permissions.intro')}</p>
          </div>
          <Button
            aria-label={t('users.inviteDialog.close')}
            onClick={onClose}
            size="sm"
            type="button"
            variant="ghost"
          >
            <Icon name="close" />
          </Button>
        </header>

        {user.fleet === undefined ? null : (
          <div className={styles.pillList}>
            <Button
              onClick={() =>
                navigateToFleetDriver({ driverId: user.fleet?.driverId ?? '', navigator })
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="link" />
              {t('users.fleet.driver')}
            </Button>
            {user.fleet.vehicles.map((vehicle) => (
              <Button
                key={vehicle.id}
                onClick={() => navigateToFleetVehicle({ navigator, vehicleId: vehicle.id })}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="truck" />
                {t('users.fleet.vehicle', { plate: vehicle.plate })}
              </Button>
            ))}
          </div>
        )}

        {isLoading ? (
          <Skeleton height="6rem" variant="block" />
        ) : (
          <>
            <p className={styles.intro}>
              {granted.length === 0
                ? t('users.permissions.none')
                : t('users.permissions.count', { count: granted.length })}
            </p>

            <div className={styles.pillList}>
              {granted.map((permission) => (
                <span className={styles.pill} key={permission}>
                  {t(`users.permission.${permission}.label`, { defaultValue: permission })}
                  <Button
                    aria-label={t('users.permissions.revoke')}
                    disabled={isPending}
                    onClick={() => onRevoke(permission)}
                    size="sm"
                    title={t('users.permissions.revoke')}
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
                ariaLabel={t('users.permissions.grantLabel')}
                clearAllLabel={t('users.groups.clearPermissions')}
                compact
                emptyLabel={t('users.groups.noPermission')}
                onChange={setChosen}
                options={groupPermissions(catalog).flatMap((group) =>
                  group.permissions
                    .filter((permission) => !granted.includes(permission))
                    .map((permission) => ({
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
                values={chosen}
              />
              <Button disabled={chosen.length === 0 || isPending} onClick={grant} type="button">
                <Icon name="check" />
                {t('users.permissions.grant')}
              </Button>
            </div>

            {/* Exceção precisa parecer exceção: o grupo é o caminho, e a avulsa é o desvio dele. */}
            <p className={styles.hint}>{t('users.permissions.preferGroups')}</p>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
