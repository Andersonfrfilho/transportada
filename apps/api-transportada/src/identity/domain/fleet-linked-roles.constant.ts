/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CompanyRole } from '../../database/identity.schema.js'

/**
 * Papéis cuja pessoa tem ficha em `fleet_drivers` — é por eles que o convite procura o vínculo. São
 * os perfis do cadastro de frota (`FLEET_DRIVER_PROFILES`); um contrato os mantém em sintonia sem
 * acoplar a camada de identidade ao módulo de frota.
 */
export const FLEET_LINKED_ROLES: readonly CompanyRole[] = ['aggregate', 'driver', 'helper']
