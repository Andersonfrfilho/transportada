/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * O DOM dos testes de hook. ⚠️ Ele roda **num processo à parte** (`test:hooks`): registrar `window`
 * no processo dos contratos mudaria o que eles medem — `resolveTripAssemblyDraftStorage` e outros
 * decidem por `typeof window` —, e o `mock.module` dos clientes vazaria para as outras suítes.
 */
import { GlobalRegistrator } from '@happy-dom/global-registrator'

GlobalRegistrator.register({ url: 'http://localhost/' })

/** Sem isto o React avisa, a cada `setState`, que a atualização saiu de fora de um `act`. */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
