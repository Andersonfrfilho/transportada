# Feature 069 — O endereço não tem coordenada

## Problema e resultado

A sugestão de roteiro está inteira, e não sugere nada.

`geocoded_addresses` existe, com CHECKs, cascata de precisão e a coluna `external_place_id` que a
ADR-0044 §3 pediu como saída de licença. `GeocodingPort` está declarada. `geocodeAddresses` implementa
os cinco degraus da cascata e tem contrato verde. O solver está no worker, o OSRM tem adaptador, o
painel tem mapa.

**E nenhuma linha entra em `geocoded_addresses`, porque o adaptador do provedor não existe.**

Três ausências, medidas:

| o que falta                             | onde deveria estar                                   | consequência                          |
| --------------------------------------- | ---------------------------------------------------- | ------------------------------------- |
| adaptador do geocodificador             | `routing/infrastructure/google-geocoding.gateway.ts` | nenhum endereço vira coordenada       |
| adaptador de centroide (`CentroidPort`) | não existe em nenhuma app                            | degraus 4 e 5 da cascata não têm dado |
| **chamador** de `geocodeAddresses`      | nenhum, fora do contract test                        | a use case nunca roda em produção     |

O efeito é uma sugestão que não erra: ela responde. `readStops` no worker
(`drizzle-route-optimization.repository.ts:352`) exige coordenada **fina** —

```ts
const hasFineCoordinate =
  row.latitude !== null && row.longitude !== null && row.precision !== 'city'
```

— e como a tabela está vazia, **toda** parada sai com `excludedFromOptimization: true`. O conferente
clica em "sugerir roteiro", o worker corre o solver sobre zero paradas otimizáveis e devolve uma
proposta vazia. Nenhum erro, nenhum código estável, nada para traduzir na tela.

⚠️ **A T006 da spec 058 está marcada ✅ com dois dos três arquivos que ela própria lista.** A porta e
`geocoding-precision.policy.ts` foram escritas; `google-geocoding.gateway.ts` não. O aceite dela
("os quatro `location_type` mapeados") é satisfeito pela política pura, que é testável sem provedor —
e o contrato de T007 ("cache esvaziado → zero chamadas ao provedor") passa verde injetando uma porta
falsa. **Duas verificações verdes sobre uma camada ausente.** Isto é requisito desta spec: o aceite
aqui não pode ser satisfeito por teste que injeta a porta.

O resultado desta feature: um endereço de NF-e vira coordenada fina, uma vez, permanentemente, e a
parada correspondente entra na otimização.

## Fora do escopo

- **Provisionar o OSRM em staging.** É o outro metade do bloqueio e vai por caminho próprio — sem
  serviço de matriz, geocodificar não faz a sugestão sair. As duas metades são independentes e
  entregam em separado.
- **O mapa PMTiles** da ADR-0044 §6. O painel já cai para lista sem mapa e diz isso.
- **Qualquer mudança no solver, no fitness ou na cascata.** A cascata está escrita e testada; esta
  spec preenche os degraus, não os redesenha.
- **Backfill de endereços já em base.** A ADR-0044 §3 e a T002 da 058 já decidiram: a coordenada
  entra quando a parada for geocodificada, não numa varredura.
- **Cubagem/volume** (ADR-0044 §9).

## Histórias priorizadas

### P1 — A parada entra na otimização

**Given** uma viagem com paradas cujos endereços nunca foram geocodificados
**When** o conferente pede a sugestão de roteiro
**Then** os endereços são resolvidos em coordenada fina, gravados em `geocoded_addresses` com
`external_place_id`, e as paradas entram na otimização — e um segundo pedido para a mesma viagem
**não chama o provedor nenhuma vez**.

### P2 — O endereço que não resolve é marcado, não inventado

**Given** um endereço que o provedor não acha (rua nova, XML mal formatado)
**When** a sugestão é pedida
**Then** a cascata desce ao centroide do CEP e, faltando ele, ao do município — e a parada entra
`excludedFromOptimization`, visível na tela como palpite, nunca dentro da rota.

### P3 — A queda do provedor não derruba a sugestão

**Given** o geocodificador fora do ar ou sem chave configurada
**When** a sugestão é pedida
**Then** os endereços já em base seguem otimizando normalmente, os novos descem a cascata, e a
sugestão sai com as paradas que dá — nunca `failed`, e nunca com coordenada estimada em linha reta.

### P4 — O custo é observável antes de ser fatura

