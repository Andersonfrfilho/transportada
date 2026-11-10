# Plano — Spec 320

Cada fase entra em staging antes da próxima. Produção só por cherry-pick de bug crítico, com aprovação.

1. **Medir** (T0): ler a produção com `tmp/ops/producao-motorista-eventos-atrasados.sh`, confirmar a causa e quantos itens duplicaram.
2. **Banco** (T1): migration aditiva `trip_field_report_holds` e o interruptor por empresa.
3. **Servidor** (T2): política pura `field-report-hold.policy.ts` (mesma data, tolerância, fuso) usada por `withFieldReport` (`trip-field-report.port.ts`), o ponto por onde passam chegada, saída, baixa, retorno, ocorrências e comprovante. Busca de duplicata provável. Rotas de listar, liberar e descartar. Liberar reentra no mesmo caminho com o `occurredAt` original.
4. **App do motorista** (T3): `tappedAt` e `clockOffsetMs` em `documentOccurrence`; tratar `202 held` como entregue.
5. **Painel** (T4): bloco de retidos em `/pendencias` com os componentes padrão; prints claro/escuro, desktop/celular.
6. **Ligar** (T5): staging com motorista de teste; produção com aprovação.

A regra de dia vive só no servidor; o app só envia a hora do toque.
