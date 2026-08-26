# 065 — A carga sai do barracão sabendo o que vai virar

> **Emenda a 059** (a prontidão passa a contar os dois caminhos fiscais) e a **061** (receita
> prevista na montagem, além da realizada no fechamento). Depende da **056** (paradas e estados) e
> consome a **058** (distância) quando ela existir.

## Problema e resultado

A ordem real da operação é esta:

```
separação da carga  →  lote (CT-e e/ou NFS-e)  →  prontidão  →  MDF-e  →  motorista na rua
```

Na **separação**, a carga ainda não tem documento fiscal nenhum — nem CT-e, nem NFS-e. É assim que
funciona: separa-se primeiro, emite-se depois. O produto hoje não sabe disso, e trata a ausência como
pendência.

E há um problema maior embaixo: **o produto acha que todo frete vira CT-e.** A transportadora fica em
Ribeirão Preto, e entrega dentro de Ribeirão é serviço municipal — ISS, NFS-e — não transporte
interestadual. A prontidão fiscal construída na 059 só olha `cte_fiscal_documents`: uma nota de
entrega urbana ficaria `no_cte` **para sempre**, e a viagem nunca ficaria pronta para manifestar.
Numa carga mista — parte na cidade, parte fora — isso trava a viagem inteira.

Junto vem o que a operação precisa antes de tudo isso: na montagem da viagem, **quanto ela rende e
quanto custa**. O valor sai dos mesmos parâmetros que gerariam o documento fiscal, sem gerar
documento nenhum.

**Resultado:** a carga sai do barracão sabendo quanto vale e que documento vai gerar; quando o lote
sai, a viagem sabe sozinha se pode manifestar; e o manifesto chega à mão do motorista.

## Fora do escopo

- **Mudar a emissão** de CT-e, de NFS-e ou de MDF-e. As três funcionam. Esta spec decide *o que* e
  *quando*, nunca *como*.
- **Precificar frete ao contratante.** `freight_rules` continua dona do preço; o que nasce aqui é uma
  dimensão nova de filtro dela.
- **Encerramento do MDF-e** ao fim da viagem — dívida registrada na 059.
- **NFS-e fora de Ribeirão Preto.** O provedor configurado é o `notarp`, que é municipal. Transporte
  intramunicipal em outra cidade precisaria do provedor daquela prefeitura, e isso é spec própria.

## Decisões

### D1 — A carga sem documento fiscal é o estado normal da separação, não uma pendência

Separar é trabalho de barracão; emitir é trabalho de escritório, e vem depois. Uma tela que mostra
"10 notas sem CT-e" em vermelho durante a separação está mentindo sobre o que está errado — não há
nada errado.

Então a prontidão fiscal **tem fase**: durante `separating` e `loading` ela é informativa e silenciosa
("nenhum documento emitido ainda"), e só vira cobrança depois que o lote foi gerado. O bloqueio existe
onde ele importa: na emissão do manifesto.

### D2 — Quem decide o documento é o município de entrega

| Entrega                       | Documento | Imposto |
| ----------------------------- | --------- | ------- |
| No município da empresa       | NFS-e     | ISS     |
| Em qualquer outro município   | CT-e      | ICMS    |

A comparação é por **código IBGE**, nunca por nome — "Ribeirão Preto", "RIBEIRAO PRETO" e "Rib. Preto"
são a mesma cidade e três strings diferentes. `nfe_addresses.city_code` tem o destino e
`company_fiscal_profiles.city_ibge_code` tem o da empresa.

> ⚠️ **Ressalva registrada, e é decisão consciente do mantenedor.** A regra fiscalmente completa é o
> **par origem→destino**: transporte é municipal quando começa e termina no mesmo município. "Destino
> = município da empresa" coincide com ela enquanto a coleta for em Ribeirão — que é a operação de
> hoje. No dia em que houver coleta em outra cidade com entrega em Ribeirão, o trajeto é
> intermunicipal e o documento correto é **CT-e**, e esta regra erraria.
>
> A implementação deixa o município de origem já lido e comparável, e a troca para a regra do par é
> uma condição num arquivo só (`resolveFiscalDocumentKind`). Está escrito aqui para quem ler daqui a
> um ano saber que foi escolha, não descuido.

