/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Quem é o barracão, para a linha da perna dizer de onde o caminhão sai.
 *
 * A perna imprimia distância e tempo e mais nada — quem lê a montagem sabia que são 61 km, não de
 * onde. O endereço e o telefone da empresa fecham a frase.
 *
 * ⚠️ **Isto é o endereço da EMPRESA, não uma leitura do ponto de partida.** A origem do roteirizador
 * é uma chave em `company_route_optimization_settings` (medido nesta base: a sentinela `depot`) com
 * coordenada em `geocoded_addresses` — não há endereço escrito para ela em lugar nenhum. Descobrir a
 * rua da coordenada seria geocodificação reversa, que a ADR-0044 recusa. Por isso o rótulo nomeia a
 * empresa: dizer "o barracão fica na Avenida do Café" seria afirmar uma coisa que ninguém verificou,
 * e quem cadastrou uma origem diferente da sede leria uma mentira plausível.
 */

/** O telefone é o primeiro da lista de contatos — a ordem que a empresa mesma escolheu. */
export type DepotDescription = Readonly<{
  address: string
  legalName: string
  /** `null` quando a empresa não cadastrou telefone nenhum: a linha some, e não vira traço. */
  phone: null | string
  tradeName: string
}>

export type ResolveDepotDescriptionParams = {
  readonly phone: null | string
  readonly profile: null | {
    readonly city: string
    readonly district: string
    readonly legalName: string
    readonly number: string
    readonly postalCode: string
    readonly state: string
    readonly street: string
    readonly tradeName: string
  }
}

/**
 * ⚠️ Perfil sem rua ou sem cidade devolve **ausência**, não uma linha pela metade: "—, — · " é pior
 * que nada, porque parece defeito de tela e manda alguém procurar o dado onde ele já está vazio.
 */
export function resolveDepotDescription(
  input: ResolveDepotDescriptionParams,
): DepotDescription | null {
  const { profile } = input
  if (profile === null) return null
  if (profile.street.trim() === '' || profile.city.trim() === '') return null

  const parts = [
    [profile.street, profile.number].filter((part) => part.trim() !== '').join(', '),
    profile.district,
    `${profile.city}/${profile.state}`,
    formatPostalCode(profile.postalCode),
  ].filter((part) => part.trim() !== '')

  return {
    address: parts.join(' · '),
    legalName: profile.legalName,
    phone: input.phone === null || input.phone.trim() === '' ? null : input.phone,
    /** Sem nome fantasia cadastrado, quem aparece é a razão social — nunca uma linha vazia. */
    tradeName: profile.tradeName.trim() === '' ? profile.legalName : profile.tradeName,
  }
}

/** Oito dígitos viram `00000-000`; qualquer outra forma sai intacta, como o telefone guardado. */
function formatPostalCode(value: string): string {
  const digits = value.replace(/\D/gu, '')
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : value
}
