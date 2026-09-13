/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/**
 * Spec 143 T006: **uma resposta só para tudo que envolve o segredo em repouso** — chave errada,
 * envelope adulterado, AAD de outro tenant. Diferenciar os motivos na resposta é dizer a quem tem
 * acesso à API o que tentar depois; o motivo real vai para o log, nunca para a resposta.
 */
export class ContractorMailCredentialUnavailableError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_MAIL_CREDENTIAL_UNAVAILABLE',
      message: 'Contractor mail credential is unavailable',
      status: 500,
    })
  }
}

/**
 * `whsec_` é o formato do Svix (ADR-0063 §7). Recusar aqui, ao selar, é o que impede uma
 * configuração impossível de verificar mais tarde — sem isso, o segredo colado errado só se
 * revelaria na primeira tentativa de conferir a assinatura do webhook.
 */
export class ContractorMailWebhookSecretFormatError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_MAIL_WEBHOOK_SECRET_FORMAT_INVALID',
      details: [{ field: 'webhookSigningSecret', message: 'must start with whsec_' }],
      message: 'Contractor mail webhook signing secret has an invalid format',
      status: 422,
    })
  }
}

/**
 * Spec 143 T008: os dois segredos são opcionais no `PUT` para permitir manter o que já está selado
 * — mas na **primeira** configuração não existe "o que já está selado" para preservar. Sem os dois
 * de uma vez, a linha nasceria sem envelope.
 */
export class ContractorMailSecretRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_MAIL_SECRET_REQUIRED',
      details: [
        { field: 'apiKey', message: 'required on the first configuration' },
        { field: 'webhookSigningSecret', message: 'required on the first configuration' },
      ],
      message: 'Contractor mail api key and webhook signing secret are required on first save',
      status: 422,
    })
  }
}
