# 039 — NFS-e com um ambiente só

## Problema

O trilho de NFS-e nunca rodou. Não é uma pendência de deploy: `NFSE_PROVIDER_BASE_URL_HOMOLOGATION` e
`NFSE_PROVIDER_BASE_URL_PRODUCTION` estão vazias no `worker` e no `cron-nfse`, nos dois ambientes, e o
schema recusa o boot sem elas. Enquanto isso o operador continua somando as notas à mão no portal — o
problema que a ADR-0029 se propôs a resolver.

Procurando os valores, descobriu-se que eles não existem. A Nota RP publica **um** servidor
(`https://www.notarp.com.br`, "Servidor de Produção"); a coleção da v2, que é a versão que este
produto usa, declara `baseUrl = https://www.notarp.com.br/api/v2`, valor único; e nenhuma das duas
fontes menciona sandbox ou homologação. O que a v2 parametriza como separação é token e inscrição
municipal, não endereço. Esta instalação tem um cadastro só.

O par de variáveis, portanto, exige uma distinção que o provedor não faz. Preenchê-lo com o mesmo host
dos dois lados destravaria o deploy hoje e faria `staging` — que roda com
`FISCAL_ENVIRONMENT=homologation` — falar com a Nota RP real, com a credencial real. O schema
atestaria um isolamento inexistente.

## Objetivo

1. O trilho de NFS-e sobe e roda, em produção.
2. A configuração do endereço diz a verdade sobre o provedor: **uma** variável.
3. `staging` fica sem NFS-e por decisão declarada, não por variável esquecida.
4. Nenhum caminho consegue apontar um ambiente não-produtivo para a Nota RP real por engano.

## Decisões

Detalhamento e alternativas rejeitadas em **ADR-0035**, que emenda a **ADR-0029**.

**Um endereço só.** `NFSE_PROVIDER_BASE_URL` substitui o par. Continua vindo do ambiente, nunca
cravado em código.

**`FISCAL_ENVIRONMENT` para de escolher endereço de NFS-e.** Ele permanece e continua selecionando
ambiente de CT-e e MDF-e, onde a SEFAZ mantém homologação de verdade.

**A NFS-e é trilho de produção.** `cron-nfse` não sobe fora de produção e o passo dele no `deploy.yml`
passa a ser condicionado a produção.

**Falha no boot continua sendo a resposta.** Some o ramo de meia-configuração, que fica inalcançável
com uma variável só; a exigência do valor permanece.

## Fora de escopo

- Emitir a primeira nota. Isto é configuração e schema; a emissão é operação, e a ADR-0035 registra
  que ela será uma nota única conferida no portal antes de qualquer volume.
- O teto de `Discriminacao`. Continua 2000 (ABRASF) até haver medida com credencial real.
- Qualquer mudança no selo da credencial, no AAD ou no que sai em log.

## Critérios de aceite

1. `parseCronEnvironment` com `CRON_JOB=nfse.status.pull` e `NFSE_PROVIDER_BASE_URL` declarada resolve
   o bloco de NFS-e; sem ela, lança `CronConfigurationError`.
2. O mesmo, no schema equivalente do `worker`.
3. Nenhum dos dois lê `NFSE_PROVIDER_BASE_URL_HOMOLOGATION` ou `_PRODUCTION` — um teste falha se os
   nomes reaparecerem no código.
4. O job de NFS-e resolve o endereço sem consultar `FISCAL_ENVIRONMENT`; mudar o valor de
   `FISCAL_ENVIRONMENT` não muda o endereço resolvido.
5. `nota-rp-parity.contract.ts` continua verde: a tradução de resposta e de causas de falha não muda.
6. O `deploy.yml` publica `cron-nfse` em produção e não em staging, e o YAML valida.
7. `.env.example` declara `NFSE_PROVIDER_BASE_URL` e não declara mais o par.

## Riscos

**O primeiro exercício do trilho é contra nota real.** É consequência aceita, não efeito colateral: a
ADR-0035 registra o porquê e a mitigação. Quem executar a primeira emissão precisa saber disso antes,
e é por isso que está escrito aqui e não só na ADR.

**As cópias de schema.** O `worker` e o `cron` carregam cópias por valor documentadas no `CLAUDE.md`.
Mudar um lado e esquecer o outro produz um deploy que sobe e outro que não — e o que não sobe é o que
emite. As duas mudanças são uma task só.
