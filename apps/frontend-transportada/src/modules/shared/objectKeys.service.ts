/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * A guarda de chaves de corpo de resposta — **uma só**, para todo o painel.
 *
 * ⚠️ Ela é regra de **segurança**, não de contrato. Recusar chave desconhecida é a última linha
 * antes de a API vazar token, identidade de tenant ou XML fiscal para dentro do cliente
 * (`security.md` §8). A spec 078 mediu isso ao tentar afrouxá-la: catorze testes reprovaram, entre
 * eles `recusa um resumo de credencial que traga o token de volta`.
 *
 * Antes da spec 079 ela existia **oito vezes**, em duas assinaturas incompatíveis — e regra de
 * segurança escrita oito vezes é regra que muda em sete lugares e fica para trás no oitavo, que é
 * o que vaza, calado.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * *Type predicate* de propósito (spec 079 D1): ela subsume a forma que devolvia `boolean` — quem só
 * quer o booleano ignora o estreitamento, mas quem tem só o booleano precisa repetir `isRecord` para
 * estreitar, que era o que cinco chamadores faziam.
 */
export function hasExactKeys(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => keys.includes(key)) &&
    keys.every((key) => key in value)
  )
}

/**
 * Spec 078 D2: **permitidas** e **obrigatórias** são conjuntos diferentes, e `hasExactKeys` não sabe
 * expressar campo opcional — tirar da lista faz a chave presente ser recusada como desconhecida, e
 * deixar na lista faz a chave ausente ser recusada. Nenhum dos dois serve ao intervalo entre o
 * deploy da API e o do bundle.
 *
 * ⚠️ A proteção continua inteira: chave fora de `allowed` segue recusada.
 */
export function hasKeys(
  value: unknown,
  input: Readonly<{ allowed: readonly string[]; required: readonly string[] }>,
): value is Record<string, unknown> {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) => input.allowed.includes(key)) &&
    input.required.every((key) => key in value)
  )
}
