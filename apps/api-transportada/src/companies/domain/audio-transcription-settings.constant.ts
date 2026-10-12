/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 264 (contract.md §5.1): a decisão da empresa sobre transcrever os áudios da conversa. Sem linha a empresa
 * está ligada.
 */
export const DEFAULT_AUDIO_TRANSCRIPTION_ENABLED = true

export const AUDIO_TRANSCRIPTION_SETTINGS_CHANGED_ACTION = 'company-audio-transcription.changed'
export const AUDIO_TRANSCRIPTION_SETTINGS_AUDIT_TARGET_TYPE = 'company_audio_transcription_settings'
export const AUDIO_TRANSCRIPTION_SETTINGS_AUDIT_PERMISSION = 'settings.manage'
