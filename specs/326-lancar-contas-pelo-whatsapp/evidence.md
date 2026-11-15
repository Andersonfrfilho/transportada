# Evidência — 326

## T1 a T4 (2026-11-15)

- Contrato novo: `apps/api-transportada/test/whatsapp-commands/expense-flow-actions.contract.ts` (política de valor, data e dia; opção do menu presa a `expenses.manage`; passo a passo fixa e variável; categoria de motorista recusada; papel `driver`/`aggregate`/`helper` recusado; cancelar; corrigir; falha ao gravar).
- `bun run test` na API: 15455 pass, 35 skip, 0 fail. `tsc --noEmit` e `eslint` limpos nos arquivos tocados.
- A trilha de auditoria da conta ganhou `channel` (`panel` por padrão, `whatsapp` aqui).

## T5

Pendente: o grafo publicado em staging precisa ser republicado (runbook § 5.3) para a opção "💰 Lançar conta" aparecer.
