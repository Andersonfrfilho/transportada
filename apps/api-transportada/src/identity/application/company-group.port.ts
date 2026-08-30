/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/identity.schema.js'

export type CompanyGroupView = {
  readonly description: string
  readonly id: string
  /**
   * Nulo enquanto o grupo não existe no realm. É estado legítimo — o grupo nasce aqui e a
   * sincronização pode falhar —, e a tela mostra isso em vez de fingir que os dois lados batem.
   */
  readonly keycloakGroupId: string | null
  readonly memberCount: number
  readonly name: string
  readonly permissions: readonly string[]
  readonly roles: readonly CompanyRole[]
}

export type SaveCompanyGroupInput = {
  readonly companyId: string
  readonly description: string
  readonly groupId?: string
  readonly name: string
  readonly permissions: readonly string[]
  readonly roles: readonly CompanyRole[]
}

export type CompanyGroupRepositoryPort = {
  /** Cria ou substitui o conteúdo do grupo; devolve a visão já com a contagem de membros. */
  readonly save: (input: SaveCompanyGroupInput) => Promise<CompanyGroupView>
  readonly list: (input: { readonly companyId: string }) => Promise<readonly CompanyGroupView[]>
  readonly remove: (input: {
    readonly companyId: string
    readonly groupId: string
  }) => Promise<{ readonly keycloakGroupId: string | null }>
  /** Atribui e desatribui em lote; papel que a pessoa já tem é ignorado pela PK, não por laço. */
  readonly assign: (input: {
    readonly companyId: string
    readonly groupIds: readonly string[]
    readonly userIds: readonly string[]
  }) => Promise<{ readonly affected: readonly GroupMembershipChange[] }>
  readonly unassign: (input: {
    readonly companyId: string
    readonly groupId: string
    readonly userIds: readonly string[]
  }) => Promise<{ readonly affected: readonly GroupMembershipChange[] }>
  readonly grantDirectPermissions: (input: {
    readonly companyId: string
    readonly grantedByUserId: string
    readonly permissions: readonly string[]
    readonly userId: string
  }) => Promise<void>
  readonly revokeDirectPermissions: (input: {
    readonly companyId: string
    readonly permissions: readonly string[]
    readonly userId: string
  }) => Promise<void>
  readonly listDirectPermissions: (input: {
    readonly companyId: string
    readonly userId: string
  }) => Promise<readonly string[]>
  readonly setKeycloakGroupId: (input: {
    readonly groupId: string
    readonly keycloakGroupId: string
  }) => Promise<void>
}

/**
 * O que mudou de fato numa atribuição. A sincronização com o realm precisa do `subject` — o id
 * interno não existe do lado de lá —, e a auditoria precisa de quem foi alcançado.
 */
export type GroupMembershipChange = {
  readonly groupId: string
  readonly keycloakGroupId: string | null
  readonly subject: string | null
  readonly userId: string
}
