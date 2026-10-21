/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §5): o que o HTML do sistema do e-mail da ocorrência carrega por conta própria — as cores do
 * desenho aprovado, o `Content-ID` do logo embutido e os caminhos das marcas, que o painel publica em `public/icons`.
 */
import { STANDARD_EMAIL_THEME } from '@adatechnology/notification-contracts'

/** O `Content-ID` da parte inline do logo; o `<img src="cid:…">` e o anexo do worker usam o mesmo. */
export const COMPANY_LOGO_CONTENT_ID = 'company-logo'

/** O quadrado do logo (e das iniciais), em pixels. */
export const COMPANY_LOGO_SIZE = STANDARD_EMAIL_THEME.logoSize

/** As marcas do rodapé, relativas à origem do painel (`APP_BASE_URL`); cópia por valor do worker. */
export const PRODUCT_MARK_PATH = '/icons/icon-192.png'
export const ADA_MARK_PATH = '/icons/ada-technology.png'

export const OCCURRENCE_MAIL_PRODUCT_SIGNATURE =
  'Enviado pelo TransportAdA — uma solução Ada Technology'
export const OCCURRENCE_MAIL_REPLY_STRIP =
  '↩ Responda este e-mail: a resposta entra na conversa desta ocorrência e chega à equipe.'

/** Cores fixas do desenho (`color-scheme: light only`): e-mail não herda tema. */
export const OCCURRENCE_MAIL_COLORS = STANDARD_EMAIL_THEME.colors

export const OCCURRENCE_MAIL_FONT = STANDARD_EMAIL_THEME.font

/** Spec 272: as imagens do e-mail por endereço estável, relativas à origem pública da API (`API_PUBLIC_URL`). */
export const PUBLIC_MAIL_ASSET_LOGO_PATH = '/public/mail-assets/:companyId/logo'
/** O logo em silhueta branca, para o cabeçalho e a assinatura (fundo `#10222c`). */
export const PUBLIC_MAIL_ASSET_LOGO_WHITE_PATH = '/public/mail-assets/:companyId/logo-white'
export const PUBLIC_MAIL_ASSET_PICTURE_PATH = '/public/mail-assets/:companyId/users/:userId/picture'

export function buildPublicMailAssetUrls(params: {
  readonly apiPublicUrl: string | undefined
  readonly companyId: string
}):
  | {
      readonly logo: string
      readonly logoWhite: string
      readonly picture: (userId: string) => string
    }
  | undefined {
  const { apiPublicUrl, companyId } = params
  if (apiPublicUrl === undefined || !/^https?:\/\//iu.test(apiPublicUrl)) return undefined
  const origin = apiPublicUrl.replace(/\/+$/u, '')
  return {
    logo: `${origin}${PUBLIC_MAIL_ASSET_LOGO_PATH.replace(':companyId', companyId)}`,
    logoWhite: `${origin}${PUBLIC_MAIL_ASSET_LOGO_WHITE_PATH.replace(':companyId', companyId)}`,
    picture: (userId) =>
      `${origin}${PUBLIC_MAIL_ASSET_PICTURE_PATH.replace(':companyId', companyId).replace(':userId', userId)}`,
  }
}
