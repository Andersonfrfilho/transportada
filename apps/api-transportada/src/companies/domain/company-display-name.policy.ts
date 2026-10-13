/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  type CompanyDisplayNameMode,
  DEFAULT_COMPANY_DISPLAY_NAME_MODE,
} from '../../database/company-fiscal-profile.schema.js'

export type CompanyDisplayNameInput = {
  readonly displayNameMode?: CompanyDisplayNameMode
  readonly legalName: string
  readonly tradeName: string
}

/**
 * O nome que a empresa escolheu mostrar onde o nome é só para ser lido: e-mails, PDFs comerciais, marca do
 * painel e do app do motorista. É a única regra — ninguém mais decide fantasia ou razão social por conta própria.
 *
 * A fantasia vazia cai na razão social nos dois modos: nenhuma tela mostra uma linha em branco.
 *
 * Documento fiscal (CT-e, MDF-e, NFS-e) NÃO passa por aqui: o emitente leva sempre a razão social, e a fantasia
 * segue em campo próprio (`xFant`).
 */
export function resolveCompanyDisplayName(input: CompanyDisplayNameInput): string {
  const mode = input.displayNameMode ?? DEFAULT_COMPANY_DISPLAY_NAME_MODE
  const legalName = input.legalName.trim()
  const tradeName = input.tradeName.trim()

  if (mode === 'legal_name') return legalName === '' ? tradeName : legalName
  return tradeName === '' ? legalName : tradeName
}
