/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useRef } from 'react'
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

  /**
   * Divergência de campo se concilia **sozinha**, sem ninguém apertar botão: o provedor é a fonte
   * de login, e-mail e documento, e um cadastro que discorda dele em silêncio é o defeito que esta
   * tela veio mostrar — não uma escolha a ser confirmada toda vez.
   *
   * O que continua sendo botão é o que **cria** conta e o que preenche ficha vazia: ali o conserto
   * inventa registro, e inventar registro por conta própria é outra coisa.
   *
   * `attempted` impede o laço: adotar invalida a consulta, a consulta volta, e sem a memória do que
   * já foi tentado a tela pediria de novo para sempre quando o provedor recusasse a escrita.
   */
  const attempted = useRef<ReadonlySet<string>>(new Set())
  const items = query.data?.items ?? []
  const keyOf = (status: (typeof items)[number]['status']): string =>
    items
      .filter((entry) => entry.status === status)
      .map((entry) => entry.local?.userId ?? '')
      .filter((userId) => userId !== '')
      .join(',')

  const divergedKey = items
    .filter((entry) => entry.differences.length > 0)
    .map((entry) => entry.local?.userId ?? '')
    .filter((userId) => userId !== '')
    .join(',')
  /** Ficha vazia de quem já entra no sistema: copiar o que falta não inventa pessoa nenhuma. */
  const incompleteKey = keyOf('profile-missing')
  /** Tem cadastro aqui e não consegue entrar: o acesso é dela, e criá-lo não traz gente de fora. */
  const withoutAccessKey = keyOf('missing-in-realm')

  function claim(key: string): readonly string[] {
    const pending = key
      .split(',')
      .filter((userId) => userId !== '' && !attempted.current.has(userId))
    if (pending.length > 0) attempted.current = new Set([...attempted.current, ...pending])
    return pending
  }

  /**
   * Três pendências, e só duas se consertam sozinhas.
   *
   * Campo desatualizado e ficha vazia são conserto sobre pessoa que **já é nossa**: o dado vem da
   * conta que ela usa para entrar, e nada é inventado. Cadastro sem acesso também: a pessoa existe
   * aqui e não consegue entrar, e o acesso que se cria é o dela.
   *
   * ⚠️ **Acesso sem cadastro fica de fora, e continua sendo botão.** O provedor pode ser
   * compartilhado com outros produtos, e importar em bloco cego traria para dentro da empresa cada
   * conta que existe lá. Quem nasce dessa importação nasce sem papel nenhum, mas nasce — e decidir
   * que uma conta desconhecida passa a ser pessoa desta empresa é decisão de gente.
   */
  useEffect(() => {
    if (adoptMutation.isPending) return
    const pending = claim(divergedKey)
    if (pending.length > 0) adoptMutation.mutate(pending)
  }, [divergedKey, adoptMutation])

  useEffect(() => {
    if (fillProfilesMutation.isPending) return
    const pending = claim(incompleteKey)
    if (pending.length > 0) fillProfilesMutation.mutate(pending)
  }, [incompleteKey, fillProfilesMutation])

  useEffect(() => {
    if (synchronizeMutation.isPending) return
    const pending = claim(withoutAccessKey)
    if (pending.length > 0) synchronizeMutation.mutate({ subjects: [], userIds: pending })
  }, [withoutAccessKey, synchronizeMutation])

  return Object.assign(query, { adoptMutation, fillProfilesMutation, synchronizeMutation })
}
