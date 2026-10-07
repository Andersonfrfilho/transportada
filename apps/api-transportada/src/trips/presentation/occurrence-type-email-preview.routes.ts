/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (RF4): `POST /company-settings/occurrence-types/email-preview` — o e-mail do tipo
 * renderizado com dados de exemplo fixos, pela mesma função do envio. Nada é lido nem gravado: a rota
 * não toca o banco, e por isso o corpo traz os textos que a tela está editando, ainda não salvos.
 */
import { defineRoute } from '../../http/router.service.js'
import { renderOccurrenceEmailPreview } from '../domain/occurrence-template-preview.policy.js'
import {
  parseOccurrenceTypeEmailPreviewRequest,
  type OccurrenceTypeEmailPreviewBody,
} from './occurrence-type-email-preview.schema.js'

export const OCCURRENCE_TYPE_EMAIL_PREVIEW_PATH = '/company-settings/occurrence-types/email-preview'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

/**
 * A tela pede a prévia a cada pausa na digitação; sem teto, um cliente com defeito vira busy-loop
 * nesta rota. Em memória (por instância): é freio de abuso do cliente, não trilha compartilhada.
 */
export const OCCURRENCE_TYPE_EMAIL_PREVIEW_RATE_LIMIT = {
  maxRequests: 60,
  store: 'memory',
  windowMs: 60_000,
} as const

export function createOccurrenceTypeEmailPreviewRoutes(): readonly ReturnType<
  typeof defineRoute
>[] {
  return [
    defineRoute<OccurrenceTypeEmailPreviewBody>({
      async handle({ input }): Promise<Response> {
        const preview = renderOccurrenceEmailPreview(input)
        return Response.json({ data: preview }, { headers: { 'cache-control': 'no-store' } })
      },
      method: 'POST',
      parse: ({ request }) => parseOccurrenceTypeEmailPreviewRequest(request),
      pathname: OCCURRENCE_TYPE_EMAIL_PREVIEW_PATH,
      policy: SETTINGS_MANAGE_POLICY,
      rateLimit: OCCURRENCE_TYPE_EMAIL_PREVIEW_RATE_LIMIT,
    }),
  ]
}
