/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 286: o e-mail do retorno da contratante (boleto ao cliente e ao destinatário da nota) sai no **modelo padrão de
 * e-mail** do módulo de notificação (`notification.standard-email`, editável em Notificações) — o mesmo visual do chat da
 * contratante (spec 274). O texto vem do modelo do canal (`contractor-reply-client-template.support.ts`); aqui ele só
 * entra no layout. Nenhum layout em código: o HTML é o do modelo da empresa, ou o embutido do SDK quando ela não tem um
 * utilizável (mesma regra de `standardEmail.resolveTemplate` do módulo).
 *
 * ⚠️ SQL puro, sem tabela importada, para viver idêntico na API e no worker (nenhuma app importa a outra); o contrato
 * de paridade do worker confere byte a byte.
 */
import {
  assessStandardEmailTemplate,
  htmlToPlainText,
  renderStandardEmail,
  STANDARD_EMAIL_BUILTIN_TEMPLATE,
  STANDARD_EMAIL_CHANNEL,
  STANDARD_EMAIL_LOCALE,
  STANDARD_EMAIL_TEMPLATE_KEY,
  type StandardEmailTemplate,
} from '@adatechnology/notification-contracts'
import { sql, type SQL } from 'drizzle-orm'

export type ContractorReplyLayoutRunner = { execute(query: SQL): PromiseLike<unknown> }

export type ContractorReplyLayoutMail = {
  /** O logo vai como parte inline (`cid:company-logo`): o envio do worker anexa a imagem da empresa. */
  readonly hasInlineLogo: boolean
  readonly html: string
  readonly subject: string
  readonly text: string
}

const NOTIFICATION_TEMPLATES = 'notification.templates'
/** O mesmo `cid:` do chat da contratante (`COMPANY_LOGO_CONTENT_ID`): o envio do worker procura por ele. */
const COMPANY_LOGO_CONTENT_ID = 'company-logo'
/** O rodapé do produto, cópia por valor de `OCCURRENCE_MAIL_PRODUCT_SIGNATURE` da API. */
const PRODUCT_SIGNATURE = 'Enviado pelo TransportAdA — uma solução Ada Technology'
const HTML_TAG = /<\/?[a-z][a-z0-9-]*(\s[^<>]*)?>/iu
const WHITESPACE_RUN = /\s+/gu
/** O modelo padrão fixa 620px, que não cabe no celular — o mesmo ajuste de `brandChatMail` da API. */
const FIXED_WIDTH_ATTR = 'width="620"'
const FIXED_WIDTH_STYLE = /(?<!max-)width:\s*620px/g
const EMPTY_ROW = /<tr>\s*<td style="[^"]*">\s*<\/td>\s*<\/tr>/g

type Row = Record<string, unknown>

async function rowsOf(runner: ContractorReplyLayoutRunner, query: SQL): Promise<readonly Row[]> {
  return (await runner.execute(query)) as readonly Row[]
}

function text(row: Row | undefined, key: string): null | string {
  const value = row?.[key]
  return typeof value === 'string' ? value : null
}

function chosenCarrierName(row: Row | undefined): string {
  const legalName = (text(row, 'legal_name') ?? '').trim()
  const tradeName = (text(row, 'trade_name') ?? '').trim()
  if (text(row, 'display_name_mode') === 'legal_name') {
    return legalName === '' ? tradeName : legalName
  }
  return tradeName === '' ? legalName : tradeName
}

async function resolveTemplate(
  runner: ContractorReplyLayoutRunner,
  companyId: string,
): Promise<StandardEmailTemplate> {
  const [row] = await rowsOf(
    runner,
    sql`select body, version from ${sql.raw(NOTIFICATION_TEMPLATES)}
        where company_id = ${companyId} and key = ${STANDARD_EMAIL_TEMPLATE_KEY}
          and channel = ${STANDARD_EMAIL_CHANNEL} and locale = ${STANDARD_EMAIL_LOCALE} and active
        order by version desc limit 1`,
  )
  const body = text(row, 'body')
  if (body === null || !assessStandardEmailTemplate(body).usable) {
    return STANDARD_EMAIL_BUILTIN_TEMPLATE
  }
  return { html: body, source: 'company', version: Number(row?.version ?? 0) }
}

/** O modelo do canal pode ter vindo com HTML (texto antigo migrado na T2): o layout recebe só texto. */
function toBodyText(body: string): string {
  return HTML_TAG.test(body) ? htmlToPlainText(body).trim() : body.trim()
}

function makeFluid(html: string): string {
  return html
    .replaceAll(FIXED_WIDTH_ATTR, 'width="100%"')
    .replace(FIXED_WIDTH_STYLE, 'width:100%')
    .replace(EMPTY_ROW, '')
}

export async function buildContractorReplyLayoutMail(
  runner: ContractorReplyLayoutRunner,
  params: {
    readonly attachmentNames?: readonly string[]
    readonly body: string
    readonly companyId: string
    readonly subject: string
  },
): Promise<ContractorReplyLayoutMail> {
  const { companyId } = params
  const [carrier] = await rowsOf(
    runner,
    sql`select trade_name, legal_name, display_name_mode,
               exists (select 1 from company_logos where company_logos.company_id = ${companyId}::uuid) as has_logo
          from company_fiscal_profiles where company_id = ${companyId}::uuid`,
  )
  const displayName = chosenCarrierName(carrier)
  const hasLogo = carrier?.has_logo === true
  const rendered = renderStandardEmail({
    input: {
      attachments: (params.attachmentNames ?? []).map((name) => ({ name })),
      bodyText: toBodyText(params.body),
      footer: { platformNote: PRODUCT_SIGNATURE },
      identity: {
        displayName,
        logo: hasLogo ? { contentId: COMPANY_LOGO_CONTENT_ID, kind: 'cid' } : { kind: 'initials' },
      },
      signer: { name: displayName },
    },
    template: await resolveTemplate(runner, companyId),
  })
  return {
    hasInlineLogo: hasLogo,
    html: makeFluid(rendered.html),
    subject: params.subject.replace(WHITESPACE_RUN, ' ').trim(),
    text: rendered.text,
  }
}
