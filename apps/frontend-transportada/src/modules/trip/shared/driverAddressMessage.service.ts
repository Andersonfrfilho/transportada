/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Spec 343 (T6a): o texto do chat do app com o endereço correto, e o link do mapa para o motorista abrir a rota. */
export function buildDriverAddressChatMessage(addressText: string): string {
  const text = addressText.trim()
  return `Endereço correto da entrega: ${text}\nAbrir no mapa: https://maps.google.com/?q=${encodeURIComponent(text)}`
}
