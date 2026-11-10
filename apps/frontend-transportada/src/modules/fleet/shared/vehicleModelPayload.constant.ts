/* Copyright (c) 2026 Ada Technology. MIT License. */

/**
 * Carga útil publicada por modelo, para o cadastro sugerir o `capacity_kg` quando o veículo não tem
 * igual medido na frota nem referência do tipo com peso (pesquisa de 10/11/2026, fichas de terceiros).
 *
 * ⚠️ É **sugestão**, nunca trava: o campo continua editável e vazio continua salvando. Só entra em
 * campo em branco, com a origem impressa. Número daqui é o **menor** publicado para a família, porque
 * teto alto demais é o erro que faz alguém carregar acima do que o veículo aguenta.
 *
 * Só carga útil: o interior do baú (C×L×A) não consta nessas fichas — as dimensões publicadas são as
 * externas do veículo — e por isso não se sugere medida por modelo.
 */
export type VehicleModelPayload = Readonly<{
  /** Trechos que o nome da marca normalizado precisa conter (qualquer um basta). */
  brandIncludes: readonly string[]
  label: string
  /** Trechos que o nome do modelo normalizado precisa conter (qualquer um basta). */
  modelIncludes: readonly string[]
  payloadKilograms: string
}>

export const VEHICLE_MODEL_PAYLOADS: readonly VehicleModelPayload[] = [
  /** Fiorino furgão 1.4 (2014): 650 kg — fichacompleta.com.br. É o padrão da frota. */
  {
    brandIncludes: ['FIAT'],
    label: 'Fiorino',
    modelIncludes: ['FIORINO'],
    payloadKilograms: '650',
  },
  /** Strada: 685 kg (Adventure Extreme 2016) e 720 kg (Endurance CP MY24); fica o menor. */
  { brandIncludes: ['FIAT'], label: 'Strada', modelIncludes: ['STRADA'], payloadKilograms: '685' },
  /** Master furgão Extra 2.3 (2017): 1.433 kg — fichacompleta.com.br. */
  {
    brandIncludes: ['RENAULT'],
    label: 'Master',
    modelIncludes: ['MASTER'],
    payloadKilograms: '1433',
  },
  /** Ducato Cargo/Maxicargo: 1.620 kg (2017) e 1.630 kg (2025) publicados; 1.540 kg é o da frota. */
  {
    brandIncludes: ['FIAT'],
    label: 'Ducato',
    modelIncludes: ['DUCATO'],
    payloadKilograms: '1540',
  },
  /** Besta furgão 2.7 (2005): 1.225 kg — fichacompleta.com.br. */
  { brandIncludes: ['KIA'], label: 'Besta', modelIncludes: ['BESTA'], payloadKilograms: '1225' },
]
