/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

const COUNTRY_AND_AREA_CODE_LENGTH = 4
const SUBSCRIBER_TAIL_LENGTH = 8

/**
 * Spec 144 T005b B3/M4: `55` + DDD + os últimos oito dígitos. A Meta entrega o mesmo celular com e
 * sem o nono dígito, e as duas grafias caem na mesma chave. É a mesma conta da coluna gerada
 * `user_whatsapp_phones.phone_key` — mudar uma sem a outra separa o índice do limitador.
 *
 * Recebe o número já canônico (`toWhatsAppPhone`).
 */
export function toWhatsAppPhoneKey(phone: string): string {
  return `${phone.slice(0, COUNTRY_AND_AREA_CODE_LENGTH)}${phone.slice(-SUBSCRIBER_TAIL_LENGTH)}`
}
