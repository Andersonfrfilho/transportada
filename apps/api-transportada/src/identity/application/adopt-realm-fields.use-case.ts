/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  diffRealmOwnedFields,
  REALM_OWNED_FIELD,
  type RealmOwnedField,
} from '../domain/user-reconciliation.policy.js'
import type { GroupAuditPort } from './company-group.audit.port.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'
import type { IdentityAccessGatewayPort } from '../infrastructure/keycloak-admin.gateway.js'

type AdoptRealmFieldsDependencies = {
  readonly audit: GroupAuditPort
  readonly gateway: Pick<IdentityAccessGatewayPort, 'listUsers'>
  readonly repository: Pick<CompanyUserRepositoryPort, 'listForReconciliation' | 'updateProfile'>
}

export type AdoptRealmFieldsInput = {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly correlationId: string
  readonly userIds: readonly string[]
}

export type AdoptRealmFieldsResult = {
  readonly adopted: readonly {
    readonly fields: readonly RealmOwnedField[]
    readonly userId: string
  }[]
  /** Quem não foi trazido, e por quê — silenciar faria o operador achar que consertou. */
  readonly skipped: readonly { readonly reason: string; readonly userId: string }[]
}

export const ADOPT_SKIP_REASON = {
  /** Já é igual: não há o que trazer, e escrever à toa mexeria no `updated_at` sem motivo. */
  ALREADY_EQUAL: 'already-equal',
  /** Não é vínculo desta empresa, não tem `subject` gravado, ou não há conta no provedor. */
  NOT_FOUND: 'not-found',
} as const

export type AdoptRealmFieldsUseCase = {
  execute(input: AdoptRealmFieldsInput): Promise<AdoptRealmFieldsResult>
}

/**
 * O caminho de volta. O painel escreve no provedor a cada edição, e o provedor nunca escrevia aqui:
 * quem alterasse o login ou o e-mail direto no Keycloak deixava os dois lados discordando, e a
 * comparação ainda dizia "Sincronizado" — ela respondia se a pessoa existe nos dois lados, não se os
 * campos batem.
 *
 * Só os campos que o provedor **manda** são trazidos: login, e-mail e documento. Nome fica de fora
 * de propósito — ele é editado aqui, o provedor não tem um campo equivalente confiável (a conta
 * criada pela sincronização nasce com o login no lugar do nome), e sobrescrevê-lo apagaria o que
 * alguém digitou.
 *
 * Alvo explícito, como todo conserto desta tela: uma varredura que adotasse tudo reescreveria a
 * ficha de gente que ninguém revisou.
 */
export function createAdoptRealmFieldsUseCase({
  audit,
  gateway,
  repository,
}: AdoptRealmFieldsDependencies): AdoptRealmFieldsUseCase {
  return {
    async execute({ context, correlationId, userIds }) {
      if (userIds.length === 0) return { adopted: [], skipped: [] }

      const [local, realm] = await Promise.all([
        repository.listForReconciliation({ companyId: context.companyId }),
        gateway.listUsers({ limit: REALM_PAGE_LIMIT }),
      ])
      const adopted: { fields: readonly RealmOwnedField[]; userId: string }[] = []
      const skipped: { reason: string; userId: string }[] = []

      for (const userId of userIds) {
        const record = local.find((entry) => entry.userId === userId)
        /**
         * Sem `subject` gravado não há par: casar por e-mail é palpite do algoritmo, e trazer campo
         * de uma conta que ninguém confirmou ser a mesma pessoa é escrever dado alheio na ficha.
         */
        if (record === undefined || record.subject === undefined) {
          skipped.push({ reason: ADOPT_SKIP_REASON.NOT_FOUND, userId })
          continue
        }

        const account = realm.users.find((user) => user.subject === record.subject)
        if (account === undefined) {
          skipped.push({ reason: ADOPT_SKIP_REASON.NOT_FOUND, userId })
          continue
        }

        const fields = diffRealmOwnedFields({ local: record, realm: account })
        if (fields.length === 0) {
          skipped.push({ reason: ADOPT_SKIP_REASON.ALREADY_EQUAL, userId })
          continue
        }

        await repository.updateProfile({
          userId,
          ...(fields.includes(REALM_OWNED_FIELD.USERNAME) ? { username: account.username } : {}),
          ...(fields.includes(REALM_OWNED_FIELD.TAX_ID) ? { taxId: account.taxId } : {}),
          /**
           * O e-mail entra em `email` e, quando o canal do contato é e-mail, também no contato: é o
           * contato que a listagem mostra e que a tela de login usa para achar o login da pessoa.
           * Deixá-lo velho manteria de pé exatamente a divergência que este botão veio consertar.
           */
          ...(fields.includes(REALM_OWNED_FIELD.EMAIL)
            ? {
                email: account.email,
                ...(record.contactChannel === 'email' ? { contactAddress: account.email } : {}),
              }
            : {}),
        })
        adopted.push({ fields, userId })
      }

      if (adopted.length > 0) {
        await audit.record({
          action: 'company-user.realm-fields-adopted',
          actorUserId: context.userId,
          companyId: context.companyId,
          correlationId,
          targetIds: adopted.map((entry) => entry.userId),
        })
      }

      return { adopted, skipped }
    },
  }
}

/** A mesma página da leitura da reconciliação: quem enxerga a divergência é quem a conserta. */
const REALM_PAGE_LIMIT = 200
