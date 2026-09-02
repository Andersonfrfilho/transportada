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

### P1 — A coordenada já está lá quando alguém pede o roteiro

**Given** notas chegando com endereços de entrega ao longo do dia
**When** a rotina de população roda
**Then** todo endereço distinto que ainda não está em base é resolvido pelo CEP e gravado — e quando
o conferente pede a sugestão, **nenhuma chamada de rede acontece no caminho dele**.

### P2 — O endereço que aparece pela primeira vez não trava a sugestão

**Given** uma nota que chegou minutos antes, cujo endereço a rotina ainda não alcançou
**When** a sugestão é pedida
**Then** ele é resolvido ali mesmo e gravado — a população é adiantamento, nunca pré-requisito.

### P3 — O conferente corrige o que saiu muito errado

**Given** uma parada cuja coordenada de CEP põe o cliente longe de onde ele está
**When** o conferente marca a parada como errada
**Then** aquele endereço é reconsultado no provedor fino, a coordenada melhor substitui a de CEP, e
o roteiro seguinte já usa a nova — sem que ninguém precise mexer em configuração.

### P4 — O endereço que não resolve é marcado, não inventado

**Given** um endereço cujo CEP não devolve coordenada
**When** a sugestão é pedida
**Then** a cascata desce ao centroide do município, e a parada entra `excludedFromOptimization`,
visível na tela como palpite — nunca dentro da rota.

### P5 — A queda do provedor não derruba a sugestão

**Given** a BrasilAPI fora do ar
**When** a sugestão é pedida
**Then** os endereços já em base seguem otimizando normalmente, os novos descem ao município, e a
sugestão sai com as paradas que dá.

### P6 — O custo é observável antes de ser fatura

**Given** a operação rodando por um mês
**When** alguém pergunta quanto a geocodificação custou
**Then** existe número, e ele é separado por origem: quantos endereços saíram de graça pelo CEP e
quantos foram ao provedor pago (ADR-0044 §3, mitigação 3).

## Requisitos funcionais

### A escada tem três degraus, e cada um só existe porque o anterior não bastou

Esta é a mudança de desenho de 2026-09-01, e ela inverte a cascata da ADR-0044 §3:

| degrau | quem resolve               | quando                                         | custo        |
| ------ | -------------------------- | ---------------------------------------------- | ------------ |
| 1      | **BrasilAPI `/cep/v2`**    | sempre, por rotina de população                | zero         |
| 2      | **provedor fino (Google)** | só quando um humano marca a parada como errada | por endereço |
| 3      | **pino manual**            | quando nem o degrau 2 acertou                  | zero         |

A razão de o CEP ser o primeiro e não o segundo: ele resolve quase sempre — medido inclusive numa
cidade de 11 mil habitantes —, a coordenada dele **já vem no corpo que a API hoje descarta**, e ele
não tem custo nem exceção de licença. Deixar o provedor pago em primeiro faria a instalação pagar por
precisão de telhado em cada endereço, inclusive nos milhares em que a rua já bastava.

⚠️ **Consequência dita por extenso: o provedor pago passa a quase nunca ser chamado.** Isso é a
escolha, não um efeito colateral — o produto roteiriza com precisão de CEP por padrão, e compra
precisão fina só onde alguém olhou e disse que estava errado. Se a operação for concentrada (vários
clientes na mesma rua ou no mesmo CEP), a marca vai ser usada com frequência, e é ela que vai dizer
isso com número.

### Os requisitos

1. **RF1 — Rotina de população.** Varre os endereços de entrega das notas por chave ainda ausente de
   `geocoded_addresses` e resolve pelo degrau 1, em lotes pequenos. Endereço já em base **não é
   tocado**; endereço repetido entre notas é uma chamada, não N.
2. **RF2 — Resolução sob demanda.** Endereço que a rotina ainda não alcançou é resolvido dentro da
   sugestão e gravado. A população adianta trabalho; ela nunca é pré-requisito para sugerir.
3. **RF3 — A escada sobe por marca humana, não por heurística.** O conferente marca a parada como
   errada e **só então** o endereço vai ao provedor fino. Nenhum gatilho automático decide gastar.
4. **RF4 — Coordenada melhor substitui a pior, e o pino manual vence tudo.** É o que
   `shouldReplaceStored` já implementa (`rooftop` > `street` > `postal_code` > `city`, e `manual`
   acima de todos) — o degrau 2 é a cascata usada na direção que ela já sabe ir.
5. **RF5 — A marca que não melhorou precisa dizer isso.** Se o provedor fino devolver precisão igual
   ou pior, `shouldReplaceStored` **recusa a escrita** — e sem aviso o conferente marca, nada muda na
   tela, e ele conclui que a marca não funciona. A resposta é explícita: _"o provedor não fez
   melhor — ajuste o ponto à mão"_, oferecendo o degrau 3.
6. **RF6 — Toda geocodificação pelo provedor pago grava `external_place_id`** não vazio (ADR-0044 §3,
   mitigação 1). O CHECK já cobra no banco; o aceite cobra no adaptador.
