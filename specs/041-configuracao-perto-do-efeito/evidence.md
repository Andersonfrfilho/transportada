# 041 — Evidência

Uma seção por task, com o comando rodado e a saída colada. Task sem evidência aqui não está
concluída.

## Estado inicial (medido em 17/08/2026, antes da T001)

A tela de configurações já é por abas (commit `1b08877`) — a 041 trata do **endereço** dos painéis,
não do tamanho da página.

```
$ wc -l apps/frontend-transportada/src/modules/company-settings/**/*.{ts,tsx}
   5646 total   (47 arquivos)
```

Painéis hospedados hoje por `company-settings`, e o módulo que a 041 dá a cada um:

| Painel                                        | Hoje               | Destino         |
| --------------------------------------------- | ------------------ | --------------- |
| `settingsForm`, `logo`                        | aba Empresa        | fica            |
| `certificates`                                | aba Certificados   | fica            |
| `scheduledDistribution`, `distributionCursor` | aba Busca de notas | `nfe-workspace` |
| `fuelPrices`                                  | aba Combustível    | `fleet`         |
| `nfseCredential`, `nfseProfiles`              | aba NFS-e          | `nfse-invoice`  |

Consultas na abertura da tela, depois das abas: **2** (era 9).

## T003 — contrato da aba Combustível (vermelho)

`test/fleet/fuel-tab.contract.ts`, registrado em `test/fleet.contract.test.ts`.

```
$ bun test test/fleet.contract.test.ts
 95 pass
 7 fail
```

As sete falhas são as sete asserções da aba nova: o painel ainda morava em `company-settings`, o
registro ainda dava `module: 'company-settings'` ao `fuelPrices`, e `fleet.locale.json` não tinha
`tabs.fuel`.

## T004/T005 — o preço do combustível mora na frota

`git mv` do painel e do hook para `fleet/`, aba Combustível montada só com `settings.manage`,
rótulos acentuados nos dois pacotes de tradução de `fleet`, e o par removido de `company-settings`
(painel, hook, seção de props, chaves de tradução e a aba `fuel` do serviço). A metade de
apresentação do contrato antigo virou `test/fleet/fuel-price-panel.contract.ts`; a metade de cliente
ficou em `test/company-settings/fuel-prices.contract.ts`, onde o cliente HTTP continua morando.

```
$ bun run typecheck
$ bun run test
 1298 pass
 0 fail
$ bun run lint
$ bun run build
precache  12 entries (1399.18 KiB)
```

## T006 — contrato vermelho da aba de configuração de NFS-e

`test/nfse-invoice/settings-tab.contract.ts`, registrado no entrypoint `test/nfse-invoice.contract.test.ts`.

```
$ bun test test/nfse-invoice.contract.test.ts
 192 pass
 7 fail
```

Os sete cobrem: endereço dos dois painéis no registro, escopo da consulta por aba, painéis e hook
morando em `nfse-invoice`, aba ausente sem `settings.manage`, `enabled` composto, **prefill pelos
dois motivos** (a chave que remonta o painel da credencial quando a consulta responde, e os perfis
vindos direto da consulta) e os rótulos no pacote de tradução de NFS-e.

## T007/T008 — a configuração de NFS-e mora na tela de NFS-e

`git mv` dos dois painéis, de `NfseProfileFields` e do hook para `nfse-invoice/`; a tela de notas
ganhou `Tabs` (`Notas`, `Configuração`), com a aba de configuração entrando na lista só com
`settings.manage` e a aba de notas só com `nfse.read` — aba que a permissão não abre não fica
selecionada. As 68 chaves `nfse*` saíram do pacote `companySettings` para o `nfseInvoice`, e a aba
`nfse` saiu do serviço de abas. Módulo de estilo próprio (`nfseSettings.module.css`) porque
`fieldGrid` e `primaryAction` já existiam em `nfseInvoice.module.css` com a forma da barra de
filtros. O contrato de apresentação antigo virou `test/nfse-invoice/nfse-settings.contract.ts`.

```
$ bun run typecheck
$ bun run test
 1306 pass
 0 fail
$ bun run lint
$ bun run build
precache  12 entries (1403.00 KiB)
```
