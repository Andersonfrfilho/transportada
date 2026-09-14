## cron-transportada

Histórico completo e narrativas (Nota RP, NFS-e, medições em produção): `docs/ai-context/cron-transportada.md`.

Processo **one-shot**: um CronJob sobe `src/main.ts` a cada janela, ele roda um ciclo e sai — não há
loop nem agendador embutido. Sai com código 1 só quando alguma empresa falhou; não pegar o advisory
lock é no-op limpo. A conexão Postgres é pinada em **um socket** (`max: 1`) para o lock de sessão
valer por todas as transações do ciclo.

O processo é **uma batida só** (`src/tick/tick.job.ts`), agendada a cada cinco minutos: pega o
advisory lock, lê `job_schedules`, publica em `job-run.v1` cada rotina com `next_run_at <= now()` e
avança a janela dela. `CRON_JOB` e `src/job-registry.ts` **não existem mais** — quem escolhe a rotina
é o relógio no banco, não a variável do painel de hospedagem (spec 052).

A rotina que ainda vive aqui:

- `nfe.distribution.pull` — seleciona as empresas elegíveis e enfileira uma importação
  `source: 'distribution'`, `triggeredBy: 'automation'` na `processing_outbox`, reusando o relay e o
  consumidor de distribuição que já existiam.

As outras três rotinas (NFS-e, notificação, combustível) migraram para o worker; a fatia que sobrou
aqui é só `nfe.distribution.pull`, até ela também migrar.

Do cron restou **uma** obrigação de configuração, e ela é dura: o endereço do broker
(`RABBITMQ_URL`, `QUEUE_PREFIX`) é **sempre** obrigatório — a batida sempre publica.

## Invariantes que valem antes de editar

- `nfe-distribution-pull/domain/distribution-eligibility.policy.ts` é **cópia** de
  `api-transportada/src/companies/domain/distribution-eligibility.policy.ts` — mesma regra, mesmo
  vocabulário de razões. Mudou a regra de um lado? mude do outro;
  `test/companies/scheduled-distribution-parity.contract.ts` guarda a paridade.
- O catálogo `FUEL_TYPES` (unidade por produto: `gnv` em `cubic-metre`, os outros em `litre`) é
  **cópia por valor** em três apps: `api-transportada`, `frontend-transportada` e
  `worker-transportada`. Mudou produto ou unidade? mude nas três — contratos de paridade cobrem
  cada cópia. Detalhe: docs/ai-context § "catálogo FUEL_TYPES".
- A Nota RP (NFS-e) tem particularidades duras de fronteira — dois cabeçalhos de auth, callback
  assíncrono, envelope JSON no XML/PDF, alíquota em percentual no fio, endereço obrigatório do
  tomador — todas hoje vivem na lógica do **worker** (`nfse.status.pull`), não mais aqui. Antes de
  tocar em qualquer coisa relacionada a Nota RP/NFS-e, leia
  `docs/ai-context/cron-transportada.md` § "A Nota RP" e o núcleo de `worker-transportada`.
