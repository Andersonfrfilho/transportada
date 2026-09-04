/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O portão da RF2: o resultado do provedor só vale se voltou **no município que a nota declara**.
 *
 * ⚠️ **Isto é conferência, não filtro.** Mandar a cidade na consulta é pedido — o provedor pode
 * ignorá-lo e devolver uma "Rua 7 de Setembro" de outro município, que existe em centenas deles. Se
 * ninguém confere a volta, essa coordenada é gravada como `rooftop`: **precisão alta na cidade
 * errada**, que é a pior combinação possível, porque ninguém mais desconfia dela.
 *
 * O eixo da conferência é o **código IBGE**, não o nome. Nome de município volta em grafia,
 * acentuação e caixa variadas de cada provedor — `Luís Antônio`, `LUIS ANTONIO`, `Luis Antônio` —
 * e comparar texto aqui reintroduziria o problema que a spec 084 rejeita em toda parte.
 */
export type CityMatch = Readonly<{
  /** `true` quando o resultado deve ser **descartado**, não comparado. */
  mismatch: boolean
  reason: 'city_differs' | 'matched' | 'unknown_result_city'
}>

/**
 * ⚠️ **Resultado sem município identificável também é descarte.** Não saber em que cidade o
 * provedor caiu é indistinguível de ele ter caído na errada — e o lado seguro do erro aqui é
 * recusar, porque o degrau seguinte da escada é o CEP, que é grátis e nosso.
 */
export function checkCityMatch(input: {
  readonly noteCityCode: null | string
  readonly resultCityCode: null | string
}): CityMatch {
  const nota = (input.noteCityCode ?? '').trim()
  const resultado = (input.resultCityCode ?? '').trim()

  if (resultado.length === 0) return { mismatch: true, reason: 'unknown_result_city' }

  /**
   * Nota sem município é o caso em que **não há o que conferir**. Ela não vira descarte: a própria
   * ausência já impede a chave de parada de existir, e recusar aqui esconderia a causa real atrás
   * de um "provedor errou de cidade" que não aconteceu.
   */
  if (nota.length === 0) return { mismatch: false, reason: 'matched' }

  return nota === resultado
    ? { mismatch: false, reason: 'matched' }
    : { mismatch: true, reason: 'city_differs' }
}
