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