### D3 — A parametrização de frete ganha município

Hoje o filtro da regra é `destinationStates` + `senderTaxIds`. Não existe dimensão de município, e sem
ela não há como cadastrar preço para a entrega urbana — que é justamente o frete que tem outro
documento, outro imposto e outra margem.

Nasce `destinationCityCodes` (IBGE), no mesmo desenho dos outros dois: lista vazia significa "toda
cidade", e a regra mais específica vence. **O tipo de documento não é parâmetro** — ele decorre da D2.
Deixar a empresa configurar "esta cidade emite CT-e" seria deixar configurar algo fiscalmente errado.

### D4 — A prontidão conta os dois caminhos, e a nota de NFS-e não entra no manifesto

O MDF-e declara **CT-e**. Nota cujo serviço foi documentado por NFS-e é transporte municipal: ela não
vai no manifesto, e **não pode bloqueá-lo**.

A prontidão passa a responder, por nota, qual documento ela espera e onde ele está:

| Nota                    | Espera | Situação                        |
| ----------------------- | ------ | ------------------------------- |
| entrega em Sertãozinho  | CT-e   | autorizado → conta no manifesto |
| entrega em Sertãozinho  | CT-e   | em lote → **bloqueia**          |
| entrega em Ribeirão     | NFS-e  | autorizada → fora do manifesto  |
| entrega em Ribeirão     | NFS-e  | não emitida → **não bloqueia**  |

A última linha é a que mais importa e a menos óbvia: a NFS-e é receita e é obrigação fiscal, mas **não
é condição do manifesto**. Travar a saída do caminhão porque falta uma nota de serviço municipal é
travar por um documento que não vai dentro dele. Ela aparece como pendência da viagem, em lugar
próprio, sem segurar a rua.

E o caso que a 059 não previa: **viagem cujas notas são todas de entrega urbana não tem MDF-e.** Ela
não é "incompleta" — ela é `not_applicable`, e a tela diz isso. Ficar incompleta para sempre é como
uma viagem some da lista sem ninguém entender.

### D5 — A ordem é a da operação, e cada passo diz o que falta para o próximo

1. **Separação** — a carga é montada. A prontidão informa, não cobra (D1).
2. **Lote** — o operador gera o lote de CT-e e/ou de NFS-e a partir das notas da viagem, **com a
   classificação já feita**: cada nota já sabe para qual lote ela vai, em vez de o operador separar à
   mão pelo CNPJ do contratante.
3. **Prontidão** — quando o lote é gerado e os documentos autorizam, a viagem sabe sozinha se pode
   manifestar.
4. **MDF-e** — emitido com o portão da 059.
5. **Motorista** — o manifesto na mão dele (D6).

O passo 2 é o que hoje é feito por seleção manual: a nota entra no lote de CT-e ou no de NFS-e porque
alguém decidiu. Com a D2, a decisão é derivada — e o operador confere em vez de escolher.

### D6 — O manifesto vai para a mão do motorista

O DAMDFE fica acessível na viagem do PWA (spec 057), por URL assinada e curta. O caso é a
fiscalização em barreira, e ele é o motivo prosaico de tudo isto existir: o manifesto que está no
sistema e não abre no celular do motorista é o manifesto que ele imprime e leva em papel — e aí o
produto virou burocracia extra.

Vale para a viagem em curso. Manifesto de viagem encerrada continua no escritório.

### D7 — Na montagem, a viagem já diz quanto rende e quanto custa — e diz que é previsão

A receita prevista sai dos **mesmos parâmetros** que gerariam o documento fiscal, sem emitir nada:
para cada nota, a regra de frete aplicável (agora com a dimensão de município da D3) dá o valor.

