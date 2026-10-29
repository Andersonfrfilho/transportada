/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 (RF2): as recusas da gravação da matriz "Retorno ao cliente" do tipo de ocorrência.
 */
import { ApiError } from '../../shared/api.error.js'
import type { OccurrenceClientChannel } from '../../shared/occurrence-client-channel.constant.js'
import type { ClientChannelTemplateProblem } from './occurrence-client-channel-template.policy.js'

/** Um detalhe por problema, no campo do canal (`clientChannels.email.templateKey`); a mensagem é o código. */
export class OccurrenceClientChannelTemplateInvalidError extends ApiError {
  public constructor(
    problems: readonly {
      readonly channel: OccurrenceClientChannel
      readonly problems: readonly ClientChannelTemplateProblem[]
    }[],
  ) {
    super({
      code: 'OCCURRENCE_CLIENT_CHANNEL_TEMPLATE_INVALID',
      details: problems.flatMap(({ channel, problems: channelProblems }) =>
        channelProblems.map((problem) => ({
          field: `clientChannels.${channel}.templateKey`,
          message: problem.code,
        })),
      ),
      message: 'The notification template cannot be used for this client channel.',
      status: 400,
    })
  }
}

/**
 * E-mail ligado na matriz com o tipo de e-mail do cliente desligado (`clientEmailType = off`): o painel e o app
 * publicados leriam o canal desligado. Escolha o tipo de e-mail junto.
 */
export class OccurrenceClientChannelEmailTypeRequiredError extends ApiError {
  public constructor() {
    super({
      code: 'OCCURRENCE_CLIENT_CHANNEL_EMAIL_TYPE_REQUIRED',
      details: [{ field: 'clientEmailType', message: 'required_when_email_channel_enabled' }],
      message: 'The email client channel needs a client email type.',
      status: 400,
    })
  }
}
