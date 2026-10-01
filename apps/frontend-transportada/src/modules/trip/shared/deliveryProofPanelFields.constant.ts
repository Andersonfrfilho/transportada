/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DELIVERY_PROOF_FIELDS, type DeliveryProofField } from './deliveryProofSettings.service'

export type PanelModeField = DeliveryProofField | 'cargo'

/**
 * Lista de exibição do painel, não `DELIVERY_PROOF_FIELDS`: essa também alimenta a tela de
 * resolução, que ainda não mostra a foto da mercadoria. `cargo` é modo, e entra nas três tabelas.
 */
export const PANEL_MODE_FIELDS: readonly PanelModeField[] = [...DELIVERY_PROOF_FIELDS, 'cargo']
