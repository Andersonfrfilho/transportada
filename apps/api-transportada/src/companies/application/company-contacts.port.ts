/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  CompanyContactKind,
  CompanySocialNetwork,
} from '../../database/company-contact.schema.js'

export type CompanyContact = {
  /** Rótulo livre — "Comercial", "Financeiro". Vazio é o caso comum de quem tem um número só. */
  readonly label: string
  readonly kind: CompanyContactKind
  /** Só telefone: e-mail marcado como WhatsApp é recusado na fronteira e pelo CHECK. */
  readonly isWhatsapp: boolean
  /** Telefone só com dígitos; e-mail como se digita. A ordem da lista é a ordem de exibição. */
  readonly value: string
}

export type CompanySocialLink = {
  readonly network: CompanySocialNetwork
  readonly url: string
}

export type CompanyContactSettings = {
  readonly contacts: readonly CompanyContact[]
  readonly socialLinks: readonly CompanySocialLink[]
}

/**
 * A escrita substitui a lista inteira: contato é lista curta e ordenada, e um `PUT` de lista é o que
 * deixa reordenar, editar e remover numa transação só — `PATCH` por item obrigaria a tela a orquestrar
 * três chamadas para uma edição que o operador enxerga como uma.
 */
export type CompanyContactsPort = {
  load(input: { readonly companyId: string }): Promise<CompanyContactSettings>
  replace(input: {
    readonly companyId: string
    readonly settings: CompanyContactSettings
  }): Promise<CompanyContactSettings>
}
