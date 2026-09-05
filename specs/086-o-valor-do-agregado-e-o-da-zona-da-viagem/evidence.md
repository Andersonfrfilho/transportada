# Evidência — 086

Executada em 2026-09-05, no worktree `work/spec-086`, contra o dado real de staging carregado em
local (29 zonas, 83 cidades, 146 preços, 6 motoristas cobrindo zonas distintas).

## 1. O defeito que a spec existe para consertar

O valor do agregado saía da **ordem que o Postgres devolveu**. A linha que decidia existia duas
vezes, uma em cada caminho:

```
$ git show 5babb48a:apps/api-transportada/src/trips/infrastructure/trip-valuation.query.ts \
    | grep -c 'current.routeAmount === null && row.routeAmount !== null'
2
```

O preço que ela podia escolher, medido na tabela real (`truck`, família BARRETOS):

| zona      | R$           |
| --------- | ------------ |
| 1.000     | 1.086,12     |
| 1.001     | 1.206,80     |
| 1.002     | 1.307,37     |
| **1.003** | **1.508,51** |

**39% entre o menor e o maior**, num número que a tela apresenta como medido, sem marca de
estimativa, e que decide se a viagem é montada. Um motorista que cobre a família inteira recebia
qualquer um dos quatro.

Hoje a zona é a do último destino, e `crew-zone-wiring.contract.ts` reprova o retorno da linha.

## 2. A medição que reordenou a spec

Casamento entre o destino das notas e `freight_region_cities`, sobre 76 cidades distintas:

| dobra                                | casam  |
| ------------------------------------ | ------ |
| `upper(trim())` — o que existia      | **39** |
| dobrando o acento — `foldRegionCity` | **65** |

As 37 que a dobra recuperou eram **todas** grafia: `RIBEIRAO PRETO` contra `Ribeirão Preto`,
`SAO CARLOS`, `MATAO`, `GUAIRA`, `SANTA CRUZ DA CONCEICAO`. A NF-e escreve sem acento e a planilha
do cliente escreve com. Sem a T1, metade das viagens cairia em lacuna pelo motivo errado, e o aviso
diria "cadastre RIBEIRAO PRETO" com Ribeirão Preto já cadastrada.

## 3. As 12 cidades que continuam ausentes

Ausência de verdade, não grafia — é delas que `CITY_WITHOUT_REGION` fala, por nome:

`ALTINOPOLIS` · `ESPIRITO SANTO DO PINHAL` · `GUATAPARA` · `ITIRAPUA` · `ITOBI` · `NUPORANGA` ·
`ORLANDIA` · `RESTINGA` · `SANTA CRUZ DA CONCEICAO` · `SANTO ANTONIO DA ALEGRIA` ·
`SANTO ANTONIO DO JARDIM` · `VISTA ALEGRE DO ALTO` — todas SP.

Cadastrá-las é trabalho de operação, na aba Regiões. A spec as nomeia; ela não as inventa.

## 4. `tractor_unit` continua sem preço

Por desenho: `resolveVehicleFreightClass` manda `''` porque cavalo mecânico não é coluna da planilha
do cliente. Confirmado na simulação sobre o dado real — os dois motoristas testados resolvem preço
para `toco` e `truck` e nenhum para `tractor_unit`. Se uma viagem com cavalo mecânico passar a
mostrar número na parcela `driver`, é defeito.

## 5. Gates

| gate                            | resultado                 |
| ------------------------------- | ------------------------- |
| `tsc --noEmit` (API e frontend) | limpo                     |
| contratos da API                | **4299** passam, 0 falham |
| contratos do frontend           | **2738** passam, 0 falham |
| `bun run lint`                  | limpo                     |
| `make check`                    | verde                     |

Os contratos que medem o defeito **falharam antes de passar**, conferido em execução:

- `driver-zone.contract.ts` — não compilava contra o código de então (a política não existia);
- `crew-zone-wiring.contract.ts` — a linha que ele proíbe estava lá, duas vezes (§1);
- `valuation-gap-labels.contract.ts` — conferido removendo o rótulo: `trip pt is missing
CITY_WITHOUT_REGION`;
- `gap-detail.contract.ts` — as três afirmações falharam antes da travessia do campo.

## 6. O que ficou de fora

- **A sugestão de zona por município próximo não foi construída.** A D2 a descreve como sugestão
  ("verifica de qual região se tem algum município próximo"); o que existe hoje é o **nome** da
  cidade a cadastrar, que é a metade acionável. A sugestão precisa de distância entre municípios —
  e `freight_region_cities` não guarda coordenada.
- **Nenhum teste de integração com Postgres real** cobre as consultas novas: a afirmação sobre elas
  é por texto de fonte (`crew-zone-wiring.contract.ts`), no mesmo padrão do
  `delivery-proof-read.support.ts`. O caminho não foi exercido contra o banco carregado.
- **A prévia sem roteiro usa a zona mais alta da família**, decisão assumida e não perguntada
  (registrada no `plan.md` e no `OBJETIVO.md`). Famílias diferentes viram lacuna.
- **A extensão `unaccent` foi criada no Postgres local** para medir o §2. Ela não entra em migration
  e não é usada pelo produto — a dobra é TypeScript, para não descartar o índice
  `freight_region_cities_company_city_idx`.
