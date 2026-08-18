# Feature 041 — Cada configuração perto do efeito que ela tem

> Nasce de uma observação do operador sobre a tela de configurações da empresa: _"ficou muito grande
> e tem configs que não deveriam ficar lá"_. A 041 fecha a segunda metade dessa frase; a primeira já
> foi resolvida pelas abas (commit `1b08877`).

## Problema

`/configuracoes` acumulou nove painéis porque foi o lugar barato de pendurar cada configuração nova.
As abas cortaram o custo de abrir a tela — de nove consultas para duas — mas não corrigiram o
endereço: quatro painéis continuam morando longe do efeito que produzem.

**Preços de combustível.** O número existe para uma coisa só: entrar no R$/km do veículo, que é
derivado desde a 038 (`fleet/domain/vehicle-cost.policy.ts`). O operador vê o R$/km em Frota e ajusta
o preço três telas adiante, sem nada na tela de origem dizendo de onde o valor veio.

**Cursor de distribuição (`ultNSU`).** É controle de operação, quase depuração: quem mexe no ponteiro
da SEFAZ está olhando a aba de importações vendo nota não chegar. A tela que explica **por que**
alguém mexeria nele é outra.

**Busca automática de notas.** O opt-in é política da empresa, mas hoje o **mesmo estado** aparece em
dois lugares — `GET /company-settings/scheduled-distribution` e o campo `scheduled` de
`GET /nfe-imports/distribution`, cuja paridade é contrato
(`test/companies/scheduled-distribution-parity.contract.ts`). Duplicar leitura é barato; duplicar o
**controle** faz o operador não saber qual dos dois manda.

**Credencial e perfis de emissão de NFS-e.** Existe módulo NFS-e no menu, com tela própria. Credencial
de provedor e perfil de emissão são configuração daquele domínio; estão em Empresa por terem nascido
junto com a spec da NFS-e, não por pertencerem à empresa. É o maior bloco fora do formulário — o
`NfseProfileFields` sozinho tem doze campos.

Sobra em Empresa o que é de fato da empresa: perfil e CNPJ, logo, certificados digitais, série,
numeração e ambiente de CT-e, defaults de MDF-e e de faturamento.

## Objetivo

Mover quatro painéis para o módulo cujo trabalho eles configuram, cada um numa aba do destino, sem
mudar uma linha de API: as rotas continuam em `/company-settings/*` sob `settings.manage`.

## Fora do escopo

- **Mudar rota, corpo ou permissão da API.** Isto é mudança de endereço na tela. `settings.manage`
  continua sendo a permissão dos quatro painéis, e nenhuma rota muda de caminho.
- **Novo item de menu.** Nenhum módulo nasce; os quatro painéis entram como aba de módulo existente.
- **Unificar preço de combustível com custo de viagem.** Pedágio e diária de motorista continuam fora
  da frota, como a 038 decidiu.
- **Tela de histórico de preço da ANP.** Segue valendo o recorte da 038: última semana publicada.
- **Persistir a aba na URL.** O produto não tem router (`main.tsx` navega por `pushState` manual) e
  nenhuma das tabelas guarda aba em query param hoje. Aba em endereço é outra feature, e vale para
  todas as telas de uma vez, não só para estas.

## Decisões tomadas

**O controle da busca automática vai para a aba Remota, e some de Empresa.** A leitura já está lá; o
que estava duplicado era o botão. Empresa deixa de ter o painel — não fica um espelho somente-leitura,
que seria a mesma dúvida com outra roupa.

**Cada painel entra como aba do destino, não solto no meio da tela existente.** Frota e NF-e já são
telas com tabela grande; empurrar um formulário de configuração para o topo delas trocaria uma tela
inchada por duas.

**Frota e NF-e passam a hospedar painel de `settings.manage`.** Hoje elas exigem só a permissão do
próprio módulo, e a tela inteira de Empresa estava atrás de `settings.manage`. No destino a aba tem de
**sumir** para quem não tem a permissão — não aparecer desabilitada, não aparecer vazia. Quem enxerga
a frota não é necessariamente quem pode mexer no preço que forma o frete.

## Histórias priorizadas

### P1 — O operador ajusta o preço do combustível onde ele vê o R$/km

**Given** um operador com `settings.manage` na tela de Frota **When** ele abre a aba **Combustível**
**Then** vê o preço vigente por produto, a origem (ANP ou ajuste da empresa) e a data da referência,
e pode ajustar ou limpar o ajuste sem sair do módulo — e o R$/km da aba Veículos passa a refletir o
valor novo.

**Given** um operador **sem** `settings.manage` **When** ele abre a tela de Frota **Then** a aba
Combustível **não existe** na lista de abas, e nenhuma consulta de preço é disparada.

### P1 — O ponteiro da SEFAZ fica junto do que ele explica

**Given** a aba Remota de NF-e mostrando que nada chegou na última busca **When** o operador precisa
reposicionar o `ultNSU` **Then** o ajuste está na própria aba, com o valor corrente e o último
resultado à vista — sem trocar de tela e sem perder o contexto que motivou o ajuste.

### P1 — A busca automática tem um dono só

**Given** a busca automática ligada **When** o operador procura onde desligá-la **Then** encontra o
controle **na aba Remota**, junto do estado que ele já lia ali, e **não encontra um segundo botão**
em Empresa.

### P1 — A configuração de NFS-e mora no módulo de NFS-e

**Given** um operador com `settings.manage` na tela de NFS-e **When** ele abre a aba **Configuração**
**Then** encontra a credencial do provedor e os perfis de emissão, com os campos **preenchidos pelo
que já está gravado**, e a emissão que ele acabou de configurar está a uma aba de distância.

### P2 — Empresa volta a caber numa olhada

**Given** a tela de configurações da empresa **When** o operador a abre **Then** vê duas abas —
Empresa e Certificados — e nada que pertença a outro módulo.

## Critérios de aceite

- Nenhum dos quatro painéis é renderizado por `CompanySettings.page.tsx`; nenhum deles é renderizado
  em mais de um módulo.
- Cada aba nova some por completo quando falta `settings.manage`, e nenhuma consulta dela sobe.
- Campo com cadastro gravado abre preenchido no destino — a regra de escopo por aba criada em
  `companySettingsTabs.service.ts` acompanha o painel para o módulo de destino.
- Nenhuma rota, corpo ou permissão de API muda; os contratos de API existentes seguem verdes sem
  edição.
- `test/companies/scheduled-distribution-parity.contract.ts` continua verde: a paridade de leitura é
  o que permite o controle morar num lugar só.
