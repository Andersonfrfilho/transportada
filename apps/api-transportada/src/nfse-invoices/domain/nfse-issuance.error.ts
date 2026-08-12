/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'
import { NFSE_TRANSITION_BLOCK, type NfseTransitionBlock } from './nfse-invoice-state.policy.js'
import type { NfseSelectionBlockReason } from './nfse-selection.policy.js'

const BLOCK_MESSAGE: Readonly<Record<NfseTransitionBlock, string>> = {
  [NFSE_TRANSITION_BLOCK.alreadyAuthorized]: 'The service invoice is already authorized.',
  [NFSE_TRANSITION_BLOCK.alreadyCancelled]: 'The service invoice is already cancelled.',
  [NFSE_TRANSITION_BLOCK.cancellationInFlight]:
    'The city already received the cancellation and has not confirmed it yet.',
  [NFSE_TRANSITION_BLOCK.inFlight]: 'The service invoice already has a request in flight.',
  [NFSE_TRANSITION_BLOCK.notAuthorized]: 'The service invoice is not authorized by the city.',
  [NFSE_TRANSITION_BLOCK.pendingAuthorization]:
    'The city accepted the service invoice and has not authorized it yet.',
}

const CONFLICT_STATUS = 409
const NOT_FOUND_STATUS = 404
const UNPROCESSABLE_STATUS = 422

/**
 * Nota de outra empresa é 404, nunca 403: responder "existe, mas não é sua" já entrega que a nota
 * existe, e o número dela é sequencial.
 */
export class NfseInvoiceNotFoundError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_INVOICE_NOT_FOUND',
      message: 'The service invoice was not found.',
      status: NOT_FOUND_STATUS,
    })
  }
}

/** O XML e o PDF chegam com a autorização: antes disso não há objeto para assinar. */
export class NfseFiscalDocumentUnavailableError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_FISCAL_DOCUMENT_UNAVAILABLE',
      message: 'The fiscal document is not archived yet.',
      status: CONFLICT_STATUS,
    })
  }
}

export class NfseInvoiceTransitionBlockedError extends ApiError {
  public constructor(reason: NfseTransitionBlock) {
    super({ code: reason, message: BLOCK_MESSAGE[reason], status: CONFLICT_STATUS })
  }
}

export class NfseIdempotencyKeyReusedError extends ApiError {
  public constructor() {
    super({
      code: 'IDEMPOTENCY_KEY_REUSED',
      message: 'The idempotency key was already used with a different request.',
      status: CONFLICT_STATUS,
    })
  }
}

/** A seleção devolve os bloqueios como dado na prévia; na criação o primeiro deles é o erro. */
export class NfseSelectionBlockedError extends ApiError {
  public constructor(reason: NfseSelectionBlockReason) {
    super({
      code: reason,
      message: 'A selected document cannot be linked to a service invoice.',
      status: UNPROCESSABLE_STATUS,
    })
  }
}

export class NfseDescriptionTemplateInvalidError extends ApiError {
  public constructor(variableName: string) {
    super({
      code: 'NFSE_DESCRIPTION_TEMPLATE_INVALID',
      message: `The description template uses an unknown variable: ${variableName}.`,
      status: UNPROCESSABLE_STATUS,
    })
  }
}

export class NfseDescriptionTooLongError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_DESCRIPTION_TOO_LONG',
      message: 'The description template leaves no room for a single linked document.',
      status: UNPROCESSABLE_STATUS,
    })
  }
}

export class NfseIssRateOutOfRangeError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_ISS_RATE_OUT_OF_RANGE',
      message: 'The ISS rate must be a fraction between zero and one.',
      status: UNPROCESSABLE_STATUS,
    })
  }
}

/** Emitida quando a empresa ainda não configurou os próprios dados fiscais de prestador. */
export class NfseFiscalSettingsMissingError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_FISCAL_SETTINGS_MISSING',
      message: 'The company has not configured its fiscal settings yet.',
      status: UNPROCESSABLE_STATUS,
    })
  }
}

/** Sem credencial ativa para o ambiente fiscal do perfil, o worker não teria como autenticar no provedor. */
export class NfseCredentialMissingError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_CREDENTIAL_MISSING',
      message: 'There is no active NFS-e provider credential for the requested fiscal environment.',
      status: UNPROCESSABLE_STATUS,
    })
  }
}

/** Perfil em rascunho ou inativo não emite: a nota sairia com dados que ninguém revisou. */
export class NfseEmissionProfileNotActiveError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_EMISSION_PROFILE_NOT_ACTIVE',
      message: 'The emission profile is not active.',
      status: UNPROCESSABLE_STATUS,
    })
  }
}

/** Sem versão publicada da regra, não há percentual para congelar no cálculo da nota. */
export class NfseFreightRuleVersionMissingError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_FREIGHT_RULE_VERSION_MISSING',
      message: 'The freight rule has no published version.',
      status: UNPROCESSABLE_STATUS,
    })
  }
}

/**
 * Uma nota de serviço tem um tomador só. Documentos selecionados que resolvem tomadores
 * diferentes não podem virar uma única nota — a prévia já os separa em grupos por tomador,
 * mas a criação recebe um grupo por vez.
 */
export class NfseInvoiceCreateSpansMultipleTakersError extends ApiError {
  public constructor() {
    super({
      code: 'NFSE_INVOICE_CREATE_SPANS_MULTIPLE_TAKERS',
      message:
        'The selected documents resolve to more than one taker; create one invoice per taker.',
      status: UNPROCESSABLE_STATUS,
    })
  }
}
