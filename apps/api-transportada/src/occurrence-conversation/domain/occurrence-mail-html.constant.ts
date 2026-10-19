/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 272 (ADR-0110 §5): o que o HTML do sistema do e-mail da ocorrência carrega por conta própria — as cores do
 * desenho aprovado, o `Content-ID` do logo embutido e os caminhos das marcas, que o painel publica em `public/icons`.
 */

/** O `Content-ID` da parte inline do logo; o `<img src="cid:…">` e o anexo do worker usam o mesmo. */
export const COMPANY_LOGO_CONTENT_ID = 'company-logo'

/** O quadrado do logo (e das iniciais), em pixels. */
export const COMPANY_LOGO_SIZE = 48

/** As marcas do rodapé, relativas à origem do painel (`APP_BASE_URL`); cópia por valor do worker. */
export const PRODUCT_MARK_PATH = '/icons/icon-192.png'
export const ADA_MARK_PATH = '/icons/ada-technology.png'

export const OCCURRENCE_MAIL_PRODUCT_SIGNATURE =
  'Enviado pelo TransportAdA — uma solução Ada Technology'
export const OCCURRENCE_MAIL_REPLY_STRIP =
  '↩ Responda este e-mail: a resposta entra na conversa desta ocorrência e chega à equipe.'

/** Cores fixas do desenho (`color-scheme: light only`): e-mail não herda tema. */
export const OCCURRENCE_MAIL_COLORS = {
  asphalt: '#10222c',
  copper: '#d58a47',
  ink: '#1d2b33',
  mist: '#f0f2ee',
  rule: '#d9ded8',
  slate: '#5a6b74',
} as const

export const OCCURRENCE_MAIL_FONT = 'Arial,Helvetica,sans-serif'
