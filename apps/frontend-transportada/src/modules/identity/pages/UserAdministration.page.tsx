/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { CompanyUserEditDialog } from '../components/CompanyUserEditDialog.component'
import { CompanyUserInviteDialog } from '../components/CompanyUserInviteDialog.component'
import { CompanyUserRemoveDialog } from '../components/CompanyUserRemoveDialog.component'
import { CompanyUserTable } from '../components/CompanyUserTable.component'
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

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>{t('users.listTitle')}</h2>
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
            <CompanyUserTable
              currentUserId={screen.currentUserId}
              onChangeStatus={(input) => users.changeStatusMutation.mutate(input)}
              onEdit={screen.openEdit}
              onRemove={screen.openRemove}
              onResend={(user) => void screen.resendInvitation(user)}
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
        isPending={users.updateProfileMutation.isPending || users.replaceRolesMutation.isPending}
        onClose={screen.closeEdit}
        onSubmit={() => void screen.submitEdit()}
        user={screen.editTarget}
      />

      <CompanyUserRemoveDialog
        errorCode={readErrorCode(users.removeUserMutation.error)}
        isPending={users.removeUserMutation.isPending}
        onClose={screen.closeRemove}
        onConfirm={() => void screen.confirmRemove()}
        user={screen.removeTarget}
      />
    </main>
  )
}
