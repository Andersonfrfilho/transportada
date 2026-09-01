import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import type { CompanyUsersClient } from './useCompanyUsers.hook'
import { getCompanyUsersClient } from './useCompanyUsers.hook'

export const COMPANY_USER_IDENTIFIERS_QUERY_KEY = 'company-user-identifiers'

/**
 * O conjunto de e-mails e telefones de uma pessoa. Ele carrega com o diálogo aberto e não com a
 * listagem: são dezenas de linhas na tela de acessos, e uma consulta por linha renderizada seria
 * N+1 numa tabela que já é a mais pesada do módulo.
 */
export function useCompanyUserIdentifiers(
  input: Readonly<{ client?: CompanyUsersClient; userId: string | undefined }>,
) {
  const client = input.client ?? getCompanyUsersClient()
  const queryClient = useQueryClient()

  const query = useQuery({
    enabled: input.userId !== undefined,
    queryFn: () => client.listIdentifiers({ userId: input.userId ?? '' }),
    queryKey: [COMPANY_USER_IDENTIFIERS_QUERY_KEY, input.userId],
  })

  /**
   * As duas rotas devolvem o conjunto inteiro, e é ele que vira o cache: remontar a lista aqui a
   * partir do que mudou é onde a tela e o banco divergem.
   */
  function replace(identifiers: unknown): void {
    queryClient.setQueryData([COMPANY_USER_IDENTIFIERS_QUERY_KEY, input.userId], identifiers)
  }

  const addMutation = useMutation({
    mutationFn: (
      entry: Readonly<{ isWhatsapp: boolean; kind: 'email' | 'phone'; value: string }>,
    ) => client.addIdentifier({ ...entry, userId: input.userId ?? '' }),
    onSuccess: replace,
  })

  const removeMutation = useMutation({
    mutationFn: (identifierId: string) =>
      client.removeIdentifier({ identifierId, userId: input.userId ?? '' }),
    onSuccess: replace,
  })

  return { addMutation, query, removeMutation }
}
