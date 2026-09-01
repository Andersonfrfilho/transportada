/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CompanyUserNotFoundError } from '../domain/company-user.error.js'
import type { IdentityAccessGatewayPort } from '../infrastructure/keycloak-admin.gateway.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'

type RevealCompanyUsersDependencies = {
  readonly gateway: Pick<IdentityAccessGatewayPort, 'listUsers'>
  readonly repository: Pick<
    CompanyUserRepositoryPort,
    'findForReveal' | 'listForReconciliation' | 'recordContactReveal'
  >
}

export type RevealCompanyUsersInput = {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly correlationId: string
  /**
   * O e-mail do provedor sai **só quando pedido**. Ele custa uma leitura do realm, e a listagem —
   * que revela uma página inteira de uma vez — não mostra esse campo: pagar rede por dado que
   * ninguém desenha é desperdício que cresce com o tamanho da empresa.
   */
  readonly includeRealm?: boolean
  readonly userIds: readonly string[]
}

/**
 * O valor cru, sem máscara. É o que a tela pediu para mostrar, e é por isso que a operação inteira
 * deixa rastro: `security.md` §10 trata exportação e leitura de dado pessoal como ação auditável.
 */
export type RevealedCompanyUser = {
  /**
   * O endereço do convite, que é **onde o contato mora**: a coluna `email` fica vazia na maioria das
   * contas. Revelar só `email` devolvia branco, e a tela mostrava um traço no lugar do valor cru —
   * a permissão gastava uma linha de auditoria para não revelar nada.
   */
  readonly contact: string
  readonly email: string
  readonly name: string
  readonly phone: string
  readonly taxId: string
  readonly userId: string
  /**
   * O endereço como o provedor o guarda, sem máscara. Ausente quando não foi pedido, e vazio quando
   * a conta existe lá sem e-mail — que é o estado normal de quem nasceu pelo botão de sincronizar.
   */
  readonly realmEmail?: string
}

export type RevealCompanyUsersUseCase = {
  execute(input: RevealCompanyUsersInput): Promise<readonly RevealedCompanyUser[]>
}

export function createRevealCompanyUsersUseCase({
  gateway,
  repository,
}: RevealCompanyUsersDependencies): RevealCompanyUsersUseCase {
  return {
    async execute({ context, correlationId, includeRealm = false, userIds }) {
      /**
       * O recorte é do banco, com `company_id` no `where`: id que não pertence à empresa é ausência,
       * não erro de permissão. Responder diferente diria ao chamador que aquele usuário existe em
       * outro lugar, e é assim que se enumera base alheia.
       */
      const revealed = await repository.findForReveal({
        companyId: context.companyId,
        userIds,
      })

      if (revealed.length === 0) throw new CompanyUserNotFoundError()

      /**
       * Uma linha por pessoa revelada, não uma por clique: o registro que importa depois é "quem
       * olhou o documento de quem", e um contador agregado não responde isso.
       */
      await repository.recordContactReveal({
        actorUserId: context.userId,
        companyId: context.companyId,
        correlationId,
        targetUserIds: revealed.map((entry) => entry.userId),
      })

      if (!includeRealm) return revealed

      /**
       * O casamento é pelo `subject` **gravado**, nunca por e-mail: casar por e-mail aqui seria
       * usar o palpite do algoritmo para decidir de quem é o endereço que se vai mostrar sem
       * máscara — e mostrar o e-mail de outra pessoa é pior do que não mostrar nenhum.
       */
      const [memberships, realm] = await Promise.all([
        repository.listForReconciliation({ companyId: context.companyId }),
        gateway.listUsers({ limit: REALM_PAGE_LIMIT }),
      ])
      const subjectByUserId = new Map(
        memberships
          .filter((entry) => entry.subject !== undefined)
          .map((entry) => [entry.userId, entry.subject as string]),
      )
      const emailBySubject = new Map(realm.users.map((user) => [user.subject, user.email]))

      return revealed.map((entry) => {
        const subject = subjectByUserId.get(entry.userId)
        if (subject === undefined) return entry
        return { ...entry, realmEmail: emailBySubject.get(subject) ?? '' }
      })
    },
  }
}

/** A mesma página da reconciliação: quem enxerga a divergência é quem pede para revelá-la. */
const REALM_PAGE_LIMIT = 200
