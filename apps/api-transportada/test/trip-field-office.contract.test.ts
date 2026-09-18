/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 156 T5: as rotas do escritório em `/trips/:id` — permissão própria, alvo resolvido pela
 * empresa, e `audit_logs` para cada ação (ADR-0067).
 */
import './trip-field-office/policy.contract.js'
import './trip-field-office/routes.contract.js'
import './trip-field-office/finance-read.contract.js'
import './trip-field-office/occurrences-route.contract.js'
