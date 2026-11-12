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

## T1.1/T1.2 — Tabelas e interruptor

Migration `20261110181442_field_report_holds` (aditiva: `company_field_report_hold_settings`, `trip_field_report_holds`) com `snapshot.json` e `rollback.sql` que recusa rodar com relato retido por decidir. Contratos estáticos de migration, cadeia e schema: 469 pass, 0 fail. `eslint`, `prettier` e `tsc --noEmit` limpos.

⚠️ Não rodei a migration contra um Postgres real (sem Docker nesta sessão): `make migration-test` (migration + rollback) fica a cargo da CI deste PR.

## T2.2 a T2.7 — Servidor

- `holdOrRegisterDriverOccurrence` (`field-report-hold.port.ts`) decide entre registrar e reter; `DrizzleFieldReportHoldRepository` guarda a retenção por chave (reenvio devolve a mesma linha) e procura a provável duplicata por qualquer canal.
- Rota do motorista (`POST /me/trips/current/documents/:id/occurrences`) aceita `tappedAt` e `clockOffsetMs` opcionais e responde `202 { held: true, id }` quando retém.
- `GET /field-report-holds`, `POST .../:id/release` e `.../:id/discard` (`occurrences.resolve`, limite no Postgres); liberar reaplica o corpo pela mesma função do app, com a mesma chave.
- `bun run test` na API: 14720 pass, 0 fail (inclui 18 testes novos de retenção, CA1 a CA6 e a decisão). `eslint` e `tsc --noEmit` limpos.
- `deploy/staging-refresh/prune-source.sql` ganhou a política das duas tabelas novas (`keep`), exigida pelo contrato da spec 291.
- ⚠️ Os testes de integração contra Postgres (`bun run test:integration`) não rodaram aqui (sem Docker); ficam a cargo da CI do PR.
