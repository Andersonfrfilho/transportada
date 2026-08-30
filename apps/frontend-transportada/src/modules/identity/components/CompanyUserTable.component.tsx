/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'

import {
  createBrowserWorkspaceNavigator,
  navigateToFleetDriver,
  navigateToFleetVehicle,
} from '../shared/fleetNavigation.service'
import type { CompanyUserRevealState } from '../hooks/useCompanyUserReveal.hook'
import type { CompanyUserSelectionState } from '../hooks/useCompanyUserSelection.hook'
import type { CompanyUser } from '../shared/companyUsers.types'
import styles from '../styles/userAdministration.module.css'

type CompanyUserTableProps = Readonly<{
  onChangeStatus: (input: Readonly<{ status: 'active' | 'suspended'; userId: string }>) => void
  onEdit: (user: CompanyUser) => void
  onOpenPermissions: (user: CompanyUser) => void
  onRemove: (user: CompanyUser) => void
  onResend: (user: CompanyUser) => void
  users: readonly CompanyUser[]
  /** Ausente enquanto `/auth/me` não respondeu; a linha do próprio acesso só some depois disso. */
  currentUserId: string | undefined
  reveal: CompanyUserRevealState
  selection: CompanyUserSelectionState
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
  onOpenPermissions,
  onRemove,
  onResend,
  reveal,
  selection,
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
            <th className={styles.selectCell} scope="col">
              <Checkbox
                ariaLabel={t('users.bulk.selectAll')}
                checked={selection.areAllSelected}
                indeterminate={selection.isPartiallySelected}
                onChange={selection.toggleAll}
              />
            </th>
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
              <td className={styles.selectCell}>
                <Checkbox
                  ariaLabel={t('users.bulk.select', { name: user.name })}
                  checked={selection.isSelected(user.id)}
                  onChange={(checked) => selection.toggle(user.id, checked)}
                />
              </td>
              <td>
                {/* Vínculo sem perfil: a linha diz o que falta, em vez de parecer defeito de tela. */}
                <span className={styles.primaryCell}>
                  {user.name === '' ? t('users.noProfile') : user.name}
                </span>
                <span className={styles.secondaryCell}>
                  {user.username === '' ? user.id : user.username}
                </span>
              </td>
              <td>
                <RevealedContactCell reveal={reveal} user={user} />
                <span className={styles.secondaryCell}>
                  {t(`users.channel.${user.contact.channel}`, {
                    defaultValue: user.contact.channel,
                  })}
                </span>
              </td>
              <td>
                <FleetLinkCell user={user} />
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
                  {/* Detalhe da pessoa: permissões avulsas e o caminho por extenso para a frota. */}
                  <Button
                    aria-label={t('users.permissions.open')}
                    onClick={() => onOpenPermissions(user)}
                    size="sm"
                    title={t('users.permissions.open')}
                    type="button"
                    variant="ghost"
                  >
                    <Icon name="shield" />
                  </Button>
                  {user.invitation === undefined ? null : (
                    <Button
                      size="sm"
                      title={t('users.resendHint')}
                      type="button"
                      variant="ghost"
                      onClick={() => onResend(user)}
                    >
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

type RevealedContactCellProps = Readonly<{
  reveal: CompanyUserRevealState
  user: CompanyUser
}>

/**
 * A máscara é do servidor: o valor cru não está na tela até alguém pedir, e pedir grava trilha de
 * auditoria. Por isso o olho é um botão de verdade — e por isso ele some para quem não tem a
 * permissão, em vez de aparecer desabilitado prometendo o que não vai entregar.
 */
function RevealedContactCell({ reveal, user }: RevealedContactCellProps) {
  const { t } = useTranslation('identity')
  const revealed = reveal.revealed.get(user.id)
  const shown = revealed === undefined ? user.contact.masked : revealedContactOf(revealed, user)

  return (
    <span className={styles.revealCell}>
      <span className={styles.primaryCell}>{shown || '—'}</span>
      {!reveal.canReveal ? null : revealed === undefined ? (
        <Button
          aria-label={t('users.reveal.showOne', { name: user.name })}
          disabled={reveal.isPending}
          onClick={() => void reveal.reveal([user.id])}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="eye" />
        </Button>
      ) : (
        <Button
          aria-label={t('users.reveal.copy')}
          onClick={() => void reveal.copy(shown)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="copy" />
        </Button>
      )}
    </span>
  )
}

/**
 * O contato é o endereço do convite, e é ele que a célula mascarava. A coluna `email` do perfil fica
 * vazia na maioria das contas: mostrá-la revelava um traço, e a permissão gastava uma linha de
 * auditoria para não revelar nada. Ela só entra como reserva, para quem tiver as duas.
 */
function revealedContactOf(
  revealed: Readonly<{ contact: string; email: string; phone: string }>,
  user: CompanyUser,
): string {
  if (revealed.contact !== '') return revealed.contact
  return user.contact.channel === 'email' ? revealed.email : revealed.phone
}

/**
 * A tela mostrava que alguém é Motorista e era um beco: nenhum caminho para a ficha dele, nem para o
 * carro que ele dirige. Quem administra usuário e precisa conferir a frota da pessoa copiava o nome
 * e ia procurar na outra tela.
 *
 * Sem ficha não há link: caminho que não leva a lugar nenhum é pior que caminho ausente.
 */
function FleetLinkCell({ user }: Readonly<{ user: CompanyUser }>) {
  const { t } = useTranslation('identity')
  const navigator = createBrowserWorkspaceNavigator()

  if (user.fleet === undefined) return null

  /**
   * Na linha o vínculo é **ação rápida**: só o ícone, com o rótulo no `title` e no `aria-label`. O
   * botão nomeado por veículo empilhava texto na célula e competia com o papel da pessoa, que é o
   * que se lê ali. O caminho por extenso vive no detalhe do usuário.
   */
  return (
    <span className={styles.fleetLinks}>
      <Button
        aria-label={t('users.fleet.driver')}
        onClick={() => navigateToFleetDriver({ driverId: user.fleet?.driverId ?? '', navigator })}
        size="sm"
        title={t('users.fleet.driver')}
        type="button"
        variant="ghost"
      >
        <Icon name="link" />
      </Button>
      {user.fleet.vehicles.map((vehicle) => (
        <Button
          aria-label={t('users.fleet.vehicle', { plate: vehicle.plate })}
          key={vehicle.id}
          onClick={() => navigateToFleetVehicle({ navigator, vehicleId: vehicle.id })}
          size="sm"
          title={t('users.fleet.vehicle', { plate: vehicle.plate })}
          type="button"
          variant="ghost"
        >
          <Icon name="truck" />
        </Button>
      ))}
    </span>
  )
}
