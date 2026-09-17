# Feature 154 — A lista traz o catálogo inteiro, e a tela diz quando ele foi puxado

> Pedido do usuário em 2026-09-17: _"precisamos das listas de praças e um botão de alterar valores
> para vc puxar"_, com o complemento _"verificar como estamos puxando, se é possível puxar mais e
> quando foi atualizado"_.

## O que já existe — não reimplementar

O levantamento feito antes desta spec encontrou quase tudo de pé. A feature é estreita de propósito:
ela fecha três buracos, não constrói três telas.

| Peça                                | Onde                                                   | Estado                                                                                                   |
| ----------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Tela de praças com ajuste de tarifa | `fleet/components/TollBoothChargePanel.component.tsx`  | Pronta: valor efetivo e origem **por campo**, tarifa do mapa com data, campos de ajuste, botão de limpar |
| Rotas do ajuste                     | `companies/presentation/toll-booth-charge.routes.ts`   | `GET`/`PUT`/`DELETE /v1/company-settings/toll-booth-charges[/:osmNodeId]`, `settings.manage`             |
| Valor efetivo por praça             | `companies/domain/toll-booth-charge.policy.ts`         | `ajuste ?? catálogo`, campo a campo (spec 095 D1)                                                        |
| Extrato da rota, praça a praça      | `trip/components/RouteTollSummary.component.tsx`       | Pronto: ordem de passagem, marca a praça sem tarifa e a que caiu para a manual                           |
| Idade do catálogo                   | `toll-booths/domain/toll-catalog-status.policy.ts`     | `empty \| stale \| current` + `observedOn` — **só consumido no mapa da viagem**                          |
| Seed idempotente                    | `toll-booths/application/seed-toll-booths.use-case.ts` | Idempotente por `osm_node_id`, validação de forma, sem rota que o chame                                  |

## Problema e resultado

1. **A lista de Frota só mostra praça que alguma viagem já cruzou.** É decisão escrita da spec 095
   (item 4), e o `list-toll-booth-charges.use-case.ts` a implementa lendo `readSeenOsmNodeIds` do
   pedágio congelado. O efeito é que **não dá para cadastrar a tarifa antes de rodar a rota**: a
   primeira viagem por uma praça nova sai com `TOLL_PARTIAL` e total subestimado, e só depois dela
   a praça aparece para ser corrigida. Quem planeja a semana não tem onde arrumar isso antes.
2. **Não existe nada no produto que puxe o catálogo.** `toll_booths` só muda rodando dois passos à
   mão, fora da aplicação: `scripts/toll-booth-extract.ts` (`osmium` sobre o `.osm.pbf`) e
   `runTollBoothSeed` sobre o JSON. Nenhuma rota, nenhum cron, nenhum botão. Nada em `src/` lê ou
   escreve a chave `toll-booths/osm/<dataset>/<data>/` do bucket que o runbook documenta — esse
   objeto é colocado lá por pessoa.
3. **Nenhuma tela de configuração diz de quando é a tarifa do mapa.** O `TollBoothChargePanel`
   imprime o `observed_on` de cada praça, mas não a idade do catálogo como um todo, e não distingue
   "o catálogo desta instalação nunca foi carregado" de "estas praças não têm tarifa". Reajuste de
   pedágio é anual: sem a data ao lado, o operador lê um número velho como se fosse de hoje.
4. **Da praça sem tarifa na rota não se chega à correção.** O extrato da viagem diz "sem tarifa
   conhecida" e para aí. Quem quer arrumar tem de sair da viagem, abrir Frota, achar a praça na
   outra lista — e, hoje, ela só estará lá se a viagem já tiver sido congelada.

**Resultado:** a lista de Frota passa a ser a do **catálogo**, com busca, trazendo primeiro a praça
que a operação cruza e a que está sem tarifa; a tela mostra de quando é o catálogo e oferece um
botão que o recarrega do extrato versionado no bucket, com trilha de auditoria; e a praça sem tarifa
no extrato da rota leva direto ao ajuste dela.

## O que foi medido (2026-09-17)

| Ambiente | Praças | Com tarifa por eixo | `observed_on`   | Fonte                                                    |
| -------- | ------ | ------------------- | --------------- | -------------------------------------------------------- |
| Local    | 166    | 162                 | 2026-09-07      | `select count(*) … from toll_booths` medido nesta data   |
| Staging  | 592    | 571                 | 2026-09-14      | Registro de 15/09 em `docs/runbooks/osrm-extract.md:162` |
| Produção | —      | —                   | nunca carregada | mesmo registro                                           |

