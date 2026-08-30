/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CompanyUserNotFoundError } from '../domain/company-user.error.js'
import type { CompanyUserRepositoryPort } from './company-user.port.js'

type RevealCompanyUsersDependencies = {
  readonly repository: Pick<CompanyUserRepositoryPort, 'findForReveal' | 'recordContactReveal'>
}

export type RevealCompanyUsersInput = {
  readonly context: { readonly companyId: string; readonly userId: string }
  readonly correlationId: string
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
}

export type RevealCompanyUsersUseCase = {
  execute(input: RevealCompanyUsersInput): Promise<readonly RevealedCompanyUser[]>
}

export function createRevealCompanyUsersUseCase({
  repository,
}: RevealCompanyUsersDependencies): RevealCompanyUsersUseCase {
  return {
    async execute({ context, correlationId, userIds }) {
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

      return revealed
    },
  }
}
