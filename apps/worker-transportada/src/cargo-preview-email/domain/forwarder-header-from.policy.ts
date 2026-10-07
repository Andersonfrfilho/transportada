/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T4.7c: o DKIM alinha o `d=` ao `From` que a `mailauth` leu. O encaminhador só vale quando esse `From`
 * é UM só e é o mesmo endereço que o nosso leitor tirou do MIME — dois leitores que discordam sobre o remetente
 * deixam passar a chave do atacante com o endereço do encaminhador (`<a"@evil.example>"@t.example>`).
 */
export function isAlignedFromTheForwarder(input: {
  readonly forwarderAddress: string
  readonly headerFrom: readonly string[]
}): boolean {
  const [alignedAddress, ...others] = input.headerFrom
  if (alignedAddress === undefined || others.length > 0) return false
  return alignedAddress.toLowerCase() === input.forwarderAddress
}
