/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { GroupAuditPort } from './company-group.audit.port.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import type { IdentityAccessGatewayPort } from '../infrastructure/keycloak-admin.gateway.js'

type FillProfilesFromRealmDependencies = {
  readonly audit: GroupAuditPort
  readonly gateway: Pick<IdentityAccessGatewayPort, 'listUsers'>
  readonly issuer: string
  readonly repository: Pick<
    CompanyUserRepositoryPort,
    'createProfileForExistingUser' | 'listForReconciliation'
  >
}

export type FillProfilesFromRealmInput = {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly correlationId: string
  readonly userIds: readonly string[]
}

export type FillProfilesFromRealmResult = {
  readonly filled: readonly string[]
  /** Quem não foi preenchido, e por quê — silenciar faria o operador achar que consertou. */
  readonly skipped: readonly { readonly reason: string; readonly userId: string }[]
}

export const PROFILE_FILL_SKIP_REASON = {
  /** Já tem perfil: preencher por cima apagaria nome editado à mão. */
  PROFILE_EXISTS: 'profile-exists',
  /** Não é vínculo desta empresa, ou não tem conta no provedor de onde copiar. */
  NOT_FOUND: 'not-found',
  /** A conta existe lá, mas sem e-mail — e contato em branco é recusado pelo CHECK da tabela. */
  REALM_CONTACT_MISSING: 'realm-contact-missing',
} as const

export type FillProfilesFromRealmUseCase = {
  execute(input: FillProfilesFromRealmInput): Promise<FillProfilesFromRealmResult>
}

/**
 * O conserto do quarto estado: a conta existe dos dois lados, e o que falta é a ficha que a
 * administração de usuários lê. Nome e contato já estão no provedor — quem provisionou a instalação
 * os digitou lá —, e copiá-los é mais honesto do que pedir de novo a quem só quer ver a lista.
 *
 * Alvo explícito, como a sincronização: uma varredura que preenchesse tudo escreveria a ficha de
 * todo mundo a partir de um `username` que ninguém revisou.
 */
export function createFillProfilesFromRealmUseCase({
  audit,
  gateway,
  repository,
}: FillProfilesFromRealmDependencies): FillProfilesFromRealmUseCase {
  return {
    async execute({ context, correlationId, userIds }) {
      if (userIds.length === 0) return { filled: [], skipped: [] }

      const [local, realm] = await Promise.all([
        repository.listForReconciliation({ companyId: context.companyId }),
        gateway.listUsers({ limit: REALM_PAGE_LIMIT }),
      ])
      const filled: string[] = []
      const skipped: { reason: string; userId: string }[] = []

      for (const userId of userIds) {
        const record = local.find((entry) => entry.userId === userId)
        if (record === undefined || record.subject === undefined) {
          skipped.push({ reason: PROFILE_FILL_SKIP_REASON.NOT_FOUND, userId })
          continue
        }
        if (record.hasProfile) {
          skipped.push({ reason: PROFILE_FILL_SKIP_REASON.PROFILE_EXISTS, userId })
          continue
        }

        const account = realm.users.find((user) => user.subject === record.subject)
        if (account === undefined) {
          skipped.push({ reason: PROFILE_FILL_SKIP_REASON.NOT_FOUND, userId })
          continue
        }
        /**
         * O contato é `not null` com CHECK de não vazio: uma conta sem e-mail derrubaria a escrita,
         * e num lote levaria junto o conserto das outras. Conta do provedor sem e-mail é caso real —
         * a que nasce pelo botão de sincronizar nasce exatamente assim.
         */
        if (account.email.trim() === '') {
          skipped.push({ reason: PROFILE_FILL_SKIP_REASON.REALM_CONTACT_MISSING, userId })
          continue
        }

        await repository.createProfileForExistingUser({
          contactAddress: account.email,
          contactChannel: 'email',
          email: account.email,
          /** O provedor não guarda nome próprio separado do login aqui; o login é o que se lê. */
          name: account.username,
          taxId: account.taxId,
          userId,
          username: account.username,
        })
        filled.push(userId)
      }

      if (filled.length > 0) {
        await audit.record({
          action: 'company-user.profile-filled-from-realm',
          actorUserId: context.userId,
          companyId: context.companyId,
          correlationId,
          targetIds: [...filled],
        })
      }

      return { filled, skipped }
    },
  }
}

/** Mesma página da leitura da reconciliação: quem enxerga a divergência é quem a conserta. */
const REALM_PAGE_LIMIT = 200
