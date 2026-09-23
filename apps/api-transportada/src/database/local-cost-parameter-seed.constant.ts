/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Os parâmetros de custo da bancada. Sem eles a conta da viagem não tem como prever nada: a linha
 * do motorista pede diárias que ninguém configurou, e a de combustível não sabe o preço do litro —
 * é o que a tela mostra como "informe quantas diárias a viagem paga" e "ninguém lançou".
 *
 * ⚠️ São valores de **bancada**, não medição: a diária é a ordem de grandeza que a operação usa, e
 * o preço do diesel acompanha a referência da ANP que a própria semente de preços já carrega. Quem
 * levar estes números para um ambiente publicado está copiando convenção, não dado.
 */
import { DEFAULT_FUEL_PRODUCT, type FuelProduct } from '../shared/fuel.constant.js'

/** O que a viagem paga por dia ao motorista. */
export const LOCAL_DRIVER_DAILY_ALLOWANCE = '200.0000'

/** O combustível que a frota da bancada queima, e o litro que a conta usa. */
export const LOCAL_FUEL_PRODUCT: FuelProduct = DEFAULT_FUEL_PRODUCT
export const LOCAL_FUEL_PRICE_PER_UNIT = '7.1000'
