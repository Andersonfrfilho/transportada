/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  assessStandardEmailTemplate,
  renderStandardEmail,
  STANDARD_EMAIL_BUILTIN_TEMPLATE,
  STANDARD_EMAIL_CHANNEL,
  STANDARD_EMAIL_LOCALE,
  STANDARD_EMAIL_TEMPLATE_KEY,
  type EmailDriverPort,
  type StandardEmailTemplate,
} from '@adatechnology/notification-contracts'
import { sql, type SQL } from 'drizzle-orm'

export type StandardEmailBranding = {
  readonly displayName: string
  readonly template: StandardEmailTemplate
}

export type StandardEmailBrandingRunner = { execute(query: SQL): PromiseLike<unknown> }

type Row = Record<string, unknown>

const NOTIFICATION_TEMPLATES = 'notification.templates'
/** O rodapé do produto, o mesmo texto do e-mail da ocorrência e do retorno da contratante. */
const PRODUCT_SIGNATURE = 'Enviado pelo TransportAdA — uma solução Ada Technology'
const COPYRIGHT_HOLDER = 'Ada Technology'
const DEFAULT_DISPLAY_NAME = 'TransportAdA'
const HTML_TAG = /<\/?[a-z][a-z0-9-]*(\s[^<>]*)?>/iu
const LINE_BREAK = /<br\s*\/?>/giu
/** O modelo padrão fixa 620px, que não cabe no celular — o mesmo ajuste do e-mail da contratante. */
const FIXED_WIDTH_ATTR = 'width="620"'
const FIXED_WIDTH_STYLE = /(?<!max-)width:\s*620px/g

function text(row: Row | undefined, key: string): string {
  const value = row?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

function makeFluid(html: string): string {
  return html.replaceAll(FIXED_WIDTH_ATTR, 'width="100%"').replace(FIXED_WIDTH_STYLE, 'width:100%')
}

/**
 * Nome e modelo padrão da empresa da instalação (ADR-0021: um deploy por transportadora). O envio do
 * módulo de notificação não carrega a empresa, então a identidade vem da ficha fiscal; sem ficha ou
 * sem modelo utilizável, valem o nome do produto e o modelo embutido do SDK — o e-mail nunca sai sem
 * layout por falta de cadastro.
 */
export function createStandardEmailBrandingResolver(
  runner: StandardEmailBrandingRunner,
): () => Promise<StandardEmailBranding> {
  return async function resolveBranding() {
    const [profile] = (await runner.execute(
      sql`select company_id, trade_name, legal_name, display_name_mode
            from company_fiscal_profiles order by company_id limit 1`,
    )) as readonly Row[]

    const legalName = text(profile, 'legal_name')
    const tradeName = text(profile, 'trade_name')
    const preferred = text(profile, 'display_name_mode') === 'legal_name' ? legalName : tradeName
    const displayName = preferred || tradeName || legalName || DEFAULT_DISPLAY_NAME
    const companyId = text(profile, 'company_id')
    if (companyId === '') return { displayName, template: STANDARD_EMAIL_BUILTIN_TEMPLATE }

    const [row] = (await runner.execute(
      sql`select body, version from ${sql.raw(NOTIFICATION_TEMPLATES)}
          where company_id = ${companyId} and key = ${STANDARD_EMAIL_TEMPLATE_KEY}
            and channel = ${STANDARD_EMAIL_CHANNEL} and locale = ${STANDARD_EMAIL_LOCALE} and active
          order by version desc limit 1`,
    )) as readonly Row[]
    const body = text(row, 'body')
    if (body === '' || !assessStandardEmailTemplate(body).usable) {
      return { displayName, template: STANDARD_EMAIL_BUILTIN_TEMPLATE }
    }

    return {
      displayName,
      template: { html: body, source: 'company', version: Number(row?.version) },
    }
  }
}

/**
 * O renderizador padrão do módulo entrega o texto com `&`, `<` e quebras escapados e `<br>` no lugar das
 * linhas: isso ainda é texto puro. Qualquer outra tag é HTML de verdade.
 */
function isPlainTextMail(html: string): boolean {
  return !HTML_TAG.test(html.replace(LINE_BREAK, ''))
}

/**
 * Todo e-mail que o módulo de notificação entrega sai no modelo padrão (corpo, assinatura e rodapé
 * com a marca do produto). O catálogo escreve texto; quem desenha o e-mail é o modelo da empresa —
 * layout em código é proibido (ADR-0110). Mensagem que já veio em HTML (convite, recuperação de
 * senha, modelos HTML publicados) passa intacta: o layout dela é o próprio modelo.
 *
 * Falha ao resolver a identidade não derruba o envio: cai no modelo embutido e no nome do produto.
 */
export function withStandardEmailLayout({
  driver,
  resolveBranding,
}: {
  readonly driver: EmailDriverPort
  readonly resolveBranding: () => Promise<StandardEmailBranding>
}): EmailDriverPort {
  return {
    driver: driver.driver,
    async send(params) {
      if (!isPlainTextMail(params.html)) return await driver.send(params)

      const branding = await resolveBranding().catch(
        (): StandardEmailBranding => ({
          displayName: DEFAULT_DISPLAY_NAME,
          template: STANDARD_EMAIL_BUILTIN_TEMPLATE,
        }),
      )
      const rendered = renderStandardEmail({
        input: {
          attachments: (params.attachments ?? []).map((attachment) => ({
            name: attachment.filename,
          })),
          bodyText: params.text.trim(),
          footer: {
            platformNote: `${PRODUCT_SIGNATURE} · © ${new Date().getFullYear()} ${COPYRIGHT_HOLDER}`,
          },
          identity: { displayName: branding.displayName, logo: { kind: 'initials' } },
          signer: { name: branding.displayName },
        },
        template: branding.template,
      })

      return await driver.send({ ...params, html: makeFluid(rendered.html), text: rendered.text })
    },
  }
}
