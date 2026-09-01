/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A diretiva é composta no **build**, não no runtime: a origem da API chega por `VITE_API_URL`, que
 * o Vite inlina no bundle e que não existe no contêiner que serve o `dist`. O plugin do Vite grava o
 * resultado ao lado do bundle e o `server.ts` o lê no boot.
 */

const SELF = "'self'"
const NONE = "'none'"
const UNSAFE_INLINE = "'unsafe-inline'"

/** Nome do arquivo emitido no `dist`. O `server.ts` não importa daqui: ele é copiado sozinho. */
export const CONTENT_SECURITY_POLICY_FILE_NAME = 'content-security-policy.txt'

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

/**
 * A única origem externa que a landing busca é o Cloudflare Turnstile — o widget de captcha do
 * formulário de candidatura (`TurnstileWidget.component.tsx`) chama de volta pra validar o desafio.
 * Fora isso: sem mapa, sem Keycloak, sem consulta de CNPJ pelo navegador (o CEP passa pela nossa
 * API — ADR-0040). A varredura do teste de contrato falha se o bundle nomear outra origem `https://`
 * sem declará-la aqui.
 */
export const EXTERNAL_CONNECT_ORIGIN = [TURNSTILE_ORIGIN] as const

/** Nenhum link de rodapé aponta para fora hoje. Mesma razão do array acima: vazio, não esquecido. */
export const NON_FETCH_ORIGIN = [] as const

/** O script do Turnstile precisa rodar e o widget dele precisa abrir o próprio iframe de desafio. */
export const TURNSTILE_SCRIPT_ORIGIN = TURNSTILE_ORIGIN
export const TURNSTILE_FRAME_ORIGIN = TURNSTILE_ORIGIN

type ContentSecurityPolicyParams = {
  readonly allowsInlineScript: boolean
  readonly apiBaseUrl: string | undefined
}

/**
 * Variável ausente não derruba o build: o job de qualidade do CI constrói sem `.env`, e um bundle
 * sem `VITE_API_URL` já morre no boot em runtime — a diretiva mais estreita não acrescenta modo de
 * falha. Valor presente e impossível de ler, sim: aí `new URL` estoura, e é o que se quer.
 */
function toOrigin(value: string | undefined): string | undefined {
  const declared = value?.trim() ?? ''
  return declared === '' ? undefined : new URL(declared).origin
}

export function buildContentSecurityPolicy({
  allowsInlineScript,
  apiBaseUrl,
}: ContentSecurityPolicyParams): string {
  const configured = [toOrigin(apiBaseUrl)].filter(
    (origin): origin is string => origin !== undefined,
  )
  const connectSource = [
    SELF,
    ...[...new Set([...configured, ...EXTERNAL_CONNECT_ORIGIN])].sort(),
  ].join(' ')
  /**
   * A marca da transportadora é uma imagem servida pela **nossa API** (`/public/landing-logo`), e
   * não um arquivo do bundle: ela é configurada por empresa, não compilada. Sem a origem da API
   * aqui, o navegador bloqueia o logo e o site cai no nome genérico do produto — com a API
   * respondendo 200, que é o que torna o defeito difícil de enxergar.
   */
  const imageSource = [SELF, ...configured].join(' ')
  // O preâmbulo do react-refresh é script inline, e só existe no servidor de dev. Em preview e em
  // produção o bundle é arquivo, então `script-src 'self'` basta e é o que fica no `dist`.
  const scriptSource = allowsInlineScript ? `${SELF} ${UNSAFE_INLINE}` : SELF

  return [
    `default-src ${SELF}`,
    `base-uri ${SELF}`,
    `connect-src ${connectSource}`,
    `font-src ${SELF}`,
    `form-action ${SELF}`,
    `frame-ancestors ${NONE}`,
    `frame-src ${TURNSTILE_FRAME_ORIGIN}`,
    `img-src ${imageSource}`,
    `manifest-src ${SELF}`,
    `object-src ${NONE}`,
    `script-src ${scriptSource} ${TURNSTILE_SCRIPT_ORIGIN}`,
    `style-src ${SELF} ${UNSAFE_INLINE}`,
    `worker-src ${SELF}`,
  ].join('; ')
}
