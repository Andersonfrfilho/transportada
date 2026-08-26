import { normalizeTaxId } from '@/modules/shared/taxId.service'

const PUBLIC_CNPJ_INFO_PATH = '/public/cnpj-info'
/** A Receita às vezes demora; o formulário não pode ficar preso nela. */
const LOOKUP_TIMEOUT_MS = 6_000

export type CompanyAddress = Readonly<{
  city: string
  cityIbgeCode: string
  complement: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

export type CompanyInfo = Readonly<{
  address: CompanyAddress
  cnpj: string
  legalName: string
  legalNature: string
  mainActivityCode: string
  mainActivityName: string
  openedAt: string
  simplesNacional: boolean
  size: string
  situation: string
  tradeName: string
}>

export type CompanyInfoClient = Readonly<{
  /** `undefined` quando a Receita não conhece o documento **ou** quando a consulta falhou: nos dois
   * casos o formulário segue com os campos vazios e editáveis, que é o comportamento de antes. */
  lookup: (
    input: Readonly<{ cnpj: string; signal?: AbortSignal }>,
  ) => Promise<CompanyInfo | undefined>
}>

export function createCompanyInfoClient(
  dependencies: Readonly<{ apiBaseUrl: string }>,
): CompanyInfoClient {
  return {
    async lookup({ cnpj, signal }) {
      const timeout = AbortSignal.timeout(LOOKUP_TIMEOUT_MS)
      const abort = signal === undefined ? timeout : AbortSignal.any([signal, timeout])
      try {
        const response = await fetch(
          `${dependencies.apiBaseUrl}${PUBLIC_CNPJ_INFO_PATH}?cnpj=${encodeURIComponent(normalizeTaxId(cnpj))}`,
          { cache: 'no-store', signal: abort },
        )
        if (!response.ok) return undefined
        const body: unknown = await response.json()
        return readCompanyInfo(body)
      } catch {
        return undefined
      }
    },
  }
}

function readCompanyInfo(body: unknown): CompanyInfo | undefined {
  if (typeof body !== 'object' || body === null) return undefined
  const data: unknown = (body as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return undefined
  const record = data as Record<string, unknown>
  const address = (record.address ?? {}) as Record<string, unknown>
  if (readText(record.cnpj) === '') return undefined

  return {
    address: {
      city: readText(address.city),
      cityIbgeCode: readText(address.cityIbgeCode),
      complement: readText(address.complement),
      district: readText(address.district),
      number: readText(address.number),
      postalCode: readText(address.postalCode),
      state: readText(address.state),
      street: readText(address.street),
    },
    cnpj: readText(record.cnpj),
    legalName: readText(record.legalName),
    legalNature: readText(record.legalNature),
    mainActivityCode: readText(record.mainActivityCode),
    mainActivityName: readText(record.mainActivityName),
    openedAt: readText(record.openedAt),
    simplesNacional: record.simplesNacional === true,
    size: readText(record.size),
    situation: readText(record.situation),
    tradeName: readText(record.tradeName),
  }
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export type CompanyDeclaredFields = Readonly<{
  city: string
  companyLegalName: string
  companyOpenedAt: string
  companySituation: string
  companyTradeName: string
  complement: string
  district: string
  number: string
  postalCode: string
  state: string
  street: string
}>

/**
 * O que a Receita responde entra no que está **vazio**, nunca por cima do que a pessoa escreveu:
 * quem corrigiu o endereço à mão tinha um motivo, e o cadastro dela vale mais que o registro. Os
 * campos da empresa são a exceção — eles só existem porque a consulta os trouxe.
 */
export function mergeCompanyIntoFields(input: {
  readonly company: CompanyInfo
  readonly current: CompanyDeclaredFields
  readonly formatPostalCode: (value: string) => string
}): CompanyDeclaredFields {
  const { company, current } = input
  const keepOrFill = (typed: string, fromReceita: string): string =>
    typed === '' ? fromReceita : typed

  return {
    city: keepOrFill(current.city, company.address.city),
    companyLegalName: company.legalName,
    companyOpenedAt: company.openedAt,
    companySituation: company.situation,
    companyTradeName: company.tradeName,
    complement: keepOrFill(current.complement, company.address.complement),
    district: keepOrFill(current.district, company.address.district),
    number: keepOrFill(current.number, company.address.number),
    postalCode:
      current.postalCode === ''
        ? input.formatPostalCode(company.address.postalCode)
        : current.postalCode,
    state: keepOrFill(current.state, company.address.state),
    street: keepOrFill(current.street, company.address.street),
  }
}
