/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { consultarCnpj } from '@adatechnology/fiscal-provider'

import type {
  CompanyProfileLookupPort,
  CompanyProfileLookupResult,
} from '../application/company-settings.port.js'
import { normalizeTaxId } from '../../shared/tax-id.service.js'

export function createFiscalCompanyProfileLookupGateway(): CompanyProfileLookupPort {
  return {
    async lookupByCnpj({ cnpj }): Promise<CompanyProfileLookupResult | null> {
      try {
        const result = await consultarCnpj(cnpj)
        return {
          city: normalizeText(result.municipio),
          cityIbgeCode: onlyDigits(result.codigoMunicipio),
          cnpj: normalizeTaxId(result.cnpj),
          complement: normalizeText(result.complemento),
          district: normalizeText(result.bairro),
          email: normalizeText(result.email),
          legalName: normalizeText(result.razaoSocial),
          number: normalizeText(result.numero),
          phone: normalizeText(result.telefone),
          postalCode: onlyDigits(result.cep),
          state: normalizeState(result.uf),
          stateRegistration: normalizeText(result.inscricaoEstadual),
          street: normalizeText(result.logradouro),
          tradeName: normalizeText(result.nomeFantasia),
        }
      } catch {
        return null
      }
    },
  }
}

function normalizeText(value: string | undefined): string {
  return value?.trim() ?? ''
}

/** Só para CEP e código de município, que continuam numéricos. O documento passa por `normalizeTaxId`. */
function onlyDigits(value: string | undefined): string {
  return value?.replace(/\D/g, '') ?? ''
}

function normalizeState(value: string | undefined): string {
  return normalizeText(value).toUpperCase()
}
