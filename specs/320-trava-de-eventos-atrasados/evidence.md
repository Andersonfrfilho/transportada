# Evidências — Spec 320

## T0.1 — Medição em produção (10/11/2026)

`tmp/ops/producao-motorista-eventos-atrasados.sh` (últimos 3 dias, somente leitura):

- Um ator (`11994f54…`, canal `driver_app`) gravou 45 relatos hoje entre 17:15 e 17:35 UTC.
- 7 eventos de **parada** (arrived, departed, delivered) chegaram às 17:34 UTC com toque de 9 a 29 h antes.
- Nenhuma ocorrência de nota repetida e nenhuma parada com o mesmo tipo de evento duas vezes.
- Pendente: `producao-motorista-paradas-atrasadas.sh` (eventos dessas paradas por todos os canais) para confirmar a duplicação.
- Decisão do Anderson (10/11): retenção só para ocorrências. Os eventos de parada acima não seriam pegos; revisitar depois da leitura da segunda consulta.

## T2.1 — Política "mesma data"

`bun test ./test/field-report-hold.contract.test.ts`: 9 pass, 0 fail. `eslint`, `prettier --check` e `tsc --noEmit` limpos. Cobre a tolerância de 3 h (CA2), o fuso de Brasília, a correção de relógio, a correção descartada e a ausência de `tappedAt` (CA6).
