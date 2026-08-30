/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useAuthMeQuery } from '../queries/useAuthMe.query'
import type { CompanyUser, FleetLink } from '../shared/companyUsers.types'
import type { CompanyUsersClient } from './useCompanyUsers.hook'
import { useCompanyUsers } from './useCompanyUsers.hook'
import { useCompanyUserReveal } from './useCompanyUserReveal.hook'
import { useCompanyUserSelection } from './useCompanyUserSelection.hook'
import { useCompanyUsersReconciliation } from './useCompanyUsersReconciliation.hook'
import { useCompanyUserEditForm, useCompanyUserInviteForm } from './useCompanyUserForm.hook'

export function readErrorCode(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

export function useUserAdministration(input: Readonly<{ client?: CompanyUsersClient }> = {}) {
  const authQuery = useAuthMeQuery()
  const companyId = authQuery.data?.data.company.id
  const currentUserId = authQuery.data?.data.identity.userId
  const users = useCompanyUsers({
    ...(input.client === undefined ? {} : { client: input.client }),
    ...(companyId === undefined ? {} : { companyId }),
    permissions: authQuery.data?.data.permissions ?? [],
  })

  const [isInviteOpen, setInviteOpen] = useState(false)
  /** A comparação com o realm é clique, não carregamento de tela: ela lê o Keycloak inteiro. */
  const [isReconciliationOpen, setReconciliationOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CompanyUser | null>(null)
  const [removeTarget, setRemoveTarget] = useState<CompanyUser | null>(null)
  const [resentUserId, setResentUserId] = useState<null | string>(null)
  /**
   * O diálogo fecha no sucesso, então o aviso do vínculo com a frota não cabe dentro dele: vive
   * na página até quem convidou dispensá-lo.
   */
  const [fleetLinkNotice, setFleetLinkNotice] = useState<FleetLink | null>(null)

  const reconciliation = useCompanyUsersReconciliation({
    enabled: isReconciliationOpen,
    permissions: authQuery.data?.data.permissions ?? [],
    ...(companyId === undefined ? {} : { companyId }),
  })

  const selection = useCompanyUserSelection(users.viewModel.users)

  const reveal = useCompanyUserReveal({ permissions: authQuery.data?.data.permissions ?? [] })

  const inviteForm = useCompanyUserInviteForm()
  const editForm = useCompanyUserEditForm(editTarget)

  function dismissFleetLinkNotice(): void {
    setFleetLinkNotice(null)
  }

  function closeInvite(): void {
    setInviteOpen(false)
    users.inviteUserMutation.reset()
  }

  /**
   * O botão não gateia mais a tela: ele sempre clica, e é aqui que a falta vira erro ancorado no
   * campo. Botão apagado sem explicação foi o que impediu de convidar usuário em homologação.
   */
  async function submitInvite(): Promise<void> {
    if (inviteForm.issues.length > 0) {
      inviteForm.markSubmitAttempt()
      return
    }
    const invited = await users.inviteUserMutation.mutateAsync(inviteForm.toInput())
    setFleetLinkNotice(invited.fleetLink === 'not-applicable' ? null : invited.fleetLink)
    inviteForm.reset()
    setInviteOpen(false)
  }

  function closeEdit(): void {
    setEditTarget(null)
    users.updateProfileMutation.reset()
    users.replaceRolesMutation.reset()
  }

  /**
   * Perfil e papéis são duas rotas: o perfil vai primeiro porque é o que a lista mostra, e a falha
   * no meio deixa o diálogo aberto com o erro — repetir converge, já que só o que mudou é enviado.
   */
  async function submitEdit(): Promise<void> {
    if (editTarget === null) return
    const patch = editForm.toProfilePatch()
    if (patch !== undefined) await users.updateProfileMutation.mutateAsync(patch)
    if (editForm.hasRoleChange) {
      await users.replaceRolesMutation.mutateAsync({
        roles: editForm.roles,
        userId: editTarget.id,
      })
    }
    setEditTarget(null)
  }

  function closeRemove(): void {
    setRemoveTarget(null)
    users.removeUserMutation.reset()
  }

  async function confirmRemove(): Promise<void> {
    if (removeTarget === null) return
    await users.removeUserMutation.mutateAsync({ userId: removeTarget.id })
    setRemoveTarget(null)
  }

  async function resendInvitation(user: CompanyUser): Promise<void> {
    setResentUserId(null)
    await users.resendInvitationMutation.mutateAsync({ userId: user.id })
    setResentUserId(user.id)
  }

  return {
    authQuery,
    closeEdit,
    closeInvite,
    closeRemove,
    confirmRemove,
    currentUserId,
    dismissFleetLinkNotice,
    editForm,
    editTarget,
    fleetLinkNotice,
    inviteForm,
    isInviteOpen,
    isReconciliationOpen,
    openEdit: setEditTarget,
    openInvite: () => setInviteOpen(true),
    reconciliation,
    reveal,
    selection,
    async assignRoles(roles: readonly string[]) {
      await users.assignRolesMutation.mutateAsync({ roles, userIds: selection.selectedIds })
      selection.clear()
    },
    refreshReconciliation: () => {
      void reconciliation.refetch()
    },
    toggleReconciliation: () => setReconciliationOpen((open) => !open),
    openRemove: setRemoveTarget,
    removeTarget,
    resendInvitation,
    resentUserId,
    submitEdit,
    submitInvite,
    users,
  }
}
