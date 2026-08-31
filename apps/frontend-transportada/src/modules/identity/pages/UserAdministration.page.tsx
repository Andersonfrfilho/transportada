/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { CompanyUserEditDialog } from '../components/CompanyUserEditDialog.component'
import { CompanyUserInviteDialog } from '../components/CompanyUserInviteDialog.component'
import { CompanyUserRemoveDialog } from '../components/CompanyUserRemoveDialog.component'
import { CompanyUserTable } from '../components/CompanyUserTable.component'
import { CompanyUserPermissionsDialog } from '../components/CompanyUserPermissionsDialog.component'
import { CompanyUserRevealAllButton } from '../components/CompanyUserRevealAllButton.component'
import { CompanyUserBulkRoleBar } from '../components/CompanyUserBulkRoleBar.component'
import { CompanyUserReconciliationPanel } from '../components/CompanyUserReconciliationPanel.component'
import { readErrorCode, useUserAdministration } from '../hooks/useUserAdministration.hook'
import styles from '../styles/userAdministration.module.css'

const SKELETON_ROWS = [0, 1, 2, 3, 4]
const SKELETON_CELLS = [0, 1, 2, 3, 4]

function TableSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <SkeletonGroup className={styles.skeletonStack} label={label}>
      {SKELETON_ROWS.map((row) => (
        <span className={styles.skeletonRow} key={row}>
          {SKELETON_CELLS.map((cell) => (
            <Skeleton height="1.25rem" key={cell} variant="text" />
          ))}
        </span>
      ))}
    </SkeletonGroup>
  )
}