**Given** a operação rodando por um mês
**When** alguém pergunta quanto a geocodificação custou
**Then** existe número: endereços novos geocodificados no período e total em base
(ADR-0044 §3, mitigação 3).

## Requisitos funcionais

1. **RF1** — Um adaptador de `GeocodingPort` que resolve logradouro + número + CEP + município em
   coordenada, mapeando a precisão declarada pelo provedor pela política que já existe
   (`toGeocodingPrecision`).
2. **RF2** — Toda geocodificação bem-sucedida pelo provedor grava `external_place_id` não vazio. O
   CHECK `geocoded_addresses_place_id_check` já cobra isso no banco; o aceite cobra pelo adaptador.
3. **RF3** — Um adaptador de `CentroidPort`, com os dois degraus (CEP e município).
4. **RF4** — `geocodeAddresses` é chamada no caminho real da sugestão, antes de a matriz ser pedida,
   e o que ela resolve fica disponível para `readStops`.
5. **RF5** — Provedor sem chave configurada **não derruba nada**: a cascata desce, e a app sobe.
6. **RF6** — Endereço já em `geocoded_addresses` nunca é reenviado ao provedor.
7. **RF7** — A correção manual continua vencendo qualquer geocodificação posterior (já implementado
   em `shouldReplaceStored`; aqui é regressão a não quebrar).
8. **RF8** — Contagem de endereços geocodificados por período, consultável.
9. **RF9 — O CEP geral não se disfarça de quarteirão.** Cidade pequena tem **um CEP para o município
   inteiro**. O centroide dele é um palpite de vários quilômetros, e gravá-lo como `postal_code`
   passaria no portão de coordenada fina (`precision !== 'city'`) e o poria **dentro** da rota — o
   modo de falha exato que a ADR-0044 §1 existe para impedir, e o mesmo do extract pequeno demais:
   número plausível, sem aviso. Centroide de CEP só vale `postal_code` quando o CEP identifica
   logradouro ou quarteirão; CEP geral de município grava `precision: 'city'` e sai da otimização.

## Requisitos não funcionais

- **RNF1 — Nenhum endereço em log, em nenhum nível.** `security.md` §1 e o comentário que já está na
  `GeocodingPort`. O identificador que rastreia é a `addressKey`. Isto vale para log de erro do
  provedor: a resposta dele carrega o endereço de volta.
- **RNF2 — A chave do provedor é segredo de ambiente**, validada por schema no boot, e nunca com
  prefixo `VITE_`.
- **RNF3 — Geocodificar é trabalho assíncrono.** Nada disto entra no caminho de request de vincular
  nota: o separador que bipa uma etiqueta não espera por rede de terceiro.
- **RNF4 — Rajada limitada.** Uma sugestão de 200 paradas com 200 endereços novos são 200 chamadas;
  elas saem com concorrência limitada e com `AbortSignal`, não em `Promise.all` sobre a lista inteira.
- **RNF5 — `geocoded_addresses` não tem `company_id`, e continua assim.** A coordenada de um endereço
  não é de ninguém (decisão registrada no schema). O contrato de tenant safety que a lista como
  exceção declarada não muda.

## Casos extremos e falhas

| caso                                                  | comportamento                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| chave ausente                                         | app sobe, cascata desce ao centroide, aviso estruturado uma vez no boot                                                                    |
| provedor devolve 429 / 5xx                            | cascata desce para aquele endereço; sem retry dentro da sugestão                                                                           |
| provedor devolve `ZERO_RESULTS`                       | é resposta legítima, não erro: cascata desce                                                                                               |
| provedor devolve `location_type` novo                 | vira `city` pela política que já existe — o desconhecido é o palpite mais grosseiro                                                        |
| CEP vazio ou malformado no XML                        | pula o degrau do CEP, vai ao município                                                                                                     |
| **CEP geral de cidade pequena**                       | **classificado como `city`, não `postal_code`** — ver RF9                                                                                  |
| município sem código IBGE                             | endereço não entra no mapa de saída; parada fica sem coordenada                                                                            |
| duas sugestões concorrentes com o mesmo endereço novo | a segunda pode geocodificar de novo; a escrita é idempotente pela PK, e o gasto de uma chamada extra é aceitável contra o custo de um lock |
| endereço já corrigido à mão                           | `manual` vence, provedor não é chamado                                                                                                     |

## Critérios de aceite

- **CA1** — Com o provedor injetado por **fake de transporte** (não por porta falsa), um endereço
  novo vira linha em `geocoded_addresses` com `source: 'google'`, precisão mapeada e
  `external_place_id` preenchido.
