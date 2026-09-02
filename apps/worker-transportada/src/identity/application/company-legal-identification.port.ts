/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Como a pessoa jurídica se identifica num documento: razão social, CNPJ e endereço.
 *
 * O e-mail de sistema — o que não é endereçado a uma pessoa e por isso não tem identidade de
 * usuário no cabeçalho — precisa disso no rodapé: sem nome de quem recebe, é a identificação legal
 * que responde de quem a mensagem é. E-mail endereçado a usuário não a carrega: ali quem manda já
 * está dito no cabeçalho, e repetir CNPJ e endereço em todo convite é ruído.
 */
export type CompanyLegalIdentification = {
  readonly city: string
  /** Contato fiscal da empresa: é o que o rodapé usa quando o cadastro do site não tem os dele. */
  readonly email: string
  readonly phone: string
  readonly complement: string
  readonly district: string
  readonly legalName: string
  readonly number: string
  readonly postalCode: string
  readonly state: string
  readonly street: string
  /** CNPJ na forma canônica, sem máscara e em caixa alta — a máscara é do template. */
  readonly taxId: string
}

export type CompanyLegalIdentificationPort = Readonly<{
  find: (input: { readonly companyId: string }) => Promise<CompanyLegalIdentification | undefined>
}>
