/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type { DeliveryProofStoragePort } from '../application/attach-delivery-proof.use-case.js'
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'

/**
 * O comprovante vai para o **bucket privado**, como o XML já vai (`security.md` §7). Não há URL
 * pública em lugar nenhum deste caminho: quem precisar ver pede uma assinada e curta.
 *
 * O gateway de armazenamento é o mesmo do fiscal de propósito — um segundo provedor seria uma
 * segunda credencial, um segundo ciclo de vida e um segundo lugar para esquecer de expurgar.
 */
export function createDeliveryProofStorage(input: {
  readonly bucket: string
  readonly storage: NfeStorageGateway
}): DeliveryProofStoragePort {
  return {
    async store(proof) {
      const sha256 = createHash('sha256').update(proof.bytes).digest('hex')
      await input.storage.storeObject({
        body: proof.bytes,
        bucket: input.bucket,
        contentLength: proof.bytes.byteLength,
        contentType: proof.mimeType,
        key: proof.objectKey,
        sha256,
      })

      return { sha256 }
    },
  }
}
