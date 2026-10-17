/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 271 (ADR-0108, D6): o assunto e o corpo do e-mail à contratante a partir do modelo do módulo de
 * notificação. Texto puro — a assinatura é anexada por `buildOccurrenceMail`, que também escapa o HTML.
 */
import { interpolateTemplate } from '@adatechnology/notification-contracts'

import { joinItemLines } from '../../trips/domain/occurrence-mail-values.policy.js'
import { OCCURRENCE_ITEM_LINES_LIMIT } from './occurrence-contractor-mail.constant.js'
import { OCCURRENCE_MAIL_LIMITS } from './occurrence-conversation.constant.js'

const WHITESPACE_RUN = /\s+/gu

export type RenderContractorMailParams = {
  readonly bodyTemplate: string
  /** Uma linha por item marcado, todas: se o corpo passar do teto, as últimas viram "e mais N itens". */
  readonly itemLines: readonly string[]
  readonly subjectTemplate: string
  /** `{{variável}}` → valor; a que falta sai vazia. `linhasItens` vem de `itemLines`. */
  readonly values: Readonly<Record<string, string>>
}

export type RenderedContractorMail = {
  readonly bodyText: string
  readonly subject: string
}

export function renderContractorMail(params: RenderContractorMailParams): RenderedContractorMail {
  const { bodyTemplate, itemLines, subjectTemplate, values } = params
  const subject = interpolateTemplate(subjectTemplate, values)
    .replace(WHITESPACE_RUN, ' ')
    .trim()
    .slice(0, OCCURRENCE_MAIL_LIMITS.subject)

  function renderBody(shownLines: number): string {
    return interpolateTemplate(bodyTemplate, {
      ...values,
      linhasItens: joinItemLines(itemLines, shownLines),
    })
  }

  let shown = Math.min(itemLines.length, OCCURRENCE_ITEM_LINES_LIMIT)
  let bodyText = renderBody(shown)
  while (bodyText.length > OCCURRENCE_MAIL_LIMITS.body && shown > 0) {
    shown -= 1
    bodyText = renderBody(shown)
  }
  return { bodyText: bodyText.slice(0, OCCURRENCE_MAIL_LIMITS.body), subject }
}