Isto **emenda a D1 da 061**, que diz "receita é o CT-e autorizado, e nada mais". As duas convivem
porque são números com propósitos diferentes, e a 061 já tem o vocabulário para separá-los:

| Momento             | Receita                  | `source`    | Para quê                        |
| ------------------- | ------------------------ | ----------- | ------------------------------- |
| Viagem aberta       | parâmetros de frete      | `estimated` | decidir se vale montar a viagem |
| Viagem `completed`  | CT-e/NFS-e autorizados   | `measured`  | comparar histórico e bater com o financeiro |

O que a 061 proíbe — e continua proibido — é **somar previsão no relatório de resultado**. Previsão
serve para decidir hoje; realizado serve para medir ontem. Misturar os dois produz o relatório que
discorda do financeiro, que é o defeito que a D1 da 061 existe para evitar.

O custo previsto usa a mesma composição da 061 D2 (motorista por região, combustível por km, outros
custos por km), com a distância da 058 quando houver e estimada quando não — cada parcela marcada com
a origem dela. **Nenhuma parcela ausente vira zero silencioso.**

## Histórias priorizadas

**P1 — separar sem documento não é pendência**
_Dado_ uma viagem em separação, sem CT-e nem NFS-e,
_quando_ o operador abre a viagem,
_então_ a prontidão diz "nenhum documento emitido ainda" e não mostra dez linhas vermelhas de erro.

**P1 — cada nota já sabe o que vai virar**
_Dado_ uma carga com entregas em Ribeirão e em Sertãozinho,
_quando_ o operador monta a viagem,
_então_ cada nota mostra o documento previsto — NFS-e para a urbana, CT-e para a outra — sem ele
separar por CNPJ.

**P1 — a nota de serviço não trava o caminhão**
_Dado_ uma viagem com CT-e autorizados e uma NFS-e ainda não emitida,
_quando_ a prontidão é consultada,
_então_ a viagem está pronta para manifestar, e a NFS-e pendente aparece como pendência da viagem —
não como bloqueio do MDF-e.

**P1 — viagem urbana não manifesta**
_Dado_ uma viagem cujas entregas são todas no município da empresa,
_quando_ a prontidão é consultada,
_então_ ela responde que não há MDF-e a emitir, e a tela não oferece o botão.

**P1 — quanto essa viagem rende**
_Dado_ uma viagem em montagem,
_quando_ o operador a abre,
_então_ vê receita prevista, custo previsto e margem — **marcados como previsão**, com a composição à
vista.

**P2 — o motorista abre o manifesto no celular**
_Dado_ uma viagem despachada com MDF-e autorizado,
_quando_ o motorista abre a viagem no PWA,
_então_ o DAMDFE abre para ele, por URL assinada e curta.

**P2 — preço diferente para a entrega urbana**
_Dado_ uma regra de frete cadastrada para o município de Ribeirão Preto,
_quando_ a nota é avaliada,
_então_ ela usa essa regra, e não a regra geral da UF.

**P3 — o lote nasce da viagem**
Gerar o lote de CT-e e o de NFS-e a partir das notas da viagem, cada uma no lote que a classificação
indica.

## Requisitos funcionais

1. `resolveFiscalDocumentKind` — módulo puro que decide `cte | nfse` pelo IBGE de destino contra o da
   empresa, com o de origem já lido e comparável (D2).
2. `freight_rule_versions.filters` ganha `destinationCityCodes`, validado como IBGE de 7 dígitos, com
   a mesma semântica de lista vazia dos outros filtros (D3).
3. A prontidão da 059 passa a: classificar cada nota, exigir CT-e autorizado só das de CT-e, listar as
   de NFS-e como pendência própria, e responder `not_applicable` quando não há nota de CT-e (D4).
4. `trips.fiscal_readiness_state` ganha `not_applicable` no vocabulário.
5. A prontidão é **informativa** em `draft`, `route_planned`, `separating` e `loading`; cobrança só de
   `dispatched` em diante (D1).
