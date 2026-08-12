/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { hashCallbackToken, matchCallbackCredential } from '../domain/nfse-callback-token.policy.js'
import type {
  NfseCallbackRepositoryPort,
  NotifyNfseCallbackParams,
  NotifyNfseCallbackUseCase,
} from './nfse-callback.port.js'

type CreateNotifyNfseCallbackUseCaseParams = {
  readonly repository: NfseCallbackRepositoryPort
}

export function createNotifyNfseCallbackUseCase({
  repository,
}: CreateNotifyNfseCallbackUseCaseParams): NotifyNfseCallbackUseCase {
  return Object.freeze({
    async execute({ token }: NotifyNfseCallbackParams): Promise<void> {
      const credentials = await repository.listActiveCallbackCredentials()
      const companyId = matchCallbackCredential({
        credentials,
        digest: hashCallbackToken(token),
      })
      if (companyId === undefined) return

      await repository.anticipateStatusChecks({ companyId })
    },
  })
}
