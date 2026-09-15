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

/**
 * Revisão do `architect` (T008): cobre as duas corridas do `PUT`. Sem `expectedVersion`, a linha já
 * existir é conflito (alguém venceu a criação antes); com `expectedVersion`, a versão não bater —
 * inclusive porque a linha não existe mais — é conflito. Nos dois casos o cliente perdeu a corrida
 * e precisa reler (`GET`) antes de tentar de novo; nenhum envelope selado chega a ser gravado.
 */
export class ContractorMailSettingsVersionConflictError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_MAIL_SETTINGS_VERSION_CONFLICT',
      message: 'Contractor mail settings version conflict',
      status: 409,
    })
  }
}

/**
 * Spec 143 T009: o botão "Enviar e-mail de teste" exige a configuração já salva — sem ela não há
 * remetente, domínio de resposta nem credencial para enviar nada.
 */
export class ContractorMailNotConfiguredError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_MAIL_NOT_CONFIGURED',
      message: 'Contractor mail is not configured for this company',
      status: 409,
    })
  }
}

/**
 * O destinatário do e-mail de teste é o e-mail do próprio administrador autenticado (RF13), nunca o
 * corpo da requisição. Sem um e-mail cadastrado no perfil dele, não há para onde mandar o teste.
 */
export class ContractorMailTestRecipientUnavailableError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_MAIL_TEST_RECIPIENT_UNAVAILABLE',
      message: 'The authenticated user has no email address to receive the test message',
      status: 422,
    })
  }
}

/**
 * Spec 150 T301 (spec 143 T013): e-mail já cadastrado (ativo ou inativo) para a mesma contratante —
 * `contractor_contacts_company_contractor_email_unique` é a fonte da verdade, por caixa
 * (`lower(email)`), sem `citext` neste repositório.
 */
export class ContractorContactEmailTakenError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_CONTACT_EMAIL_TAKEN',
      details: [{ field: 'email', message: 'already registered for this contractor' }],
      message: 'Contractor contact email is already registered for this contractor',
      status: 409,
    })
  }
}

/** Spec 150 T301 (spec 143 T013): o contato não existe dentro da dupla `(contractorId, contactId)`. */
export class ContractorContactNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_CONTACT_NOT_FOUND',
      message: 'Contractor contact was not found',
      status: 404,
    })
  }
}

/**
 * Spec 143 T010 (RF11): `webhookId` desconhecido, empresa sem configuração, ou assinatura Svix
 * inválida/fora da janela — as três recebem a mesma resposta fail-closed, para não distinguir "id
 * não existe" de "assinatura errada" a quem não tem o segredo.
 */
export class ContractorMailInboundWebhookUnauthorizedError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_MAIL_INBOUND_WEBHOOK_UNAUTHORIZED',
      message: 'Contractor mail inbound webhook signature could not be verified',
      status: 401,
    })
  }
}
