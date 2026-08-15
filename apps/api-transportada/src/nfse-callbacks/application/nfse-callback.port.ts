/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
export type NfseCallbackCredential = {
  readonly callbackTokenSha256: string
  readonly companyId: string
}

export type AnticipateStatusChecksParams = {
  readonly companyId: string
}

export type NfseCallbackRepositoryPort = {
  /**
   * Único efeito permitido pelo postback: puxar para agora a próxima consulta das notas que já
   * estavam agendadas. Quem lê a situação de verdade é o job `nfse.status.pull` (ADR-0029).
   */
  anticipateStatusChecks(params: AnticipateStatusChecksParams): Promise<void>
  /**
   * Sem tenant no contexto, a rota não sabe de quem é o token: quem descobre a empresa é a
   * comparação em tempo constante sobre todas as credenciais ativas.
   */
  listActiveCallbackCredentials(): Promise<readonly NfseCallbackCredential[]>
}

export type NotifyNfseCallbackParams = {
  readonly token: string
}

export type NotifyNfseCallbackUseCase = {
  execute(params: NotifyNfseCallbackParams): Promise<void>
}
