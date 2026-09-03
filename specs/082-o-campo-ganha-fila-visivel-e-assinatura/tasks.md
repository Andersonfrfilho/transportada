# Tasks — spec 082

Formato: id · task · depende · verificação · 🤖 modelo. Task fecha com evidência em `evidence.md`.

## Fase 1 — ADRs

- [ ] T001 ADR-0057 comprovante configurável + documento com envelope. — · revisão humana · 🧠 opus
- [ ] T002 ADR-0058 dispatch pelo motorista. — · revisão humana · 🧠 opus

## Fase 2 — API

- [ ] T010 Contratos primeiro: `test/trips-schema/delivery-proof-settings-tenant-safety.contract.ts`,
      negativo de log do documento, casos de aceite do dispatch (403/`unchanged`). depende T001,T002 ·
      `bun run --cwd apps/api-transportada test` (vermelho) · sonnet
- [ ] T011 Migration `company_delivery_proof_settings` + `delivery_proof_setting_overrides`
      (CNPJ do destinatário), CHECKs `required/optional/off`, rollback.sql. T010 · `make migration-test` · sonnet
- [ ] T012 Rotas de settings (`settings.manage`) + settings resolvidos no snapshot de
      `/me/trips/current`. T011 · contratos verdes · sonnet
- [ ] T013 `receiverDocument` no `proof`: schema condicional à configuração, envelope A256GCM
      (AAD `transportada:delivery-proof:v1:${companyId}:${proofId}`), máscara nas leituras. T011 · contratos + negativo de log · 🧠 opus
- [ ] T014 `POST /me/trips/current/dispatch` (policy no domínio, idempotente, snapshot). T010 ·
      `me-trip.integration.ts` estendida · sonnet

## Fase 3 — Worker

- [ ] T020 Chaves `OCCURRENCE_*` + disparo `notification.v1` na ocorrência; sem template → grava e segue.
      T010 · `worker-integration` + contrato de paridade · sonnet

## Fase 4 — Shell

- [ ] T030 Navegação Viagem·Perfil, header (marca, empresa, foto do motorista), barra de progresso.
      — · contratos de design system + `test/trip/…` novos · sonnet

## Fase 5 — Fila

- [ ] T040 Anexo na fila IndexedDB com teto declarado e descarte anunciado. 🧠 desenho com opus ·
      contrato de serviço puro (`offlineQueue`) · sonnet
- [ ] T041 Tela de eventos pendentes com envio manual (um/todos) e causa de falha. T040 ·
      contrato de tela por serviço puro · sonnet

## Fase 6 — Entrega

- [ ] T050 Distância haversine + ocultar sem posição. T030 · contrato de serviço puro · haiku
- [ ] T051 Assinatura canvas + tela inteira landscape lock (fallback iOS). T030 ·
      contrato por texto de fonte (lock + fallback) · sonnet
- [ ] T052 Recorte do comprovante no aparelho + ajuste manual. T040 · contrato de serviço puro · sonnet
- [ ] T053 Campos do comprovante dirigidos pela configuração (required bloqueia, off não renderiza).
      T012,T013 · contrato de tela · sonnet

## Fase 7 — Ocorrência

- [ ] T060 Chips de motivo → prévia do template (paridade com a chave do worker); fotos local/carga
      pela fila. T020,T040 · contratos · sonnet

## Fase 8 — Gate

- [ ] T070 `make check`, testes listados nos package.json, evidence.md completo, ai-slop-cleaner,
      verificação, code review. tudo · gates verdes · sonnet + revisão opus
