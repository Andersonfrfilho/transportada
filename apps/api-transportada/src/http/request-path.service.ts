/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  API_AUTH_ME_PATH,
  API_AUDIT_EVENTS_PATH,
  API_BILLING_ELIGIBLE_CTES_PATH,
  API_BILLING_INVOICES_PATH,
  API_COMPANY_SETTINGS_FUEL_PRICES_PATH,
  API_COMPANY_SETTINGS_PATH,
  API_CTE_BATCHES_PATH,
  API_DIGITAL_CERTIFICATES_PATH,
  API_FREIGHT_CALCULATIONS_PATH,
  API_FREIGHT_RULES_PATH,
  API_NFE_DOCUMENTS_PATH,
  API_NFE_IMPORTS_PATH,
  API_OPERATIONS_JOBS_PATH,
  API_OPERATIONS_SUMMARY_PATH,
  API_OPERATIONS_TIMELINE_PATH,
  PATH_PARAMETER_SEGMENT_PATTERN,
  UNMATCHED_LOG_PATHNAME,
} from '../shared/api.constant'

type ResolveLogPathnameParams = {
  readonly pathname: string
  readonly templates: readonly string[]
}

type TemplateMatchesSegmentsParams = {
  readonly requestSegments: readonly string[]
  readonly template: string
}

export function isNoStorePath(pathname: string): boolean {
  return (
    pathname === API_AUTH_ME_PATH ||
    pathname === API_COMPANY_SETTINGS_PATH ||
    pathname === API_COMPANY_SETTINGS_FUEL_PRICES_PATH ||
    pathname.startsWith(`${API_COMPANY_SETTINGS_FUEL_PRICES_PATH}/`) ||
    pathname === API_DIGITAL_CERTIFICATES_PATH ||
    pathname === API_FREIGHT_RULES_PATH ||
    pathname.startsWith(`${API_FREIGHT_RULES_PATH}/`) ||
    pathname === API_FREIGHT_CALCULATIONS_PATH ||
    pathname.startsWith(`${API_FREIGHT_CALCULATIONS_PATH}/`) ||
    pathname === API_CTE_BATCHES_PATH ||
    pathname.startsWith(`${API_CTE_BATCHES_PATH}/`) ||
    pathname === API_BILLING_ELIGIBLE_CTES_PATH ||
    pathname.startsWith(`${API_BILLING_ELIGIBLE_CTES_PATH}/`) ||
    pathname === API_BILLING_INVOICES_PATH ||
    pathname.startsWith(`${API_BILLING_INVOICES_PATH}/`) ||
    pathname === API_OPERATIONS_SUMMARY_PATH ||
    pathname === API_OPERATIONS_TIMELINE_PATH ||
    pathname === API_OPERATIONS_JOBS_PATH ||
    pathname === API_AUDIT_EVENTS_PATH ||
    pathname === API_NFE_IMPORTS_PATH ||
    pathname.startsWith(`${API_NFE_IMPORTS_PATH}/`) ||
    pathname === API_NFE_DOCUMENTS_PATH ||
    pathname.startsWith(`${API_NFE_DOCUMENTS_PATH}/`)
  )
}

/**
 * O que entra no log é sempre um template registrado, nunca o caminho que o cliente digitou — a
 * redação continua sendo a regra, e o template ainda diz qual rota respondeu. Uma allowlist de
 * caminho literal envelhecia calada: 269 das 276 entradas diziam `<unmatched>` devolvendo 200.
 */
export function resolveLogPathname({ pathname, templates }: ResolveLogPathnameParams): string {
  const staticTemplate = templates.find(
    (template) => template === pathname && !hasParameterSegment(template),
  )
  if (staticTemplate !== undefined) return staticTemplate

  const requestSegments = pathname.split('/')
  return (
    templates.find((template) => templateMatchesSegments({ requestSegments, template })) ??
    UNMATCHED_LOG_PATHNAME
  )
}

function hasParameterSegment(template: string): boolean {
  return template.split('/').some(isParameterSegment)
}

function isParameterSegment(segment: string): boolean {
  return PATH_PARAMETER_SEGMENT_PATTERN.test(segment)
}

function templateMatchesSegments({
  requestSegments,
  template,
}: TemplateMatchesSegmentsParams): boolean {
  const templateSegments = template.split('/')
  if (templateSegments.length !== requestSegments.length) return false
  if (!templateSegments.some(isParameterSegment)) return false
  return templateSegments.every((segment, index) =>
    isParameterSegment(segment)
      ? requestSegments[index] !== ''
      : segment === requestSegments[index],
  )
}
