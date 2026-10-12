/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (contract.md §5.1): o liga/desliga da transcrição dos áudios, por empresa. `settings.manage`. Sem linha é
 * resposta válida (ligada), não 404. A resposta é lista branca: o objeto do repositório nunca é espalhado.
 */
import type { ClientIpResolver } from '../../http/client-ip.service.js'
import { defineRoute } from '../../http/router.service.js'
import {
  API_COMPANY_SETTINGS_AUDIO_TRANSCRIPTION_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  AudioTranscriptionActor,
  AudioTranscriptionSettings,
} from '../application/audio-transcription-settings.port.js'
import { parseAudioTranscriptionSettingsBody } from './audio-transcription-settings.schema.js'

const SETTINGS_MANAGE_POLICY = { permission: 'settings.manage', scope: 'company' } as const
const NO_STORE_HEADERS = { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE }

type Dependencies = {
  readonly get: {
    execute(input: { readonly companyId: string }): Promise<AudioTranscriptionSettings>
  }
  /** O teto de duração que a rotina aplica (`AUDIO_TRANSCRIPTION_MAX_DURATION_MS`): informativo, nunca vem do corpo. */
  readonly maxDurationMs: number
  readonly resolveClientIp: ClientIpResolver
  readonly save: {
    execute(
      input: AudioTranscriptionActor & { readonly enabled: boolean },
    ): Promise<AudioTranscriptionSettings>
  }
}

type SaveInput = {
  readonly correlationId: string
  readonly enabled: boolean
  readonly ipAddress: string
}

export function createAudioTranscriptionSettingsRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  function settingsResponse(settings: AudioTranscriptionSettings): Response {
    const data = {
      enabled: settings.enabled,
      maxDurationMs: dependencies.maxDurationMs,
      updatedAt: settings.updatedAt?.toISOString() ?? null,
    }
    return new Response(JSON.stringify({ data }), { headers: NO_STORE_HEADERS, status: 200 })
  }

  return [
    defineRoute<undefined>({
      async handle({ context }): Promise<Response> {
        return settingsResponse(
          await dependencies.get.execute({ companyId: context.scope.companyId }),
        )
      },
      method: 'GET',
      parse: () => undefined,
      pathname: API_COMPANY_SETTINGS_AUDIO_TRANSCRIPTION_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
    defineRoute<SaveInput>({
      async handle({ context, input }): Promise<Response> {
        return settingsResponse(
          await dependencies.save.execute({
            companyId: context.scope.companyId,
            correlationId: input.correlationId,
            enabled: input.enabled,
            ipAddress: input.ipAddress,
            userId: context.scope.userId,
          }),
        )
      },
      method: 'PUT',
      parse: async ({ correlationId, request }) => ({
        correlationId,
        ipAddress: dependencies.resolveClientIp(request),
        ...(await parseAudioTranscriptionSettingsBody(request)),
      }),
      pathname: API_COMPANY_SETTINGS_AUDIO_TRANSCRIPTION_PATH,
      policy: SETTINGS_MANAGE_POLICY,
    }),
  ]
}
