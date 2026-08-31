/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { USERS_MANAGE_PERMISSION } from '../shared/companyUsers.constant'

/** A listagem relê junto: quem foi importado do realm passa a aparecer entre os acessos. */
const COMPANY_USERS_ADMINISTRATION_QUERY_KEY = 'company-users-administration'
import type { CompanyUsersClient } from './useCompanyUsers.hook'
import { getCompanyUsersClient } from './useCompanyUsers.hook'

export const COMPANY_USERS_RECONCILIATION_QUERY_KEY = 'company-users-reconciliation'

/**
 * A comparação entre a nossa base e o realm do Keycloak. Ela é consulta própria e não entra na
 * listagem: a listagem é a operação do dia a dia, e a divergência é conserto — misturar as duas
 * faria toda tela de usuários carregar o realm inteiro para mostrar duas linhas.
 */
export function useCompanyUsersReconciliation(
  input: Readonly<{
    enabled: boolean
    permissions: readonly string[]
    client?: CompanyUsersClient
    companyId?: string
  }>,
) {
  const client = input.client ?? getCompanyUsersClient()
  const canManageUsers = input.permissions.includes(USERS_MANAGE_PERMISSION)

  const queryClient = useQueryClient()

  const query = useQuery({
    enabled: input.enabled && canManageUsers && input.companyId !== undefined,
    queryFn: () => client.reconcileUsers(),
    queryKey: [COMPANY_USERS_RECONCILIATION_QUERY_KEY, input.companyId],
    /** O realm não muda a cada foco: recarregar é clique, não respiração da tela. */
    staleTime: 60_000,
  })

  /**
   * Criar quem falta relê os dois lados **e** a listagem: a pessoa importada do realm passa a
   * aparecer entre os acessos da empresa, e deixar a listagem velha faria parecer que nada aconteceu.
   */
  const synchronizeMutation = useMutation({
    mutationFn: (targets: Readonly<{ subjects: readonly string[]; userIds: readonly string[] }>) =>
      client.synchronizeIdentities(targets),
    /**
     * Sem `await`: esperar o cache aqui prenderia `isPending` e o botão ficaria desabilitado depois
     * de a operação ter terminado. A releitura acontece; a tela não fica presa a ela.
     */
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [COMPANY_USERS_RECONCILIATION_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [COMPANY_USERS_ADMINISTRATION_QUERY_KEY] })
    },
  })

  /**
   * O conserto do quarto estado relê a listagem junto: a pessoa que estava como "Cadastro
   * incompleto" passa a ter nome, e deixar a listagem velha faria parecer que nada aconteceu.
   */
  const fillProfilesMutation = useMutation({
    mutationFn: (userIds: readonly string[]) => client.fillProfilesFromRealm({ userIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [COMPANY_USERS_RECONCILIATION_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [COMPANY_USERS_ADMINISTRATION_QUERY_KEY] })
    },
  })

  /** Trazer do provedor relê os dois lados: a linha divergente precisa sumir da comparação. */
  const adoptMutation = useMutation({
    mutationFn: (userIds: readonly string[]) => client.adoptRealmFields({ userIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [COMPANY_USERS_RECONCILIATION_QUERY_KEY] })
      void queryClient.invalidateQueries({ queryKey: [COMPANY_USERS_ADMINISTRATION_QUERY_KEY] })
    },
  })

  return Object.assign(query, { adoptMutation, fillProfilesMutation, synchronizeMutation })
}