O recorte é `sudeste-260914.osm.pbf` (`.railway/railway.ts:432`), o **mesmo** arquivo do OSRM e das
tiles. Puxar mais praça significa trocar o recorte, e trocar o recorte obriga a reconstruir o
roteirizador e o mapa no mesmo arquivo (`make map-refresh`): a praça casa com a rota **por id de nó
do OSM**, e um catálogo maior que o roteirizador não produz erro — produz total subestimado em
silêncio.

## Decisões (não reabrir)

- **D1 — A lista de Frota passa a ser a do catálogo inteiro, ordenada por relevância.** Primeiro as
  praças que a operação já cruzou e estão sem tarifa conhecida; depois as cruzadas com tarifa;
  depois o resto do catálogo. O ajuste de praça que o catálogo não conhece mais (`catalogKnown:
false`) continua aparecendo — é trabalho de gente e não some por decisão de um mapa de terceiro.
- **D2 — Busca e paginação são do servidor.** 592 praças em staging hoje, e o recorte pode crescer.
  Busca por nome e operador, `perPage` com teto de 100 (padrão do ecossistema), paginação por
  offset — é lista pequena e voltada a gente, não a máquina.
- **D3 — O botão recarrega do objeto já versionado no bucket do ambiente, nunca do Geofabrik.** O
  contêiner da API não tem `osmium` nem tem por que baixar centenas de MB para responder a um
  clique. Ele lê `toll-booths/osm/<dataset>/<data>/toll-booths.json` — que é exatamente a entrada
  que o seed já consome — e roda o `seed-toll-booths.use-case.ts` que já existe.
- **D10 — O extrato é registrado em tabela, não descoberto no bucket.** O
  `@adatechnology/object-storage-provider` expõe `put`, `get`, `head`, `delete` e URL assinada —
  **não tem `list`**. Varrer o bucket para descobrir extratos é impossível sem inventar índice, e um
  índice em objeto é estado sem transação. Cada extrato subido pelo produto grava uma linha em
  `toll_booth_extracts` (dataset, data do extrato, chave do objeto, sha256, contagens, ator), e é
  dela que a RF3 lê. A mesma linha é a trilha de auditoria da recarga (D6).
  ⚠️ A tabela é **da instalação**, sem `company_id`, como o catálogo que ela descreve: o extrato não
  pertence a uma empresa. Isso faz a lista de `test/fleet-schema/tenant-safety.contract.ts` passar de
  três para quatro tabelas — a suíte é **atualizada com a justificativa**, nunca afrouxada nem
  apagada, e `toll_booths` continua sem `company_id`.
- **D4 — Extrato novo continua sendo passo de runbook.** Gerar um `.pbf` novo e extrair dele é
  `make map-refresh` + `osmium`, porque o id do nó tem de casar com o do roteirizador. O que esta
  spec acrescenta ao runbook é **subir o JSON e o manifesto pelo produto**, para que o botão tenha o
  que recarregar sem ninguém mexer no bucket à mão.
- **D5 — A data na tela é a do catálogo, com estado.** `resolveTollCatalogStatus` já decide
  `empty | stale | current`; a tela de Frota passa a consumi-lo. `empty` diz que o catálogo nunca
  foi carregado — nunca "não há pedágio".
- **D6 — Recarregar é ação auditada, com `settings.manage`.** Grava ator, data/hora, dataset, data
  do extrato e contagens (security.md §10). ⚠️ `toll_booths` **não tem `company_id` por desenho** —
  é catálogo da instalação. Recarregar afeta todas as empresas do deploy. Como a distribuição é uma
  instalação por transportadora (ADR-0021), isso é aceitável, mas a tela tem de dizê-lo, e a
  asserção de `test/fleet-schema/tenant-safety.contract.ts` continua valendo intacta.
- **D7 — O recarregamento nunca apaga praça.** O seed é idempotente por `osm_node_id` e só escreve.
  Praça que sumiu do extract permanece na base com a data antiga; quem a marca é o `catalogKnown`
  que já existe. Apagar seria migration destrutiva de dado que ajuste manual referencia.
- **D8 — Da praça da rota se chega ao ajuste.** No extrato da viagem, a praça sem tarifa conhecida
  ganha ação que abre o ajuste daquela praça. Sem `settings.manage`, a ação não é oferecida — e a
  API recusa de qualquer forma (a tela esconder não é autorização, security.md §8).