7. **RF7 — Provedor pago sem chave configurada não derruba nada.** A marca responde que a precisão
   fina não está disponível e oferece o pino manual. A app sobe sem a chave.
8. **RF8 — Cascata de queda.** Degrau 1 sem resposta desce ao centroide de município; o que não
   resolve em degrau nenhum não entra no mapa de saída, e a parada fica sem coordenada.
9. **RF9 — O CEP geral não se disfarça de quarteirão.** Cidade pequena tem **um CEP para o município
   inteiro**, e o centroide dele é palpite de quilômetros. Gravá-lo como `postal_code` o poria dentro
   da rota — o modo de falha que a ADR-0044 §1 existe para impedir.

   **O discriminador não é palpite sobre os dígitos do CEP; é o `street` da resposta**, medido em
   2026-09-01:

   | CEP         | cidade         | `street`                     | precisão      |
   | ----------- | -------------- | ---------------------------- | ------------- |
   | `14660-000` | Sales Oliveira | `null`                       | `city`        |
   | `14015-000` | Ribeirão Preto | `Rua Visconde do Rio Branco` | `postal_code` |
   | `14801-000` | Araraquara     | `Avenida Presidente Vargas`  | `postal_code` |

   CEP geral não tem logradouro por definição; CEP de logradouro sempre tem. Casar pelo sufixo `-000`
   classificaria a avenida de Araraquara como palpite de município.

10. **RF10 — A marca é registrada, não só executada.** Quem marcou, qual endereço, o que o provedor
    devolveu e se substituiu. Sem isso não há como responder se comprar precisão fina valeu a pena —
    que é a medição que a ADR-0044 §5 pede para afinar o produto.
11. **RF11 — Marcar exige permissão e tem teto.** A marca gasta dinheiro, e
    `geocoded_addresses` **não tem tenant**: o endereço marcado por uma empresa é reconsultado para
    todas. A permissão é a de quem monta viagem (`trip.manage`), e existe limite por janela.

## Requisitos não funcionais

- **RNF1 — Nenhum endereço em log, em nenhum nível.** `security.md` §1 e o comentário que já está na
  `GeocodingPort`. O identificador que rastreia é a `addressKey`. Vale para log de erro do provedor:
  a resposta dele carrega o endereço de volta.
- **RNF2 — A chave do provedor pago é segredo de ambiente**, validada por schema no boot, nunca com
  prefixo `VITE_`.
- **RNF3 — Nada disto entra no caminho de request de vincular nota.** O separador que bipa uma
  etiqueta não espera por rede de terceiro.
- **RNF4 — A rotina de população é gentil.** A BrasilAPI é serviço público e gratuito; lotes
  pequenos, com intervalo, e `AbortSignal`. Rajada de milhares de requisições é bloqueio merecido.
- **RNF5 — `geocoded_addresses` não tem `company_id`, e continua assim.** A coordenada de um endereço
  não é de ninguém. O contrato de tenant safety que a lista como exceção declarada não muda.

## Casos extremos e falhas

| caso                                                  | comportamento                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| endereço já em base                                   | rotina não toca, sugestão não consulta                                  |
| mesmo endereço em cem notas                           | uma chamada, não cem                                                    |
| CEP geral de cidade pequena                           | `city` pelo `street` ausente (RF9)                                      |
| `location` ausente na resposta do CEP                 | degrau não resolve, desce ao município                                  |
| BrasilAPI 429 ou fora do ar                           | rotina para o lote e retoma na próxima janela; sugestão desce a cascata |
| **marca sem chave configurada**                       | responde que a precisão fina não está disponível, oferece o pino        |
| **provedor fino devolve precisão igual ou pior**      | escrita recusada e **dito ao conferente** (RF5)                         |
| **provedor fino não acha o endereço**                 | mesma resposta: nada melhorou, ajuste à mão                             |
| endereço já com pino manual                           | `manual` vence; a marca não o desfaz                                    |
| duas sugestões concorrentes com o mesmo endereço novo | escrita idempotente pela PK; uma chamada extra é aceitável              |
| município sem código IBGE                             | não entra no mapa de saída; parada sem coordenada                       |

## Critérios de aceite

- **CA1** — Com o provedor injetado por **fake de transporte** (não por porta falsa), um endereço
  novo vira linha em `geocoded_addresses` com a origem e a precisão corretas; pelo provedor pago,
  com `external_place_id` preenchido.
- **CA2** — A rotina rodada duas vezes sobre a mesma base faz **zero** chamadas na segunda.
- **CA3** — Repetir a mesma sugestão faz **zero** chamadas ao transporte.
- **CA4** — Transporte que lança faz a cascata descer e a sugestão sair; nenhuma exceção sobe ao
  handler.
- **CA5** — Nenhum teste de aceite desta spec passa com a `GeocodingPort` substituída por objeto
  literal. A costura testada é a do adaptador para baixo — foi assim que a T006 da 058 ficou verde
  sem adaptador.