- **CA2** — Repetir a mesma sugestão faz **zero** chamadas ao transporte.
- **CA3** — Transporte que lança faz a cascata descer e a sugestão sair; nenhuma exceção sobe ao
  handler.
- **CA4** — Nenhum teste de aceite desta spec passa com a `GeocodingPort` substituída por objeto
  literal. A costura testada é a do adaptador para baixo.
- **CA5** — Varredura de log da suíte: nenhum campo de endereço aparece em nenhuma linha emitida.
- **CA6** — Uma sugestão real, ponta a ponta com OSRM de fixture, sai com paradas **dentro** da
  otimização — que é o que hoje é impossível.
- **CA7** — `make check` verde.

## Dúvidas

### D1 — O provedor ✅ decidido em 2026-09-01

**Google, com a coordenada guardada em base permanentemente.** Confirma a ADR-0044 §3, e confirma com
ela a **exceção de licença assumida por escrito**: os Termos do Google Maps Platform permitem cache de
lat/lng por 30 dias corridos, e o armazenamento indefinido que fazemos aqui está fora deles. A saída
barata continua sendo o `place_id`, que é armazenável sem exceção nenhuma e por isso é `not null` no
schema.

Recusada de novo, pelo mesmo motivo da ADR: hospedar geocodificador nosso (Nominatim sobre o mesmo
extract OSM do OSRM). **Não compensa por dinheiro** — e a razão é que as duas camadas têm formatos de
chamada opostos:

| camada            | quantas chamadas                       | forma do custo                                       |
| ----------------- | -------------------------------------- | ---------------------------------------------------- |
| matriz de estrada | milhares **por sugestão**              | recorrente e sem teto → hospedar ganha (ADR-0044 §2) |
| geocodificação    | uma por endereço **novo**, para sempre | pagamento único que **decai** conforme a base satura |

Servidor de pé 24/7 é custo fixo que nunca decai; a conta do Google cai para o punhado de endereços
novos do mês. Hospedar geocodificador se justificaria por licença ou privacidade — nunca por economia.

#### O que exatamente vai para o banco

Precisão importa aqui, porque "guardar os endereços" e o que a tabela faz não são a mesma coisa:

- **vai** — `address_key` (`cityCode|postalCode|number`, a normalização que a 056 já usa), a
  coordenada, a precisão, a origem e o `place_id`;
- **não vai** — nome do destinatário, CNPJ/CPF, razão social, nem o texto do logradouro.

É por isso que `geocoded_addresses` **não tem `company_id`** e isso é defensável: ela diz "este ponto
de entrega existe e fica aqui", sem dizer de quem é. Duas empresas que entregam na mesma rua não
geocodificam duas vezes.

⚠️ **Pendência operacional, não de código:** a chave não existe. Alguém precisa criar o projeto no
Google Cloud com faturamento, gerar a chave da Geocoding API **restrita a ela**, e pô-la em
`GEOCODING_API_KEY` no worker. Enquanto isso não acontece, a Fase A entrega e a Fase B fica pronta
esperando a variável — o gateway só é construído quando ela existe (RF5).

### D2 — De onde vem o centroide? ✅ decidido em 2026-09-01

Os degraus 4 e 5 da cascata não tinham fonte de dado em lugar nenhum do repositório.

- **CEP** — a BrasilAPI, que a API já consulta em `postal-code.gateway.ts`, devolve coordenada no
  `/cep/v2`. Reusar o destino que já existe é mais barato que abrir outro.
- **Município — tabela semeada dos 5.570 códigos do IBGE.** Dado público, sem PII e sem tenant: a
  mesma natureza de `fuel_price_references`, que já é a exceção declarada no contrato de tenant
  safety. Previsível, offline, e sem acrescentar dependência de rede num degrau que só roda **quando
  todo o resto já falhou** — que é justamente onde uma chamada externa a mais é o pior lugar para se
  estar.

⚠️ A tabela nova entra no contrato de tenant safety como **segunda exceção declarada**. Uma exceção
que se acrescenta sem ser dita vira precedente para a terceira, que ninguém revisa.

### D3 — Geocodificar é trabalho de qual app?

Não é dúvida para o usuário; é decisão técnica, e está tomada no plano: **worker**. A razão é que
`readStops` já é onde a coordenada falta, o trilho já é assíncrono por decisão da ADR-0044 §7, e a
use case hoje **não tem chamador em app nenhuma** — então ela se **move**, sem virar a quarta cópia
por valor do repositório.
