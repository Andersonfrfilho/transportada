/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { ApiError } from '../../shared/api.error.js'

/** Spec 318 RF5: o grupo já é a identidade de um motorista ou o canal de outra contratante. */
export class ContractorOccurrenceGroupTakenError extends ApiError {
  public constructor(owner: 'contractor' | 'driver') {
    super({
      code: 'CONTRACTOR_OCCURRENCE_GROUP_TAKEN',
      details: [
        {
          field: 'groupJid',
          message:
            owner === 'driver'
              ? 'already linked to a driver'
              : 'already linked to another contractor',
        },
      ],
      message: 'This WhatsApp group already has an owner',
      status: 409,
    })
  }
}

/** O botão de teste sem modelo do aviso no grupo cadastrado em Notificações. */
export class ContractorOccurrenceGroupTemplateMissingError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_OCCURRENCE_GROUP_TEMPLATE_MISSING',
      message: 'There is no WhatsApp template for the occurrence group notice',
      status: 409,
    })
  }
}

/** O botão de teste com a contratante ainda no e-mail. */
export class ContractorOccurrenceGroupNotConfiguredError extends ApiError {
  public constructor() {
    super({
      code: 'CONTRACTOR_OCCURRENCE_GROUP_NOT_CONFIGURED',
      message: 'The contractor occurrence channel is not a WhatsApp group',
      status: 409,
    })
  }
}

/** O teste não chegou ao grupo; `reason` é fechado e nunca traz grupo nem número. */
export class ContractorOccurrenceGroupTestFailedError extends ApiError {
  public constructor(reason: 'disconnected' | 'failed' | 'group_not_found') {
    super({
      code: 'CONTRACTOR_OCCURRENCE_GROUP_TEST_FAILED',
      details: [{ field: 'reason', message: reason }],
      message: 'The test message did not reach the WhatsApp group',
      status: 502,
    })
  }
}
