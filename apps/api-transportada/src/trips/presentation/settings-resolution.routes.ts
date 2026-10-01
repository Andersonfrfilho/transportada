/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-E1/RF-E2: `GET /company-settings/settings-resolution` — a mesma conta que o app do
 * motorista faria para uma nota real dessa combinação, sem gravar nada. Vive num arquivo próprio
 * (não em `delivery-proof-settings.routes.ts` nem em `trip.routes.ts`) porque lê dos dois domínios.
 */
import { z } from 'zod'

import { defineRoute } from '../../http/router.service.js'
import { invalidRequest } from '../../http/request-parsing.service.js'
import {
  API_COMPANY_SETTINGS_SETTINGS_RESOLUTION_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import { normalizeTaxId, TAX_ID_PATTERN } from '../../shared/tax-id.service.js'
import type {
  ReadSettingsResolutionParams,
  SettingsResolutionResult,
} from '../application/read-settings-resolution.use-case.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const

const settingsResolutionQuerySchema = z
  .object({
    contractorId: z.uuid().optional(),
    recipientTaxId: z.string().regex(TAX_ID_PATTERN).optional(),
  })
  .strict()
  .refine((data) => data.contractorId !== undefined || data.recipientTaxId !== undefined, {
    message: 'CONTRACTOR_OR_RECIPIENT_TAX_ID_REQUIRED',
  })

export type SettingsResolutionQuery = Readonly<{
  contractorId: string | null
  recipientTaxId: string | null
}>

/** Segmento vazio (`?contractorId=`) é tratado como ausente — nunca um UUID vazio a validar. */
function parseSettingsResolutionQuery(url: URL): SettingsResolutionQuery {
  const contractorIdRaw = url.searchParams.get('contractorId')
  const recipientTaxIdRaw = url.searchParams.get('recipientTaxId')

  const parsed = settingsResolutionQuerySchema.safeParse({
    ...(contractorIdRaw === null || contractorIdRaw.trim() === ''
      ? {}
      : { contractorId: contractorIdRaw }),
    ...(recipientTaxIdRaw === null || recipientTaxIdRaw.trim() === ''
      ? {}
      : { recipientTaxId: normalizeTaxId(recipientTaxIdRaw) }),
  })
  if (!parsed.success) throw invalidRequest()

  return {
    contractorId: parsed.data.contractorId ?? null,
    recipientTaxId: parsed.data.recipientTaxId ?? null,
  }
}

export type SettingsResolutionDependencies = {
  readonly readSettingsResolution: (
    input: Omit<ReadSettingsResolutionParams, 'port'>,
  ) => Promise<SettingsResolutionResult>
}

function jsonResponse(body: SettingsResolutionResult): Response {
  return new Response(JSON.stringify({ data: body }), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: 200,
  })
}

export function createSettingsResolutionRoutes(
  dependencies: SettingsResolutionDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<SettingsResolutionQuery>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.readSettingsResolution({
          companyId: context.scope.companyId,
          contractorId: input.contractorId,
          recipientTaxId: input.recipientTaxId,
        })
        return jsonResponse(result)
      },
      method: 'GET',
      parse: ({ request }) => parseSettingsResolutionQuery(new URL(request.url)),
      pathname: API_COMPANY_SETTINGS_SETTINGS_RESOLUTION_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}
