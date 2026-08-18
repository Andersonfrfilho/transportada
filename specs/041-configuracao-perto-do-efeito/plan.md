# 041 — Plano

## Forma da mudança

É mudança de **frontend apenas**. Nenhuma app de backend é tocada: as rotas de
`/company-settings/scheduled-distribution`, `/company-settings/distribution-cursor`,
`/company-settings/fuel-prices` e as de NFS-e continuam onde estão, com `settings.manage`.

O que se move é o par **painel + hook**, junto:

| Painel                                             | Hook                       | De                 | Para                             |
| -------------------------------------------------- | -------------------------- | ------------------ | -------------------------------- |
| `ScheduledDistributionPanel`                       | `useScheduledDistribution` | `company-settings` | `nfe-workspace`, aba Remota      |
| `DistributionCursorPanel`                          | `useDistributionCursor`    | `company-settings` | `nfe-workspace`, aba Remota      |
| `FuelPricePanel`                                   | `useFuelPrices`            | `company-settings` | `fleet`, aba Combustível         |
| `NfseCredentialPanel` + `NfseEmissionProfilePanel` | `useNfseSettings`          | `company-settings` | `nfse-invoice`, aba Configuração |

O cliente HTTP continua sendo o de `company-settings` — é ele que fala com `/company-settings/*`, e
um client por módulo é a regra, não um client por tela. Módulo de destino importa o cliente do módulo
de origem pelo `shared/`, como `company-settings` já importa `freightClient.service` hoje.

## Ordem

1. **Combustível → Frota.** O menor: um painel, um hook, uma consulta, e o destino já tem abas
   (`FleetWorkspace.page.tsx`, `vehicles`/`drivers`). Serve de forma para os outros três.
2. **NFS-e → módulo NFS-e.** O maior em campos, mas o mais isolado: `NfseInvoiceWorkspacePage` ainda
   não tem abas, então ganha `Tabs` com `invoices` e `settings`.
3. **Cursor + busca automática → aba Remota.** O mais delicado: é onde o controle duplicado morre, e
   onde a permissão de dois módulos se cruza na mesma aba (`nfe.read` para ver, `settings.manage` para
   mexer).
4. **Empresa fica com duas abas.** Limpeza final de `CompanySettings.page.tsx` e do serviço de abas.

Cada passo é um commit, com a app inteira verde antes do seguinte.

## Permissão nas abas novas

Hoje `settings.manage` guarda uma tela inteira; passa a guardar **uma aba dentro de uma tela de outra
permissão**. O padrão para os três destinos:

- a aba é montada na lista **só** quando `permissions.includes('settings.manage')`;
- o hook da aba continua recebendo `enabled` — permissão **e** aba aberta, como a 041 herda do
  `resolveCompanySettingsDataScope`;
- aba ausente não é aba desabilitada: quem não pode não vê que existe.

## Escopo de dados

O serviço `companySettingsTabs.service.ts` fica em `company-settings`, mas passa a descrever **onde
cada painel mora**, não só qual aba o hospeda. Alternativa considerada e recusada: cada módulo de
destino escrever o seu próprio escopo. Recusada porque a garantia que interessa — "todo painel tem
exatamente um endereço, e esse endereço liga a consulta que o alimenta" — só é assertável de um lugar
que enxergue os quatro módulos ao mesmo tempo.

## Risco: campo abrindo vazio sobre cadastro existente

É o risco central da feature, e já mordeu antes (o `key` do `NfseCredentialPanel` existe por causa
disso). Painel que copia o gravado para um rascunho na montagem tem de remontar quando o dado chega —
a mudança de módulo troca **quando** ele monta, então o `key` viaja junto com o painel e o contrato de
prefill do destino é escrito antes da mudança.

## Risco: a aba Remota com duas permissões

Alguém com `nfe.read` e sem `settings.manage` continua vendo a aba Remota — ela é dele. O que ele não
vê é o bloco de configuração dentro dela. Isso é diferente das outras duas abas, que somem inteiras, e
é por isso que a Remota é o terceiro passo e não o primeiro.

## Fora do caminho

Nenhuma migration, nenhum envelope de fila, nenhuma mudança de contrato de API. Se algum passo pedir
qualquer uma das três, o passo está errado: pare e reveja o recorte.
