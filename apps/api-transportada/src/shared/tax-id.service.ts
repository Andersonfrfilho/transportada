/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  CHAVE_PATTERN,
  CNPJ_PATTERN,
  formatCnpjForDisplay,
  normalizeTaxId,
} from '@adatechnology/fiscal-provider'

/**
 * CNPJ alfanumérico (IN RFB 2229/2024, NT Conjunta DF-e 2025.001, em produção desde 01/07/2026).
 * O padrão e a normalização são os do pacote fiscal — este arquivo é o único ponto da api que os
 * importa, para o `~` do Postgres, o `regex` do Zod e o XML nunca divergirem entre si.
 */
export { CHAVE_PATTERN, CNPJ_PATTERN, formatCnpjForDisplay, normalizeTaxId }

/** CPF não muda com a IN: onze dígitos, sempre. */
export const CPF_PATTERN = /^[0-9]{11}$/u

/**
 * A raiz é prefixo do documento, e alfanumeriza junto. Deixá-la numérica faria o matcher do perfil
 * de emissão parar de casar exatamente as empresas abertas depois de 01/07/2026.
 */
export const CNPJ_ROOT_PATTERN = /^[A-Z0-9]{8}$/u

/** Documento de participante: CPF ou CNPJ. */
export const TAX_ID_PATTERN = /^(?:[0-9]{11}|[A-Z0-9]{12}[0-9]{2})$/u

/** Filtro de documento do cliente, que aceita CPF, CNPJ e as formas curtas já gravadas. */
export const DOCUMENT_FILTER_PATTERN = /^(?:[0-9]{11,14}|[A-Z0-9]{12}[0-9]{2})$/u

/**
 * Fronteira que não é Zod (query string, parâmetro de rota). Devolve `undefined` quando o valor
 * não é documento — quem chama decide se isso é `400` ou ausência de filtro.
 */
export function parseTaxIdValue(value: string, pattern: RegExp): string | undefined {
  const normalized = normalizeTaxId(value)
  return pattern.test(normalized) ? normalized : undefined
}

/**
 * As oito primeiras posições do CNPJ identificam o grupo econômico — matriz e filiais compartilham
 * a raiz e divergem só na ordem (matriz `0001`) e no dígito verificador. Posições, não dígitos: a
 * raiz alfanumeriza junto com o documento (IN RFB 2229/2024), e `CNPJ_ROOT_PATTERN` já aceita letra
 * nas doze da base. Fronteira estreita: só
 * aceita CNPJ já normalizado de 14 posições, porque quem chama já validou o documento antes.
 */
export function resolveCompanyGroupRoot(cnpj: string): string {
  if (!CNPJ_PATTERN.test(cnpj)) {
    throw new RangeError('resolveCompanyGroupRoot expects a normalized 14-position CNPJ')
  }

  return cnpj.slice(0, 8)
}
