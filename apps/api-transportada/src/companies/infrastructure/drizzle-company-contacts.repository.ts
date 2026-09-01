/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { asc, eq } from 'drizzle-orm'

import { companyContacts, companySocialLinks } from '../../database/company-contact.schema.js'
import type {
  CompanyContactSettings,
  CompanyContactsPort,
} from '../application/company-contacts.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

export class DrizzleCompanyContactsRepository implements CompanyContactsPort {
  readonly #database: Database

  constructor(database: Database) {
    this.#database = database
  }

  async load(input: { readonly companyId: string }): Promise<CompanyContactSettings> {
    const [contacts, socialLinks] = await Promise.all([
      this.#database
        .select({
          isWhatsapp: companyContacts.isWhatsapp,
          kind: companyContacts.kind,
          label: companyContacts.label,
          value: companyContacts.value,
        })
        .from(companyContacts)
        .where(eq(companyContacts.companyId, input.companyId))
        .orderBy(asc(companyContacts.position), asc(companyContacts.value)),
      this.#database
        .select({ network: companySocialLinks.network, url: companySocialLinks.url })
        .from(companySocialLinks)
        .where(eq(companySocialLinks.companyId, input.companyId))
        .orderBy(asc(companySocialLinks.position), asc(companySocialLinks.network)),
    ])

    return { contacts, socialLinks }
  }

  /**
   * Substituição da lista inteira, numa transação: apagar e reinserir é o que faz a ordem enviada
   * ser a ordem gravada sem `UPDATE` por linha. Fora de transação, uma falha no meio deixaria a
   * empresa **sem contato nenhum** — que é pior que a lista antiga.
   */
  async replace(input: {
    readonly companyId: string
    readonly settings: CompanyContactSettings
  }): Promise<CompanyContactSettings> {
    await this.#database.transaction(async (transaction) => {
      await transaction
        .delete(companyContacts)
        .where(eq(companyContacts.companyId, input.companyId))
      await transaction
        .delete(companySocialLinks)
        .where(eq(companySocialLinks.companyId, input.companyId))

      if (input.settings.contacts.length > 0) {
        await transaction.insert(companyContacts).values(
          input.settings.contacts.map((contact, index) => ({
            companyId: input.companyId,
            isWhatsapp: contact.isWhatsapp,
            kind: contact.kind,
            label: contact.label,
            position: index,
            value: contact.value,
          })),
        )
      }

      if (input.settings.socialLinks.length > 0) {
        await transaction.insert(companySocialLinks).values(
          input.settings.socialLinks.map((link, index) => ({
            companyId: input.companyId,
            network: link.network,
            position: index,
            url: link.url,
          })),
        )
      }
    })

    return this.load({ companyId: input.companyId })
  }
}
