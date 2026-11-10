# Tasks — Spec 320

Modelo por etapa: servidor e migration em Opus; app e painel em Sonnet.

## Fase 0 — Medir (Sonnet)

- [x] T0.1 Anderson roda `tmp/ops/producao-motorista-eventos-atrasados.sh`; registrar em `evidence.md` o que duplicou.
- [ ] T0.2 Propor ao Anderson a limpeza do que já duplicou (só com OK dele).

## Fase 1 — Banco (Opus)

- [ ] T1.1 Contrato da migration (aditiva, rollback) e migration `trip_field_report_holds`.
- [ ] T1.2 Interruptor por empresa, desligado.

## Fase 2 — Servidor (Opus)

- [x] T2.1 Contrato da política (CA2, 3 h, fuso, virada de dia) e `field-report-hold.policy.ts`.
- [ ] T2.2 Reter dentro de `withFieldReport`; `202 held`; reenvio idempotente (CA1, CA6).
- [ ] T2.3 Duplicata provável (CA3).
- [ ] T2.4 Rotas listar, liberar e descartar; liberar idempotente com a hora original (CA4, CA5); integração.
- [ ] T2.5 Reter só ocorrência de parada e de nota (D3), com o corte pela política.
- [ ] T2.6 Liberar e descartar só com permissão do escritório (D10).
- [ ] T2.7 `tappedAt` e `clockOffsetMs` opcionais na ocorrência de nota, `.strict()` preservado.

## Fase 3 — App do motorista (Sonnet)

- [ ] T3.1 Enviar `tappedAt` e `clockOffsetMs` em `documentOccurrence`.
- [ ] T3.2 `202 held` sai da fila e mostra "enviado ao escritório para conferência".

## Fase 4 — Painel (Sonnet)

- [ ] T4.1 Bloco de retidos em `/pendencias` (componentes padrão), com prints claro/escuro, desktop/celular.

## Fase 5 — Ligar

- [ ] T5.1 Ligar em staging e testar com motorista de teste.
- [ ] T5.2 Produção só com aprovação do Anderson; atualizar `docs/runbooks/producao.md`.
