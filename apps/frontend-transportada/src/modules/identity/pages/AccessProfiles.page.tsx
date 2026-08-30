/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { CompanyGroupAssignmentPanel } from '../components/CompanyGroupAssignmentPanel.component'
import { CompanyGroupPanel } from '../components/CompanyGroupPanel.component'
import { RolePermissionMatrixPanel } from '../components/RolePermissionMatrixPanel.component'
import { useAccessProfiles } from '../hooks/useAccessProfiles.hook'
import { readErrorCode } from '../hooks/useUserAdministration.hook'
import styles from '../styles/userAdministration.module.css'

/**
 * Papéis, grupos e a quem eles pertencem. Estava tudo empilhado na tela de acessos, atrás de botões
 * de mostrar/esconder: quatro painéis competindo pela mesma dobra, e o que se usa todo dia — a
 * listagem — embaixo do que se consulta uma vez por mês.
 *
 * A sincronização com o provedor **ficou lá**, de propósito: ela é conserto da listagem, e quem vê a
 * divergência é quem estava olhando a lista.
 */
export function AccessProfilesPage() {
  const { t } = useTranslation('identity')
  const screen = useAccessProfiles()
  const candidates = screen.candidates.data?.users ?? []

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <p className={styles.kicker}>{t('profiles.kicker')}</p>
        <h1>{t('profiles.title')}</h1>
        <p className={styles.intro}>{t('profiles.intro')}</p>
      </header>

      <CompanyGroupPanel
        {...withErrorCode(
          readErrorCode(screen.groups.saveMutation.error ?? screen.groups.removeMutation.error),
        )}
        groups={screen.groups.query.data ?? []}
        isLoading={screen.groups.query.isLoading}
        isPending={screen.groups.saveMutation.isPending || screen.groups.removeMutation.isPending}
        onRemove={(groupId) => screen.groups.removeMutation.mutate(groupId)}
        onSave={(group) => screen.groups.saveMutation.mutate(group)}
        permissions={screen.rolePermissions.data?.permissions ?? []}
      />

      <CompanyGroupAssignmentPanel
        {...withErrorCode(readErrorCode(screen.groups.assignMutation.error))}
        groups={screen.groups.query.data ?? []}
        hasMoreCandidates={screen.hasMoreCandidates}
        isLoading={screen.candidates.isLoading || screen.groups.query.isLoading}
        isPending={screen.groups.assignMutation.isPending}
        onAssign={screen.assign}
        onSelectGroup={screen.selectGroup}
        onSelectUsers={screen.selectUsers}
        selectedGroupId={screen.selectedGroupId}
        selectedUserIds={screen.selectedUserIds}
        users={candidates}
      />

      <RolePermissionMatrixPanel
        {...withErrorCode(readErrorCode(screen.rolePermissions.error))}
        isLoading={screen.rolePermissions.isLoading}
        {...(screen.rolePermissions.data === undefined
          ? {}
          : { matrix: screen.rolePermissions.data })}
      />
    </main>
  )
}

/** `exactOptionalPropertyTypes`: ausência é a chave fora do objeto, não a chave com `undefined`. */
function withErrorCode(errorCode: string | undefined): Readonly<{ errorCode?: string }> {
  return errorCode === undefined ? {} : { errorCode }
}
