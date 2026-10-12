/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DEFAULT_MAX_RECORDING_BYTES,
  type ParticipantAudioRecordingOptions,
} from '@adatechnology/conversations-ui/participant'

import { CONVERSATION_ATTACHMENT_LIMITS } from './conversationAttachment.service'

/**
 * Spec 264 T5.1: a gravação do fio do escritório. A duração fica no padrão do SDK (5 min); o teto de
 * bytes é o menor entre o do SDK e o da política do canal `app` para áudio — o canal do fio. Não há
 * `onCaptureChange`: o painel não tem registro de captura.
 */
export const SUBJECT_AUDIO_RECORDING_OPTIONS: ParticipantAudioRecordingOptions = {
  maxSizeBytes: Math.min(DEFAULT_MAX_RECORDING_BYTES, CONVERSATION_ATTACHMENT_LIMITS.app.audio),
}
