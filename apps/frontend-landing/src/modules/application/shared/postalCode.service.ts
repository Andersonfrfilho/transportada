/* Copyright (c) 2026 Ada Technology. MIT License. */

const POSTAL_CODE_LENGTH = 8

/**
 * O CEP aqui é **digitado**, nunca consultado: `GET /postal-codes/{cep}` exige `addresses.read` e
 * escopo de empresa, e abri-la a anônimo entregaria a varredura da base de endereços oito dígitos
 * por vez — exatamente o que a ADR-0040 evitou. Só máscara, sem chamada de rede.
 */
export function formatPostalCode(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, POSTAL_CODE_LENGTH)
  if (digits.length <= 5) return digits
  return `${digits.slice(0, 5)}-${digits.slice(5)}`
}
