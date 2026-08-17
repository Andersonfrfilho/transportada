# 040 — evidências

Preenchido por task, com a saída real dos gates. Sem token, sem PII.

## T003 — contrato vermelho dos cabeçalhos

`nota-rp-v2-client.contract.test.ts` (worker) e `nota-rp-parity.contract.ts` (cron) passaram a
exigir `X-AUTH-USER-TOKEN` + `X-AUTH-IM` e a ausência de `authorization`. Novo arquivo
`test/nota-rp-v2/no-bearer.contract.ts`: varredura de fonte sobre **os dois** clientes — um `Bearer`
acrescentado "por garantia" ao lado dos cabeçalhos certos passaria em todo teste de comportamento,
porque o dublê de `fetch` só vê o que o cliente monta hoje.

Achado do caminho: o contrato do worker **fixava o defeito** —
`expect(call.headers['authorization']).toBe(\`Bearer ${'${API_TOKEN}'}\`)`. Era por isso que ele
sobreviveu.

Vermelho: 7 falhas (4 delas na varredura de fonte).

## T004 — os dois clientes, na mesma task

`buildHeaders` nos dois clientes manda `X-AUTH-USER-TOKEN` (token da conta) e `X-AUTH-IM`
(inscrição municipal, qual empresa dentro da conta). `authorization` saiu.

A inscrição municipal não era lida por ninguém; foi encadeada da linha da credencial até o cliente
nas duas apps: `NfseCredentialAccess` (worker) e `NfseReconciliationCredential` (cron), os dois
repositórios Drizzle, o `select-due-invoices.use-case.ts` e a cópia do schema no cron
(`nfse_provider_credentials`, não `nfse_issuance_attempts` — o erro foi pego pelo `tsc`).

```
apps/worker-transportada  typecheck ok · 455 pass · 0 fail (59 arquivos)
apps/cron-transportada    typecheck ok · 182 pass · 0 fail (8 arquivos)
bun run lint              4 apps, 0 aviso
```

A coluna já existe no schema da API com `.default('')` — é a T006 que tira o default e a torna
obrigatória.