6. Avaliação prevista da viagem: receita por nota pelos parâmetros, custo pela composição da 061 D2,
   ambos com `source` declarado (D7).
7. O DAMDFE do manifesto vivo da viagem acessível em `/me/trips/current` (D6).
8. Texto em `*.locale.json`.

## Requisitos não funcionais

- A classificação de uma viagem de 200 notas não faz N+1 — ela sai da mesma consulta da prontidão.
- Nenhuma chave de acesso nem CNPJ de participante em log.
- A avaliação prevista **nunca** grava documento fiscal, nem rascunho: ela lê parâmetro e devolve
  número. Um teste garante que nenhuma escrita fiscal acontece no caminho.
- O DAMDFE do motorista sai por URL assinada de vida curta, sem tornar o objeto público.

## Casos extremos e falhas

| Caso                                                        | Comportamento                                                                                     |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Nota sem código IBGE de destino                             | Não classifica: pendência explícita "endereço sem município", nunca um chute para CT-e.            |
| Empresa sem `city_ibge_code` no perfil fiscal               | A classificação inteira é recusada com código próprio — sem o município da empresa não há regra.   |
| Viagem mista, CT-e prontos e NFS-e pendente                 | Pronta para manifestar; a NFS-e vira pendência da viagem (D4).                                    |
| Viagem só de entrega urbana                                 | `not_applicable`; nenhum botão de manifesto.                                                      |
| Nota com CT-e autorizado **e** entrega no município         | Divergência declarada: o documento emitido contradiz a classificação. Não se cancela nada sozinho. |
| Regra de frete de município e de UF batendo na mesma nota   | A de município vence — é a mais específica.                                                       |
| Sem regra de frete aplicável                                | Receita prevista da nota é zero **marcada como ausente**, e a viagem soma o que tem dizendo o que falta. |
| Manifesto emitido e depois cancelado, motorista na rua      | O PWA para de oferecer o DAMDFE e diz por quê.                                                     |

## Critérios de aceite

- [ ] Teste de classificação: destino no município → NFS-e; fora → CT-e; sem IBGE → pendência.
- [ ] Teste de que a NFS-e pendente **não** bloqueia o manifesto.
- [ ] Teste de viagem só urbana → `not_applicable`, sem oferta de manifesto.
- [ ] Teste de que a prontidão é silenciosa em `separating`/`loading`.
- [ ] Teste do filtro de município na regra de frete, incluindo a precedência sobre a UF.
- [ ] Teste de que a avaliação prevista não escreve documento fiscal nenhum.
- [ ] Teste de que a receita prevista sai marcada `estimated` e a realizada `measured`.
- [ ] Teste de que o DAMDFE do motorista sai por URL assinada e some quando o manifesto é cancelado.
- [ ] Integração: viagem mista, do barracão ao manifesto, contra Postgres.
- [ ] ADR (**0047**) — a classificação fiscal por município, com a ressalva da D2 por extenso, e a
      emenda à D1 da 061.
- [ ] `tsc --noEmit` + `make validate`.

## Dúvidas

- `[NEEDS CLARIFICATION: o lote de NFS-e hoje agrupa por tomador (uma nota de serviço por tomador). Numa viagem com várias entregas urbanas de tomadores diferentes, nascem N notas de serviço. Confirmar que é isso mesmo, e não uma nota por viagem.]`
- `[NEEDS CLARIFICATION: entrega urbana entra no MDF-e como NF-e (infNFe) em vez de CT-e? O layout permite manifestar NF-e diretamente. Se a operação exigir MDF-e para a carga urbana, a D4 muda — hoje ela assume que não exige.]`

## 🤖 Modelo

| Etapa                                                    | Modelo    |
| -------------------------------------------------------- | --------- |
| Classificação fiscal, emenda à 059 e à 061, ADR-0047     | `opus` 🧠 |
| Filtro de município, prontidão, avaliação prevista, testes | `sonnet`  |
| Painel da montagem e DAMDFE no PWA                       | `sonnet`  |