- **D9 — A tarifa do OSM não vira tarifa oficial.** O mapa é cobertura (onde a praça está), nunca
  preço. Importar ANTT/ARTESP segue fora de escopo, e é por isso que o ajuste por empresa da spec
  095 é o caminho de correção.

## Fora do escopo

- Importar tarifa oficial de ANTT, ARTESP ou concessionária.
- Trocar o recorte do `.pbf` (é `make map-refresh`, e muda OSRM e tiles junto).
- Baixar o `.pbf` ou rodar `osmium` dentro de qualquer app.
- Apagar praça do catálogo.
- Estorno de lançamento de custo — spec própria, ainda por escrever.

## Histórias

### P1 — Cadastrar a tarifa antes da viagem

Operador abre Frota → pedágio, busca "Anhanguera", acha a praça mesmo sem nunca ter rodado por ela,
digita a tarifa por eixo e a data da tarifa. A próxima viagem por lá já sai com o total completo.

### P1 — Saber de quando é o catálogo

Ao abrir a aba, o operador lê quantas praças o catálogo tem, de quando é o extrato e se está velho.
Numa instalação recém-criada, lê que o catálogo nunca foi carregado — não uma lista vazia.

### P1 — Puxar de novo

Depois do `make map-refresh`, quem tem `settings.manage` aperta "recarregar catálogo", escolhe entre
os extratos disponíveis no bucket, e vê quantas praças entraram e quantas foram atualizadas. A ação
fica na trilha de auditoria.

### P2 — Corrigir a praça que a rota achou sem tarifa

No extrato de pedágio da viagem, a praça marcada "sem tarifa conhecida" tem ação de ajuste. Ela abre
a correção daquela praça, o operador informa valor e data, e o total da rota deixa de subestimar.

### P2 — Operador sem `settings.manage`

Vê a lista e as tarifas, não vê botão de recarregar nem campos de ajuste. A API recusa as duas
ações independentemente da tela.

## Requisitos funcionais

- **RF1** `GET /v1/toll-booths` devolve o catálogo paginado, com `search` (nome e operador),
  `page`, `perPage` (teto 100), e, para a empresa do contexto, o valor efetivo e a origem por campo
  de cada praça, além de `seen` (a operação já cruzou) e `catalogKnown`. Ordem da D1. Permissão de
  leitura: `fleet.read`.
- **RF2** A resposta carrega o resumo do catálogo: `boothCount`, `observedOn`, `status`
  (`empty | stale | current`) e quantas praças estão sem tarifa por eixo conhecida.
- **RF3** `GET /v1/toll-booths/extracts` lista os extratos registrados (dataset, data do extrato,
  contagens, sha256 e quem subiu), do mais novo para o mais antigo. Permissão: `settings.manage`.
- **RF3b** `POST /v1/toll-booths/extracts` recebe o JSON do extrator, grava o objeto no bucket do
  ambiente em modo `create-only` sob `toll-booths/osm/<dataset>/<observedOn>/toll-booths.json`, e
  registra a linha da D10. Rejeita `dataset`/`observedOn` já registrados com 409 — extrato não é
  sobrescrito. Permissão: `settings.manage`.
- **RF4** `POST /v1/toll-booths/reload` recarrega o catálogo a partir de um extrato **registrado**
  (`dataset` + `observedOn`), lendo o objeto pela chave da linha e executando o seed existente. Responde com quantas praças foram
  gravadas e a data passada a `observed_on`. Permissão: `settings.manage`. Idempotente: repetir com
  o mesmo extrato deixa as mesmas linhas.
- **RF5** A recarga grava, na linha do extrato, ator e data/hora da última execução e quantas
  praças foram gravadas — é a trilha de auditoria exigida por security.md §10.
- **RF6** A aba de pedágio em Frota passa a listar o catálogo (RF1) com campo de busca e paginação,
  mostrando no topo o resumo do RF2 e, para quem tem `settings.manage`, o botão da RF4 com a lista
  da RF3.
- **RF7** No extrato de pedágio da rota, a praça sem tarifa conhecida oferece ação que leva ao
  ajuste daquela praça, só para quem tem `settings.manage`.
- **RF8** O runbook `docs/runbooks/osrm-extract.md` passa a descrever a subida do extrato pela
  RF3b no lugar do passo manual de bucket, e registra que a recarga é feita pela tela.

