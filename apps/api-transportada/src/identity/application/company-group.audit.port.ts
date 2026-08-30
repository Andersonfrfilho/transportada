/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A trilha do grupo. `groups.manage` concede permissão, e quem a tem pode se auto-promover — a
 * decisão foi tomada por escrito, e esta porta é a defesa que sobrou: sem ela, uma permissão
 * aparecida na base não tem autor e ninguém consegue perguntar o porquê a alguém.
 */
export type GroupAuditPort = {
  record(input: {
    readonly action: string
    readonly actorUserId: string
    readonly companyId: string
    readonly correlationId: string
    readonly targetIds: readonly string[]
    readonly metadata?: Readonly<Record<string, unknown>>
  }): Promise<void>
}

/**
 * A fatia do provedor que o grupo precisa. O `groupId` daqui é o **do realm**, nunca o nosso: são
 * espaços de identificador diferentes, e trocá-los monta chamada que o Keycloak aceita contra um
 * grupo que não é o nosso.
 */
export type GroupRealmGatewayPort = {
  addMember(input: { readonly groupId: string; readonly subject: string }): Promise<void>
  createGroup(input: { readonly name: string }): Promise<{ readonly groupId: string }>
  deleteGroup(input: { readonly groupId: string }): Promise<void>
  removeMember(input: { readonly groupId: string; readonly subject: string }): Promise<void>
  renameGroup(input: { readonly groupId: string; readonly name: string }): Promise<void>
}