- **CA6** — **A marca é a única coisa que chama o provedor pago.** Uma sugestão inteira, com
  endereços novos e paradas colidindo na mesma coordenada, faz **zero** chamadas a ele.
- **CA7** — Marca cujo provedor devolveu precisão igual ou pior responde dizendo que nada melhorou e
  oferecendo o pino manual — e a linha em base fica **intacta** (RF5).
- **CA8** — Marca sem chave configurada responde a mesma coisa, sem exceção e sem app derrubada.
- **CA9** — Varredura de log da suíte: nenhum campo de endereço em nenhuma linha emitida.
- **CA10** — Uma sugestão real, ponta a ponta com OSRM de fixture, sai com paradas **dentro** da
  otimização — que é o que hoje é impossível.
- **CA11** — `make check` verde.

## Dúvidas

### D1 — Os provedores e a ordem entre eles ✅ decidido em 2026-09-01

**A BrasilAPI é o degrau primário; o provedor pago é escalada por marca humana.** Isto **inverte a
cascata da ADR-0044 §3**, que punha o Google em primeiro e o CEP como queda — e a inversão pede
adendo na ADR, porque a §3 justificou a escolha do Google como _o_ geocodificador, não como recurso.

O que mudou desde que a ADR foi escrita: mediu-se que a coordenada do CEP **já chega no corpo que a
API descarta hoje**, e que ela resolve até em cidade de 11 mil habitantes. O degrau de graça deixou
de ser teórico.

O que **não** mudou e continua valendo integralmente:

- a coordenada é guardada em base **permanentemente**, e é isso que faz endereço já visto nunca ser
  reconsultado;
- toda coordenada vinda do provedor pago grava `place_id`, e o CHECK do banco a cobra — a mitigação
  da §3 sobrevive à inversão, e passa a cobrir um número **muito menor** de linhas;
- a **exceção de licença** segue assumida por escrito, com exposição bem menor: quase nenhuma
  coordenada em base virá do Google.

Recusado de novo, pelo mesmo motivo da ADR: hospedar geocodificador nosso (Nominatim sobre o mesmo
extract OSM do OSRM). **Não compensa por dinheiro** — as duas camadas têm formatos de chamada opostos:

| camada            | quantas chamadas                       | forma do custo                                       |
| ----------------- | -------------------------------------- | ---------------------------------------------------- |
| matriz de estrada | milhares **por sugestão**              | recorrente e sem teto → hospedar ganha (ADR-0044 §2) |
| geocodificação    | uma por endereço **novo**, para sempre | pagamento único que **decai** conforme a base satura |

Servidor de pé 24/7 é custo fixo que nunca decai. E com a inversão o argumento fica mais forte
ainda: o gasto com o provedor pago tende a quase zero, e nenhum servidor nosso compete com zero.

#### O que exatamente vai para o banco

Precisão importa aqui, porque "guardar os endereços" e o que a tabela faz não são a mesma coisa:

- **vai** — `address_key` (`cityCode|postalCode|number`, a normalização que a 056 já usa), a
  coordenada, a precisão, a origem e o `place_id`;
- **não vai** — nome do destinatário, CNPJ/CPF, razão social, nem o texto do logradouro.

É por isso que `geocoded_addresses` **não tem `company_id`** e isso é defensável: ela diz "este ponto
de entrega existe e fica aqui", sem dizer de quem é. Duas empresas que entregam na mesma rua não
geocodificam duas vezes.

⚠️ E é também por isso que a marca precisa de permissão e de teto (RF11): sem tenant, o endereço que
uma empresa manda reconsultar é reconsultado para todas.

⚠️ **Pendência operacional, não de código:** a chave do provedor pago não existe. Enquanto ela não
existir, tudo funciona **menos** o degrau 2 — a marca responde que a precisão fina não está
disponível e oferece o pino manual. Isso não bloqueia entrega nenhuma desta spec.

### D2 — De onde vem o centroide? ✅ decidido em 2026-09-01

Os degraus 4 e 5 da cascata não tinham fonte de dado em lugar nenhum do repositório.

- **CEP** — a BrasilAPI, no `/cep/v2`. ⚠️ **Nós já chamamos exatamente esse endpoint e jogamos a
  coordenada fora:** `postal-code.gateway.ts` lê os campos de endereço e ignora o
  `location.coordinates` que vem no mesmo corpo. Medido em 2026-09-01 — a resposta traz
  `{"type":"Point","coordinates":{"longitude":"-46.6553299","latitude":"-23.5617698"}}`. O degrau do
  CEP não abre destino externo novo nem paga chamada nova: ele passa a ler um campo que a resposta
  já entrega.

  `location` é **opcional**: o `/cep/v2` responde por vários serviços a montante e nem todos
  devolvem coordenada. Ausência é degrau que não resolve, e a cascata desce ao município — nunca
  coordenada inventada.

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