## Requisitos não funcionais

- **RNF1** Nenhuma rota nova baixa `.pbf` nem executa binário externo.
- **RNF2** `GET /v1/toll-booths` nunca lê a tabela inteira sem paginar; o resumo do RF2 continua
  saindo de `readCatalogSummary` (`count` + `max`), numa consulta só.
- **RNF3** `POST /v1/toll-booths/reload` é protegido contra execução concorrente — duas recargas
  simultâneas do mesmo extrato não podem se sobrepor.
- **RNF4** Nenhum log de nome de operador, ator ou conteúdo do extrato além de contagens e ids.
- **RNF5** Dinheiro continua `numeric(19,4)` em texto — nunca float.

## Casos extremos

- **Catálogo vazio.** `status: 'empty'`; a tela diz que nunca foi carregado e oferece a recarga.
  Lista vazia sem essa frase é indistinguível de "não há praça".
- **Nenhum extrato registrado.** RF3 devolve lista vazia e o botão explica que não há o que
  recarregar, apontando o passo do runbook. Não é erro. ⚠️ Instalação que já tem `toll_booths`
  carregada pelo caminho manual (staging hoje) cai exatamente aqui: catálogo populado e nenhum
  extrato registrado. A tela tem de dizer isso sem sugerir que o catálogo está vazio.
- **Objeto sumiu do bucket.** A linha existe, o `get` falha: a recarga responde erro de domínio
  próprio, e a linha é marcada como indisponível. Nunca 500 cru.
- **Extrato menor que o catálogo atual.** Nada é apagado (D7). A tela informa quantas praças do
  catálogo não vieram no extrato escolhido.
- **Praça com ajuste e sem catálogo** (`catalogKnown: false`). Continua na lista, marcada, editável.
- **`0.00` no catálogo.** Continua sendo tarifa declarada, não isenção — a contagem de "sem tarifa"
  não o inclui, e a tela mantém o aviso da spec 090.
- **Busca sem resultado.** Diz "nenhuma praça com esse nome no catálogo de <data>", nunca lista
  vazia muda.

## Critérios de aceite

1. Com o catálogo carregado e **nenhuma** viagem congelada, a busca por uma praça do catálogo a
   encontra e permite ajustar a tarifa — hoje a lista sairia vazia.
2. A aba de pedágio mostra total de praças, data do extrato e o estado do catálogo; com
   `toll_booths` vazia, mostra o estado `empty` com a frase própria.
3. `POST /v1/toll-booths/reload` sobre um extrato do bucket deixa `toll_booths` com as praças dele,
   sem apagar as que não vieram, e a segunda execução não muda linha nenhuma.
4. A recarga sem `settings.manage` responde 403, com a tela mostrando ou não o botão.
5. A recarga aparece na trilha de auditoria com ator, dataset e data do extrato.
6. Praça marcada "sem tarifa conhecida" no extrato da rota leva ao ajuste dela, e depois do ajuste o
   total da rota deixa de contá-la como sem tarifa.
7. `test/fleet-schema/tenant-safety.contract.ts` continua verde com a lista atualizada para quatro
   tabelas e a justificativa escrita; `toll_booths` segue sem `company_id`.
8. Subir o mesmo extrato duas vezes responde 409 na segunda, e o objeto do bucket não é
   sobrescrito.

## Premissas a confirmar

- **P1** O objeto `toll-booths/osm/sudeste/2026-09-14/toll-booths.json` existe no bucket de staging,
  como o runbook registra em 15/09. Ele **não** terá linha em `toll_booth_extracts` (a tabela nasce
  aqui): a spec precisa decidir na T de dados se o extrato existente é registrado por migration de
  dado ou resubido pela RF3b. **Recomendado: resubir pela RF3b**, que é o caminho que a feature
  passa a exigir de qualquer forma.
- **P2** Nada em `src/` lê `manifest.json` hoje — confirmado. Se o manifesto no bucket de staging
  tiver forma diferente da que a D10 grava na tabela, ele é ignorado, não parseado.

### Verificado antes de escrever esta spec, não é premissa

- O provider de objetos **não tem `list`** (`@adatechnology/object-storage-provider`: `put`, `get`,
  `head`, `delete`, URL assinada). É o que obriga a D10.
- **Não existe trilha de auditoria de uso geral na API.** `src/database/` não tem tabela de
  auditoria; a linha do extrato é a trilha desta ação.
