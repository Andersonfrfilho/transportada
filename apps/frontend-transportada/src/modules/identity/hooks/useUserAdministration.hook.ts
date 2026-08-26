/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'

import { useAuthMeQuery } from '../queries/useAuthMe.query'
import type { CompanyUser, FleetLink } from '../shared/companyUsers.types'
import type { CompanyUsersClient } from './useCompanyUsers.hook'
import { useCompanyUsers } from './useCompanyUsers.hook'
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
  const [editTarget, setEditTarget] = useState<CompanyUser | null>(null)
  const [removeTarget, setRemoveTarget] = useState<CompanyUser | null>(null)
  const [resentUserId, setResentUserId] = useState<null | string>(null)
  /**
   * O diálogo fecha no sucesso, então o aviso do vínculo com a frota não cabe dentro dele: vive
   * na página até quem convidou dispensá-lo.
   */
  const [fleetLinkNotice, setFleetLinkNotice] = useState<FleetLink | null>(null)

  const inviteForm = useCompanyUserInviteForm()
  const editForm = useCompanyUserEditForm(editTarget)

  function dismissFleetLinkNotice(): void {
    setFleetLinkNotice(null)
  }

  function closeInvite(): void {
    setInviteOpen(false)
    users.inviteUserMutation.reset()
  }

  async function submitInvite(): Promise<void> {
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
    openEdit: setEditTarget,
    openInvite: () => setInviteOpen(true),
    openRemove: setRemoveTarget,
    removeTarget,
    resendInvitation,
    resentUserId,
    submitEdit,
    submitInvite,
    users,
  }
}
