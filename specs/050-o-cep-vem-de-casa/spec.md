# 050 — O CEP vem de casa

O CEP passa a ser consultado **primeiro no nosso banco e só depois na BrasilAPI**, e a consulta sai
do navegador para a nossa API.

## Por que

Hoje o formulário do motorista pergunta o CEP direto para BrasilAPI e ViaCEP, do navegador
(`fleet/shared/driverAddress.service.ts`), e os campos de CEP de **Empresa** e da **lotação do
MDF-e** não perguntam a ninguém — ficam digitáveis. Três consequências que esta spec fecha:

- Endereço que já está no nosso banco é buscado fora de casa de novo, a cada cadastro.
- O CEP do cadastro sai do navegador do operador para dois terceiros sem contrato — achado datado
  em `docs/SECURITY.md`, com ADR pendente entre proxy na API e allowlist declarada. Trazer a
  consulta para a API **resolve o achado na direção do proxy** para o CEP.
- O mesmo dado tem três comportamentos em três telas.

⚠️ Esta spec **não** foi aberta por defeito no fluxo atual. O caminho de hoje foi medido em
21/08/2026 e está sadio: CORS liberado (`*`) nos dois provedores, chaves da BrasilAPI v2 batendo com
o que o parser lê, `required()` nos dois braços do `Promise.any`, CSP liberando as duas origens, e
`lookupPostalCode` devolvendo endereço contra os provedores no ar. O que parecia falha é
comportamento do dado: **CEP de cidade inteira não tem logradouro** — `14790000` (Guaíra/SP) volta
`{city, state}` com `street` e `district` vazios, e como sugestão parcial não apaga o que já está
digitado, só Cidade e UF preenchem.

## Fonte local: toda coluna de CEP do banco, por empresa

O critério de entrada é **"esta tabela consegue responder algo a partir de um CEP"** — não "esta
tabela guarda endereço completo". A varredura de `src/database/*.schema.ts` (21/08/2026) achou
**cinco** colunas de CEP, em quatro tabelas:

| Origem                                 | Colunas que o CEP traz                              | Por quê entra                                           |
| -------------------------------------- | --------------------------------------------------- | ------------------------------------------------------- |
| `nfe_addresses`                        | `street · district · city · state · city_code`      | a mais rica; cresce a cada nota importada               |
| `fleet_drivers`                        | `street · district · city · state`                  | preenchida pelo próprio formulário que consulta         |
| `company_fiscal_profiles`              | `street · district · city · state · city_ibge_code` | endereço do emitente, `notNull` — sempre completo       |
| `mdfe_manifests.loading_postal_code`   | `origin_state`                                      | **parcial**: só a UF, e ela é a UF daquele carregamento |
| `mdfe_manifests.discharge_postal_code` | `destination_state`                                 | **parcial**: só a UF do descarregamento                 |

