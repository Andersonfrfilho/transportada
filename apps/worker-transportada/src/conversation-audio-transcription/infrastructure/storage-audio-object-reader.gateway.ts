/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'
import { AUDIO_DOWNLOAD_TIMEOUT_MS } from '../domain/conversation-audio-transcription.constant.js'
import type { AudioObjectReaderPort } from '../application/speech-to-text.port.js'

/** A chave vem da linha do banco, nunca da mensagem; o download tem prazo e o objeto ausente é `undefined`. */
export function createStorageAudioObjectReader(dependencies: {
  readonly storage: Pick<NfeStorageGateway, 'getObjectStream' | 'headObject'>
}): AudioObjectReaderPort {
  return {
    async read(location) {
      const download = (async (): Promise<Uint8Array | undefined> => {
        const head = await dependencies.storage.headObject(location)
        if (head === undefined) return undefined
        const stream = await dependencies.storage.getObjectStream(location)
        return new Uint8Array(await new Response(stream).arrayBuffer())
      })()
      let timer: ReturnType<typeof setTimeout> | undefined
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('audio_download_timeout')),
          AUDIO_DOWNLOAD_TIMEOUT_MS,
        )
      })
      try {
        return await Promise.race([download, deadline])
      } finally {
        clearTimeout(timer)
        download.catch(() => undefined)
      }
    },
  }
}
