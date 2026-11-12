/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286 (RF6): o estado do modelo do e-mail de correção de endereço no módulo de notificação e a prévia com os
 * dados fictícios do desenho aprovado. Alimenta a confirmação do envio e o resumo "pronto para enviar".
 */
import { ADDRESS_CORRECTION_MAIL_SAMPLE } from '../domain/address-correction-mail-sample.constant.js'
import {
  ADDRESS_CORRECTION_MAIL_TEMPLATE_KEY,
  ADDRESS_CORRECTION_MAIL_VARIABLES,
  type AddressCorrectionMailVariable,
} from '../domain/address-correction-mail-template.constant.js'
import {
  assessAddressCorrectionTemplate,
  blocksAddressCorrectionMailSend,
  type AddressCorrectionTemplateProblem,
} from '../domain/address-correction-mail-template.policy.js'
import { buildAddressCorrectionMail } from '../domain/address-correction-mail.template.js'
import type { BuildAddressCorrectionMailResult } from '../domain/address-correction-mail.types.js'
import type { AddressCorrectionMailTemplate } from './address-correction-mail.port.js'

export type AddressCorrectionMailTemplateState = {
  readonly key: string
  readonly preview: BuildAddressCorrectionMailResult | null
  readonly problems: readonly AddressCorrectionTemplateProblem[]
  /** Pode sair e-mail com ele: nenhum problema que bloqueia o envio. */
  readonly usable: boolean
  readonly variables: readonly AddressCorrectionMailVariable[]
  readonly version: number | null
}

export type ReadAddressCorrectionMailTemplateUseCase = Readonly<{
  read: (input: { readonly companyId: string }) => Promise<AddressCorrectionMailTemplateState>
}>

export function createReadAddressCorrectionMailTemplateUseCase(dependencies: {
  readonly findTemplate: (params: {
    readonly companyId: string
  }) => Promise<AddressCorrectionMailTemplate | undefined>
}): ReadAddressCorrectionMailTemplateUseCase {
  return {
    async read({ companyId }) {
      const template = await dependencies.findTemplate({ companyId })
      const problems = assessAddressCorrectionTemplate(template ?? null)
      const usable = template !== undefined && !blocksAddressCorrectionMailSend(problems)
      return {
        key: ADDRESS_CORRECTION_MAIL_TEMPLATE_KEY,
        preview: usable
          ? buildAddressCorrectionMail({
              ...ADDRESS_CORRECTION_MAIL_SAMPLE,
              template: { body: template.body, subject: template.subject },
            })
          : null,
        problems,
        usable,
        variables: ADDRESS_CORRECTION_MAIL_VARIABLES,
        version: template?.version ?? null,
      }
    },
  }
}