O MDF-e **entra**, ao contrário do que esta spec dizia antes. Ele não tem logradouro, mas responde a
UF de um CEP — e "sem logradouro" não é o mesmo que "não responde nada". O que ele muda é o desenho:
resposta parcial **não encerra a busca**, ela é guardada e a escada continua (ver "Ordem da
consulta").

Exclusões declaradas, com o motivo — para não serem redescobertas como esquecimento:

- `mdfe_manifest_loading_cities`, `mdfe_manifest_items.discharge_city_*`, `freight_region_cities` e
  `fuel_price_references`: **não têm coluna de CEP**. Não há como consultá-las por CEP; ficar de fora
  é aritmética, não decisão.
- Payloads congelados em `jsonb` (`cte_issuance_payloads`, os do MDF-e e da NFS-e): o endereço ali é
  **cópia** do que `nfe_addresses` e `company_fiscal_profiles` já respondem, não há índice, e varrer
  `jsonb` por CEP a cada consulta é table scan. Cobertura zero a mais, custo real.
- `fleet_vehicles.state` é a UF da placa, não endereço.
- A NFS-e **não tem tabela de endereço própria** — o endereço do tomador vem de `nfe_addresses`, já
  coberto (verificado: `nfse.schema.ts` não declara `street` nem `district`).

⚠️ **Nenhuma das quatro tabelas tem índice por CEP hoje.** `nfe_addresses` só tem a FK do
participante. Sem `(company_id, postal_code)` a consulta local vira varredura na tabela que mais
cresce do produto — o índice é parte da feature, não afinação posterior.

**A consulta filtra por `companyId`, sempre.** As quatro tabelas são multiempresa, e cruzar empresas
para responder um CEP seria vazamento entre tenants — proibido, não otimizável. Consequência de
produto que fica escrita: instalação nova não acha nada localmente e vai à BrasilAPI em todo CEP; a
fonte local **se aquece com o uso** (nota importada, motorista salvo), sem job nenhum.

**A resposta nunca leva `number` nem `complement`.** Nessas tabelas o número é a casa de uma pessoa
ou de uma empresa: devolvê-lo num autocompletar de CEP diria a quem digita **quem mora naquele
CEP**. O CEP responde logradouro, bairro, cidade e UF — nada mais. (A busca textual pelo Photon
continua trazendo `housenumber`; é outro fluxo, e está fora desta spec.)

**Desempate é determinístico:** entre linhas do mesmo CEP, ganha a que tem `street` preenchido e,
entre essas, a mais recente — a grafia corrigida depois é a que vale. Sem regra explícita, duas
importações da mesma rua com grafias diferentes fariam a tela responder de um jeito hoje e de outro
amanhã.

## Ordem da consulta

1. **Nosso banco** — as cinco origens consultadas **em paralelo, em corrida**: uma `Promise` por
   origem, e a primeira que devolver endereço **completo** (logradouro, cidade e UF) vence; as outras
   são abandonadas. Não é um `UNION ALL`: cinco consultas pequenas e independentes respondem no tempo
   da mais rápida, e a mais rica (`nfe_addresses`, a maior tabela) não impõe o ritmo às outras.
2. **BrasilAPI** (`/api/cep/v2/{cep}`) — só quando a corrida não deu resposta completa.
3. **ViaCEP** (`/ws/{cep}/json/`) — último recurso. "Depois utilize a api-brasil" não proíbe um
   terceiro degrau, e provedor fora do ar deve custar um endereço, não o cadastro.
4. **Nada respondeu** — a API devolve `404` e **o operador digita**. Nenhum campo é bloqueado,
   travado nem limpo: a busca é conveniência, e cadastro não para porque um CEP não foi achado.

Duas consequências do desenho, que ficam escritas porque são fáceis de reintroduzir errado:

- **Resposta parcial não vence a corrida.** O MDF-e responde só a UF; se ela ganhasse, a escada
  pararia com o logradouro vazio e a BrasilAPI nunca seria consultada. O parcial é guardado e só é
  usado se **nada mais** responder — melhor a UF certa que campo em branco.
- **Corrida entre origens troca determinismo por latência**, e isso é deliberado: duas tabelas com
  grafias diferentes do mesmo CEP podem responder diferente entre chamadas. O desempate determinístico
  continua valendo **dentro** de cada origem (`street` preenchido ganha, depois a linha mais recente),
  que é onde as duas importações da mesma rua colidem de fato.

Os degraus 2 e 3 deixam de ser corrida (`Promise.any`) entre si e passam a ser **sequência**: com a
fonte local na frente, correr dois provedores externos virou chamada externa desnecessária.

## Rota

`GET /postal-codes/{cep}` — `200` com a sugestão, `404` quando nenhum degrau soube responder.

A política de rota desta API é **uma** permissão (`permission` + `scope: 'company'`), e os três
formulários que vão consumir a rota vivem sob permissões diferentes (`fleet.manage`,
`settings.manage`, `mdfe.manage`). Então entra **`addresses.read`**, concedida a `company-admin`,
`fiscal` e `operator` — exatamente os papéis que já escrevem endereço em alguma das três telas.
Escolher uma das três permissões existentes faria a tela de Empresa dar 403 para quem administra
configuração sem cuidar de frota; conceder aos sete daria capacidade nova a `driver` e `aggregate`,
que não têm formulário de endereço nenhum.

O CEP vai no caminho da URL. CEP isolado não é dado pessoal — identifica região postal, não pessoa —
e nenhum outro campo do cadastro entra na URL.

⚠️ A rota dispara chamada externa e **esta API não tem limitador de requisição** (ausência já
registrada em `docs/SECURITY.md`). Fica achado datado, não item desta spec.

## Frontend

Os **três** campos de CEP passam a consultar nossa API: motorista (`DriverAddressFields`), Empresa
(`CompanyProfileFields`) e lotação do MDF-e (`MdfeManifestLotacaoFields`). Some a exceção silenciosa
de dois campos que não buscavam nada.

`brasilapi.com.br` e `viacep.com.br` **saem do `connect-src`** de
`shared/contentSecurityPolicy.service.ts` — o navegador deixa de falar com eles. O contrato
`test/shared/content-security-policy.contract.ts` varre `src/**` por origem `https://` e falha
sozinho se alguma ficar órfã, então remover a origem e o `fetch` é o mesmo passo.
`photon.komoot.io` e `servicodados.ibge.gov.br` **ficam** — busca textual e malha de município não
mudam aqui.

## Fora de escopo

- Busca textual de endereço (Photon) e malha do IBGE.
- **Tabela de cache de CEP.** Recomendação registrada, não construída: como as tabelas de endereço
  se aquecem com o uso real, uma tabela dedicada (sem `company_id`, como `fuel_price_references` já
  é, porque CEP→logradouro é dado postal público) só se paga se a medição mostrar a BrasilAPI sendo
  chamada muito para o mesmo CEP. Decidir sem medir é inventar índice.

## Aceite

- [ ] CEP que existe em qualquer das **cinco** origens **da mesma empresa** responde sem chamada
      externa — um caso por origem, inclusive as duas do MDF-e
- [ ] CEP de outra empresa **não** responde pela fonte local (contrato negativo de isolamento)
- [ ] Resposta nunca traz `number` nem `complement`
- [ ] Resposta local **completa** encerra a busca; resposta **parcial** (UF do MDF-e) não impede a
      BrasilAPI de ser consultada, e só é devolvida se nada mais responder
- [ ] Miss local cai na BrasilAPI; falha da BrasilAPI cai no ViaCEP; falha das duas dá `404`
- [ ] `404` deixa os campos **digitáveis**, sem travar, limpar nem bloquear o envio
- [ ] Duas grafias do mesmo CEP resolvem sempre para a mesma **dentro de uma origem**, pela regra de
      desempate
- [ ] Índice `(company_id, postal_code)` nas quatro tabelas de origem, com migration e `rollback.sql`
- [ ] `addresses.read` em `company-admin`, `fiscal` e `operator`, com contrato em
      `test/authorization.contract.test.ts`
- [ ] Os três formulários preenchem endereço pela nossa API
- [ ] `connect-src` sem `brasilapi` e sem `viacep`, com o contrato de CSP verde
