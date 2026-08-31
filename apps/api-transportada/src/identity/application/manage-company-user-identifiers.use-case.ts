/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { CompanyUserNotFoundError } from '../domain/company-user.error.js'
import type { CompanyUserIdentifier, CompanyUserRepositoryPort } from './company-user.port.js'

type Dependencies = {
  readonly repository: Pick<
    CompanyUserRepositoryPort,
    'addIdentifier' | 'listIdentifiers' | 'removeIdentifier'
  >
}

type Context = { readonly context: { readonly companyId: string }; readonly userId: string }

export type ManageCompanyUserIdentifiersUseCase = {
  add(
    input: Context & {
      readonly isWhatsapp: boolean
      readonly kind: 'email' | 'phone'
      readonly value: string
    },
  ): Promise<readonly CompanyUserIdentifier[]>
  list(input: Context): Promise<readonly CompanyUserIdentifier[]>
  remove(
    input: Context & { readonly identifierId: string },
  ): Promise<readonly CompanyUserIdentifier[]>
}

/**
 * O conjunto de e-mails e telefones de uma pessoa. Ele serve a duas coisas ao mesmo tempo, e é por
 * isso que é um conjunto só: por qualquer um deles a pessoa se identifica no login, e por qualquer
 * um deles se fala com ela. Manter duas listas separadas obrigaria quem cadastra a digitar o mesmo
 * telefone duas vezes e a mantê-lo igual nos dois lugares para sempre.
 *
 * As três operações devolvem a lista inteira: a tela mostra um conjunto, e devolver só o que mudou
 * a obrigaria a remontar o conjunto por conta própria — que é onde ela e o banco divergem.
 */
export function createManageCompanyUserIdentifiersUseCase({
  repository,
}: Dependencies): ManageCompanyUserIdentifiersUseCase {
  return {
    async add({ context, isWhatsapp, kind, userId, value }) {
      await repository.addIdentifier({
        companyId: context.companyId,
        /** A marca só existe em telefone; num e-mail ela seria recusada pelo CHECK do banco. */
        isWhatsapp: kind === 'phone' && isWhatsapp,
        kind,
        userId,
        value,
      })
      return repository.listIdentifiers({ companyId: context.companyId, userId })
    },

    list: ({ context, userId }) =>
      repository.listIdentifiers({ companyId: context.companyId, userId }),

    /**
     * Remover o que não é removível é 404, e não silêncio: o derivado da ficha volta na próxima
     * gravação dela, e dizer "removido" seria promessa que a tela não cumpre.
     */
    async remove({ context, identifierId, userId }) {
      const removed = await repository.removeIdentifier({
        companyId: context.companyId,
        identifierId,
        userId,
      })
      if (!removed) throw new CompanyUserNotFoundError()
      return repository.listIdentifiers({ companyId: context.companyId, userId })
    },
  }
}
