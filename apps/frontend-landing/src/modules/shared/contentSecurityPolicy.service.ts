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

/**
 * A landing não busca origem externa nenhuma: sem mapa, sem Keycloak, sem consulta de CNPJ pelo
 * navegador (o CEP passa pela nossa API — ADR-0040). Vazio de propósito, não esquecido: a varredura
 * do teste de contrato falha se o bundle nomear uma origem `https://` sem declará-la aqui.
 */
export const EXTERNAL_CONNECT_ORIGIN = [] as const

/** Nenhum link de rodapé aponta para fora hoje. Mesma razão do array acima: vazio, não esquecido. */
export const NON_FETCH_ORIGIN = [] as const

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
  const configured = [toOrigin(apiBaseUrl)].filter((origin): origin is string => origin !== undefined)
  const connectSource = [
    SELF,
    ...[...new Set([...configured, ...EXTERNAL_CONNECT_ORIGIN])].sort(),
  ].join(' ')
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
    `frame-src ${NONE}`,
    `img-src ${SELF}`,
    `manifest-src ${SELF}`,
    `object-src ${NONE}`,
    `script-src ${scriptSource}`,
    `style-src ${SELF} ${UNSAFE_INLINE}`,
    `worker-src ${SELF}`,
  ].join('; ')
}
