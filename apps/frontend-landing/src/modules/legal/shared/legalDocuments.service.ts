/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { LandingSettings } from '@/modules/shared/landingSettings.service'
import legalLocale from '../locales/legal.locale.json'

/**
 * Os três endereços que o cadastro do aplicativo da Meta exige preencher. Mudar um destes caminhos
 * invalida o que já foi declarado no painel — o valor é contrato com fora, não detalhe de rota.
 */
export const LEGAL_DOCUMENT_PATHS = {
  dataDeletion: '/exclusao-de-dados',
  privacyPolicy: '/privacidade',
  termsOfService: '/termos',
} as const

export type LegalDocumentKey = keyof typeof LEGAL_DOCUMENT_PATHS

export type LegalDocumentSection = Readonly<{
  body: readonly string[]
  heading: string
  items: readonly string[]
}>

export type LegalDocument = Readonly<{
  contactLine: string
  contactHeading: string
  sections: readonly LegalDocumentSection[]
  summary: string
  title: string
  updatedAt: string
}>

const BRAND_PLACEHOLDER = /\{\{brand\}\}/gu
const EMAIL_PLACEHOLDER = /\{\{email\}\}/gu
const DEFAULT_BRAND_NAME = 'TransportAdA'

export function resolveLegalDocumentKey(pathname: string): LegalDocumentKey | undefined {
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/u, '') : pathname
  const entry = Object.entries(LEGAL_DOCUMENT_PATHS).find(([, path]) => path === normalized)
  return entry === undefined ? undefined : (entry[0] as LegalDocumentKey)
}

/**
 * O e-mail do encarregado é o do cadastro do site. Sem ele a frase muda em vez de sair truncada:
 * documento legal com destinatário em branco é pior que documento que manda procurar o contato.
 */
function resolveContactEmail(settings: LandingSettings): string | undefined {
  if (settings.contactEmail !== undefined) return settings.contactEmail
  return settings.contacts.find((contact) => contact.kind === 'email')?.value
}

function applyBrand(text: string, brandName: string): string {
  return text.replaceAll(BRAND_PLACEHOLDER, brandName)
}

/** Texto configurado (`landingSettings.sections`) vence o padrão; tipo errado cai no padrão. */
function resolveOverride(
  sections: Readonly<Record<string, unknown>>,
  documentKey: LegalDocumentKey,
  field: string,
): string | undefined {
  const document = sections[documentKey]
  if (typeof document !== 'object' || document === null) return undefined
  const value = (document as Record<string, unknown>)[field]
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}

function resolveSections(
  documentKey: LegalDocumentKey,
  brandName: string,
): readonly LegalDocumentSection[] {
  return legalLocale[documentKey].sections.map((section) => ({
    body: section.body.map((paragraph) => applyBrand(paragraph, brandName)),
    heading: section.heading,
    items: section.items.map((item) => applyBrand(item, brandName)),
  }))
}

function resolveContactLine(brandName: string, contactEmail: string | undefined): string {
  if (contactEmail === undefined) {
    return applyBrand(legalLocale.contact.withoutEmail, brandName)
  }
  return applyBrand(legalLocale.contact.withEmail, brandName).replaceAll(
    EMAIL_PLACEHOLDER,
    contactEmail,
  )
}

export function resolveLegalDocument(
  input: Readonly<{ documentKey: LegalDocumentKey; settings: LandingSettings }>,
): LegalDocument {
  const brandName = input.settings.brandName ?? DEFAULT_BRAND_NAME
  const locale = legalLocale[input.documentKey]
  const sections = input.settings.sections

  return {
    contactHeading: legalLocale.contact.heading,
    contactLine: resolveContactLine(brandName, resolveContactEmail(input.settings)),
    sections: resolveSections(input.documentKey, brandName),
    summary: applyBrand(
      resolveOverride(sections, input.documentKey, 'summary') ?? locale.summary,
      brandName,
    ),
    title: resolveOverride(sections, input.documentKey, 'title') ?? locale.title,
    updatedAt: resolveOverride(sections, input.documentKey, 'updatedAt') ?? locale.updatedAt,
  }
}
