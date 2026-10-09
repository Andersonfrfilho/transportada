/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  ParticipantAttachment,
  ParticipantSubjectRef,
} from '@adatechnology/conversation-contracts'

import { DRIVER_CONVERSATION_ERROR } from './driverConversation.constant'
import type { DriverConversationRoutes } from './driverConversationRoutes.service'
import {
  DriverConversationRequestError,
  type DriverConversationHttp,
} from './driverConversationsHttp.service'
import { attachmentKindOf } from './driverConversationsMapper.service'

export type DriverConversationUploader = Readonly<{
  upload: (
    input: Readonly<{ files: readonly File[]; subject: ParticipantSubjectRef }>,
  ) => Promise<readonly ParticipantAttachment[]>
}>

function readUpload(payload: unknown): Readonly<{ uploadId: string; uploadUrl: string }> {
  const data =
    typeof payload === 'object' && payload !== null && 'data' in payload ? payload.data : undefined
  if (
    typeof data === 'object' &&
    data !== null &&
    'uploadId' in data &&
    'uploadUrl' in data &&
    typeof data.uploadId === 'string' &&
    typeof data.uploadUrl === 'string'
  ) {
    return { uploadId: data.uploadId, uploadUrl: data.uploadUrl }
  }
  throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.RESPONSE_INVALID)
}

/**
 * Upload em duas etapas (pedir a URL, PUT direto ao storage). O arquivo que já subiu neste
 * rascunho reaproveita o mesmo id: reenviar com a mesma `Idempotency-Key` e ids novos daria 409.
 */
export function createDriverConversationUploader(
  dependencies: Readonly<{ http: DriverConversationHttp; routes: DriverConversationRoutes }>,
): DriverConversationUploader {
  const { http, routes } = dependencies
  const uploadedFiles = new WeakMap<File, ParticipantAttachment>()

  async function uploadOne(
    file: File,
    subject: ParticipantSubjectRef,
  ): Promise<ParticipantAttachment> {
    const known = uploadedFiles.get(file)
    if (known !== undefined) return known
    const upload = readUpload(
      await routes.requestUpload(subject, {
        contentType: file.type,
        fileName: file.name,
        sizeBytes: file.size,
      }),
    )
    await http.putFile({ file, url: upload.uploadUrl })
    const attachment: ParticipantAttachment = {
      filename: file.name,
      id: upload.uploadId,
      kind: attachmentKindOf(file.type),
      mimeType: file.type,
      sizeBytes: file.size,
    }
    uploadedFiles.set(file, attachment)
    return attachment
  }

  return {
    upload: ({ files, subject }) => Promise.all(files.map((file) => uploadOne(file, subject))),
  }
}
