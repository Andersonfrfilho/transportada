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

## T009 — contrato vermelho da busca automática na tela de notas

`test/nfe-workspace/distribution-settings.contract.ts` (7 testes) exige o endereço dos dois painéis
em `nfe-workspace/imports`, o escopo de consulta ligado só naquela aba, os painéis e hooks morando
no módulo de notas, o `enabled` composto (permissão E aba), o atalho de configurações fora do painel
somente-leitura, e os rótulos no pacote `nfeWorkspace`.

```
$ bun test test/nfe-workspace.contract.test.ts
 143 pass
 7 fail
```

## T010/T011/T012 — a busca automática passa a morar na aba Remota

`git mv` de `ScheduledDistributionPanel`, `DistributionCursorPanel`, dos dois hooks e de
`scheduledDistribution.constant.ts` para `nfe-workspace/`; as 41 chaves `scheduledDistribution*` e
`distributionCursor*` saíram do pacote `companySettings` para o `nfeWorkspace`, e o cartão
somente-leitura perdeu o `ns: 'companySettings'`. Na aba Remota, quem tem `settings.manage` vê os
dois painéis de configuração; quem não tem continua vendo o cartão somente-leitura — a aba é
informação de operação, não de configuração. Sem a permissão nenhuma das duas consultas sobe.

O atalho para as configurações de empresa foi retirado com o painel: `companySettingsNavigation.service.ts`
e as duas chaves `scheduled.settings*` deixaram de existir, porque a tela de destino não hospeda mais
o controle. `COMPANY_SETTINGS_TAB_IDS` perdeu a aba `distribution`.

```
$ bun run typecheck
$ bun run test
 1311 pass
 0 fail
$ bun run lint
$ bun run build
precache  12 entries (1404.50 KiB)
$ bun run --cwd apps/api-transportada test test/companies.contract.test.ts   # T012, sem edição
 100 pass
 0 fail
```

## T013 — a tela de configurações fica com Empresa e Certificados

`CompanySettings.page.tsx` perdeu os dois painéis movidos, os dois hooks, os dois tipos, as duas
seções, os dois campos de `SettingsBodyProps`, o `DistributionTabPanel` e a derivação de escopo por
aba — com uma fonte de dados só no módulo, `resolveCompanySettingsDataScope` deixou de ser lido pela
página, e `renderTabPanel` cai em `CertificateUploadForm`. A chave órfã `tabs.distribution` saiu dos
dois pacotes de tradução de `companySettings`.

## T014 — gate completo e conferência responsiva

```
$ make check
apps/api-transportada      2551 pass   0 fail
apps/worker-transportada    466 pass   0 fail
apps/cron-transportada      183 pass   0 fail
apps/frontend-transportada 1311 pass   0 fail
raiz                         16 pass   0 fail
format:check · lint · typecheck · build   sem erro
```

Responsivo conferido por CSS nas quatro telas tocadas (375px, 768px, 1280px), já que a app não tem
DOM de teste:

- Barra de abas de configurações — `components/ui/tabs.module.css` `.list` já é
  `display: flex; flex-wrap: wrap`: com duas abas ela nunca estoura a linha em 375px.
- Barra de abas das notas — `.tabBar` era `flex` sem quebra, e é ela que hospeda a aba Remota com o
  bloco novo; ganhou `flex-wrap: wrap` para as três abas caírem para a segunda linha em vez de
  empurrarem a página para o lado.
- Bloco de configuração da busca automática — `distributionSettings.module.css` é `display: grid`
  de uma coluna, com `min-width: 0` no campo e `flex-wrap: wrap` na fileira de ações: sem largura
  fixa, ele acompanha o container em qualquer largura.
- Nenhuma das telas tocadas declara largura própria — todas seguem `var(--layout-width)`, contrato
  de `test/design-system/layout-width.contract.ts`.

## T015 — `CLAUDE.md` atualizado

```
$ git diff --stat CLAUDE.md
```

O parágrafo de "Busca automática de notas" passou a apontar para a aba Remota, e o bloco novo
"Configuração perto do efeito" na seção do frontend descreve o registro de endereços, o `enabled`
composto (permissão **e** aba aberta) que faz o campo vir preenchido, e o destino dos quatro painéis
movidos — combustível em `fleet`, credencial e perfis em `nfse-invoice`, opt-in e cursor em
`nfe-workspace`, com `company-settings` reduzida a Empresa e Certificados.
