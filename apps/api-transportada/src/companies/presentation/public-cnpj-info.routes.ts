/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { defineAnonymousRoute, type RegisteredAnonymousRoute } from '../../http/router.service.js'
import { API_PUBLIC_CNPJ_INFO_PATH, JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { CompanyProfileLookupResult } from '../application/company-settings.port.js'
import { parsePublicCnpjInfoRequest } from './public-cnpj-info.schema.js'

const ONE_MINUTE_MS = 60_000
/**
 * Quem preenche o cadastro consulta **um** CNPJ, o próprio. O teto existe para a rota não virar
 * proxy de consulta em massa da Receita para terceiros — é o preço de ela ser anônima.
 */
const LOOKUP_RATE_LIMIT = { maxRequests: 12, windowMs: 10 * ONE_MINUTE_MS } as const

/**
 * A projeção pública é menor que a do painel de propósito: inscrição estadual, e-mail e telefone
 * são dados de contato do titular, e esta rota não pede autenticação nenhuma (`security.md` §1).
 * O que sai daqui é o que qualquer um lê no cartão CNPJ.
 */
type PublicCnpjInfo = Readonly<{
  address: Readonly<{
    city: string
    cityIbgeCode: string
    complement: string
    district: string
    number: string
    postalCode: string
    state: string
    street: string
  }>
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

type Dependencies = {
  readonly lookupProfileByCnpj: {
    execute(input: { readonly cnpj: string }): Promise<CompanyProfileLookupResult | null>
  }
}

export function createPublicCnpjInfoRoutes(
  dependencies: Dependencies,
): readonly RegisteredAnonymousRoute[] {
  return [
    defineAnonymousRoute<{ readonly cnpj: string }>({
      async handle({ input }): Promise<Response> {
        const profile = await dependencies.lookupProfileByCnpj.execute({ cnpj: input.cnpj })
        // CNPJ que a Receita não conhece é ausência, não erro do interessado — e o formulário
        // segue com os campos vazios e editáveis.
        if (profile === null) return new Response(null, { status: 404 })

        return new Response(JSON.stringify({ data: toPublicCnpjInfo(profile) }), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ request }) => ({ cnpj: parsePublicCnpjInfoRequest(request) }),
      pathname: API_PUBLIC_CNPJ_INFO_PATH,
      rateLimit: LOOKUP_RATE_LIMIT,
    }),
  ]
}

export function toPublicCnpjInfo(profile: CompanyProfileLookupResult): PublicCnpjInfo {
  return {
    address: {
      city: profile.city,
      cityIbgeCode: profile.cityIbgeCode,
      complement: profile.complement,
      district: profile.district,
      number: profile.number,
      postalCode: profile.postalCode,
      state: profile.state,
      street: profile.street,
    },
    cnpj: profile.cnpj,
    legalName: profile.legalName,
    legalNature: profile.legalNature,
    mainActivityCode: profile.mainActivityCode,
    mainActivityName: profile.mainActivityName,
    openedAt: profile.openedAt,
    simplesNacional: profile.simplesNacional,
    size: profile.size,
    situation: profile.situation,
    tradeName: profile.tradeName,
  }
}