export function UserAdministrationPage() {
  const { t } = useTranslation('identity')
  const screen = useUserAdministration()
  const { users } = screen
  const { viewModel } = users
  const listErrorCode = readErrorCode(users.usersQuery.error)
  const rowErrorCode =
    readErrorCode(users.changeStatusMutation.error) ??
    readErrorCode(users.resendInvitationMutation.error)

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('users.kicker')}</p>
        <h1>{t('users.title')}</h1>
        <p className={styles.intro}>{t('users.intro')}</p>
      </header>

      <CompanyUserReconciliationPanel
        entries={screen.reconciliation.data?.items ?? []}
        {...withErrorCode(readErrorCode(screen.reconciliation.error))}
        adoptOutcome={screen.reconciliation.adoptMutation.data}
        fillOutcome={screen.reconciliation.fillProfilesMutation.data}
        isAdopting={screen.reconciliation.adoptMutation.isPending}
        onAdoptRealmFields={(userIds) => screen.reconciliation.adoptMutation.mutate(userIds)}
        syncOutcome={screen.reconciliation.synchronizeMutation.data}
        hasMoreRealmUsers={screen.reconciliation.data?.hasMoreRealmUsers ?? false}
        isLoading={screen.reconciliation.isLoading}
        isFillingProfiles={screen.reconciliation.fillProfilesMutation.isPending}
        isOpen={screen.isReconciliationOpen}
        isSynchronizing={screen.reconciliation.synchronizeMutation.isPending}
        onFillProfiles={(userIds) => screen.reconciliation.fillProfilesMutation.mutate(userIds)}
        onRefresh={screen.refreshReconciliation}
        onSynchronize={(targets) => screen.reconciliation.synchronizeMutation.mutate(targets)}
        onToggle={screen.toggleReconciliation}
      />

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>{t('users.listTitle')}</h2>
          <div className={styles.panelActions}>
            <CompanyUserRevealAllButton reveal={screen.reveal} users={viewModel.users} />
            <Button
              disabled={!viewModel.canManageUsers}
              onClick={screen.openInvite}
              type="button"
              variant="default"
            >
              <Icon name="add" />
              {t('users.invite')}
            </Button>
          </div>
        </div>

        {screen.fleetLinkNotice === null ? null : (
          <div
            className={`${styles.feedback ?? ''} ${styles.notice ?? ''} ${
              screen.fleetLinkNotice === 'linked' ? (styles.noticeReady ?? '') : ''
            }`}
            role="status"
          >
            <span>
              {screen.fleetLinkNotice === 'linked'
                ? t('users.fleetLink.linked')
                : t('users.fleetLink.noDriverRecord')}
            </span>
            <Button
              aria-label={t('users.fleetLink.dismiss')}
              onClick={screen.dismissFleetLinkNotice}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="close" />
            </Button>
          </div>
        )}

        {viewModel.status === 'forbidden' ? (
          <p className={styles.emptyState}>{t('users.forbidden')}</p>
        ) : null}

        {viewModel.status === 'loading' ? <TableSkeleton label={t('users.loading')} /> : null}

        {viewModel.status === 'error' ? (
          <p className={styles.feedback} role="alert">
            {t(`users.errors.${listErrorCode ?? 'default'}`, {
              defaultValue: t('users.errors.default'),
            })}
          </p>
        ) : null}

        {viewModel.status === 'empty' ? (
          <p className={styles.emptyState}>{t('users.empty')}</p>
        ) : null}

        {viewModel.status === 'ready' ? (
          <>
            {rowErrorCode === undefined ? null : (
              <p className={styles.feedback} role="alert">
                {t(`users.errors.${rowErrorCode}`, { defaultValue: t('users.errors.default') })}
              </p>
            )}
            {screen.resentUserId === null ? null : (
              <p className={styles.hint} role="status">
                {t('users.resendSucceeded')}
              </p>
            )}
            <CompanyUserBulkRoleBar
              groups={screen.groups.query.data ?? []}
              isPending={users.assignRolesMutation.isPending}
              onApplyGroups={(groupIds) => void screen.assignGroups(groupIds)}
              onApply={(roles) => void screen.assignRoles(roles)}
              onClearSelection={screen.selection.clear}
              onUnselect={(userId) => screen.selection.toggle(userId, false)}
              roleChoices={screen.inviteForm.roleChoices}
              selectedUsers={viewModel.users.filter((user) => screen.selection.isSelected(user.id))}
            />
            <CompanyUserTable
              currentUserId={screen.currentUserId}
              onChangeStatus={(input) => users.changeStatusMutation.mutate(input)}
              onEdit={screen.openEdit}
              onRemove={screen.openRemove}
              onOpenPermissions={screen.userPermissions.open}
              onResend={(user) => void screen.resendInvitation(user)}
              reveal={screen.reveal}
              selection={screen.selection}
              users={viewModel.users}
            />
            <div className={styles.pagination}>
              <Button
                disabled={!users.canGoToPreviousPage}
                onClick={users.goToFirstPage}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="page-first" />
                {t('users.firstPage')}
              </Button>
              <Button
                disabled={!users.canGoToPreviousPage}
                onClick={users.goToPreviousPage}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="page-previous" />
                {t('users.previousPage')}
              </Button>
              <Button
                aria-label={t('users.nextPage')}
                disabled={viewModel.nextCursor === null}
                onClick={users.goToNextPage}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t('users.nextPage')}
                <Icon name="page-next" />
              </Button>
            </div>
          </>
        ) : null}
      </section>

      <CompanyUserInviteDialog
        errorCode={readErrorCode(users.inviteUserMutation.error)}
        form={screen.inviteForm}
        isOpen={screen.isInviteOpen}
        isPending={users.inviteUserMutation.isPending}
        onClose={screen.closeInvite}
        onSubmit={() => void screen.submitInvite()}
      />

      <CompanyUserEditDialog
        errorCode={
          readErrorCode(users.updateProfileMutation.error) ??
          readErrorCode(users.replaceRolesMutation.error)
        }
        form={screen.editForm}
        isFillingProfile={screen.reconciliation.fillProfilesMutation.isPending}
        isPending={users.updateProfileMutation.isPending || users.replaceRolesMutation.isPending}
        onClose={screen.closeEdit}
        onAdoptRealmFields={(userId) => screen.reconciliation.adoptMutation.mutate([userId])}
        onFillFromRealm={(userId) => screen.reconciliation.fillProfilesMutation.mutate([userId])}
        onSubmit={() => void screen.submitEdit()}
        password={screen.password}
        realmEntry={screen.editRealmEntry}
        reveal={screen.reveal}
        user={screen.editTarget}
      />

      <CompanyUserRemoveDialog
        errorCode={readErrorCode(users.removeUserMutation.error)}
        isPending={users.removeUserMutation.isPending}
        onClose={screen.closeRemove}
        onConfirm={() => void screen.confirmRemove()}
        user={screen.removeTarget}
      />
      <CompanyUserPermissionsDialog
        catalog={screen.rolePermissions.data?.permissions ?? []}
        granted={screen.userPermissions.query.data ?? []}
        isLoading={screen.userPermissions.query.isLoading}
        isPending={
          screen.userPermissions.grantMutation.isPending ||
          screen.userPermissions.revokeMutation.isPending
        }
        onClose={screen.userPermissions.close}
        onGrant={(permissions) => screen.userPermissions.grantMutation.mutate(permissions)}
        onRevoke={(permission) => screen.userPermissions.revokeMutation.mutate(permission)}
        user={screen.userPermissions.target}
      />
    </main>
  )
}

function withErrorCode(errorCode: string | undefined): Readonly<{ errorCode?: string }> {
  return errorCode === undefined ? {} : { errorCode }
}
