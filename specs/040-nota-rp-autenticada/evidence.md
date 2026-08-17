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

## T012 — contrato vermelho do corpo do `/emitir`

`test/nfse-fiscal-gateway.contract.ts` passou a fixar o corpo oficial: presença de `CodigoCnae`,
`RazaoSocial`, `CpfCnpj`, `DataEmissao` em `dd/mm/aaaa`, `CallbackUrl`, `IssRetido` booleano e
`ItemListaServico` sem ponto; ausência de `Cnae`, `TomadorRazaoSocial`, `TomadorCnpjCpf` e
`ValorIss`.

Vermelho nas oito chaves de uma vez — o `buildRps` anterior errava nome, tipo e formato ao mesmo
tempo, e nenhum teste olhava para o corpo montado.

## T013 — `buildRps` contra o contrato oficial

O relógio entra injetado e a data é formatada em `America/Sao_Paulo` por `Intl.DateTimeFormat`: o
payload congelado não carrega data, e a prefeitura valida a emissão contra a competência corrente —
UTC viraria o dia às 21h e recusaria a nota da noite.

`ItemListaServico` sai por `toServiceListItemCode`: tira o que não é dígito e derruba o zero à
esquerda, porque o id da lista é `1602`, não `16.02`.

## T014 — contrato vermelho da resposta do `/emitir`

O envelope de sucesso é `{success:true, message, id_nota: 30201}` — `id_nota` **numérico e no topo**,
sem `data` em volta. Exigir `data` era o que transformava emissão aceita em `malformed_response`.

A recusa da v2 é `{success:false, message}` e nada mais: código de erro só existe no postback, dentro
de `MensagemRetorno[].Codigo`. O contrato passou a exigir a `message` do provedor com
`NOTA_RP_UNKNOWN` no lugar do código, e o `failureBody` do fixture perdeu o parâmetro `code` que a v2
nunca manda.

## T015 — `readEnvelope`/`issue` acertados

`readEnvelope` devolve o envelope inteiro (não mais o `data` de dentro), `readIdentifier` aceita
inteiro seguro e o converte, e `fetchStatus` — que **tem** `data` — passou a desembrulhar por conta
própria. Recusa sempre sai com `UNKNOWN_REJECTION_CODE`.

De passagem, o cabeçalho do arquivo dizia o oposto do que a A2 estabeleceu ("o vocabulário de fio é
inferido, a coleção oficial não está no repositório") e apontava para um T030 que a coleção
dispensou. Reescrito: o envelope agora é conferido, e o que segue inferido é só `situacao`/`codigo_erro`
da consulta, que nenhum exemplo da coleção cobre.

```
apps/worker-transportada  typecheck ok · 463 pass · 0 fail (59 arquivos)
apps/cron-transportada    typecheck ok · 182 pass · 0 fail (8 arquivos)
```
