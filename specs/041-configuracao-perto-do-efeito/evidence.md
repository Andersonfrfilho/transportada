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
