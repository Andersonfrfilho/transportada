# 045 — A região do motorista tem valor

## Problema

O cadastro de motorista sabe o nome, o CPF, a CNH, o telefone e os veículos. Não sabe **onde ele
roda**. Quem monta a viagem descobre isso perguntando, ou de cabeça.

E o que a transportadora paga por essa viagem vive num PDF (`TABELA DE FRETE`): 29 rotas em oito
famílias — Ribeirão Preto (matriz), Barretos, São Carlos, Mococa, Porto Ferreira, Jaboticabal,
Ituverava, Franca —, cada família em quatro zonas acumulativas, 84 cidades, e um valor por zona para
cada uma de seis classes de veículo (UTILITÁRIO, VAN/HR, VUC/VLC, 3/4, TOCO, TRUCK). Uma planilha
impressa não é consultável pelo produto, não tem histórico e não vale duas instalações.

O que existe hoje de precificação **não serve** para isso: `freight_rule_versions` é percentual sobre
o valor da NF-e, filtrado por UF de destino e CNPJ do remetente. Percentual sobre nota não é valor
fixo por rota, e UF não é zona — São Paulo inteiro é uma UF só, e a tabela tem 29 preços dentro dela.

## Objetivo

O cadastro de motorista diz em que regiões ele trabalha, e a empresa consulta no produto quanto se
paga por viagem em cada região, por classe de veículo.

## Decisões

**O valor é custo, não receita.** A tabela é o que a transportadora **paga ao motorista/agregado**
por viagem — não o que cobra do cliente. Por isso a coluna se chama `driver_amount` e a tabela
`freight_region_driver_rates`, e por isso ela não encosta em `freight-rules`, `freight_calculations`
nem no CT-e. Nome que mente sobre o lado do caixa é o tipo de erro que só aparece no fechamento.

**A região é cadastro da empresa, nunca constante do produto.** O TransportAdA é genérico
(ADR-0021): a tabela de Ribeirão Preto não entra em `src/`. As 29 rotas viram CRUD + importação por
arquivo, e os dados do PDF ficam em `specs/045-.../data/*.csv`, fora do código. Outra transportadora
sobe a tabela dela pela mesma porta.

**A cidade não é única por empresa.** BARRINHA/SP está em `1.000 Barretos Zona 1` **e** em
`5.000 Jaboticabal Zona 1` — a mesma cidade servida por duas rotas com preços diferentes (R$ 540 e
R$ 480 na VAN). Um `unique (company_id, city)` recusaria a tabela real do cliente na importação. A
unicidade é `(company_id, region_id, city, state)`.

**A zona é acumulativa, e isso vive no domínio.** A coluna OBSERVAÇÃO do PDF diz "Todas da Zona 1,
2, mais Zona 3". Guardar a redundância (repetir as cidades da zona 1 dentro da zona 3) faria a
mesma cidade nascer em quatro linhas da mesma família, e um preço só valeria. Guarda-se a zona
própria de cada cidade; `coversRegion` resolve a cobertura comparando família e zona.

**A cobertura do motorista mistura zona e cidade solta.** Ele pode acrescentar `1.002 Barretos
Zona 3` inteira **e** `MATÃO/SP` isolada. Uma tabela `fleet_driver_regions` com discriminador
`scope` (`region` | `city`): `region` cobre a zona e as abaixo dela, `city` cobre uma cidade só.
Duas tabelas separadas dariam duas listagens e duas telas para uma pergunta só ("onde ele roda?").

**A classe de frete não é o tipo de rodado.** ⚠️ `wheelType` é o `tipoRodado` do MDF-e, código da
SEFAZ que vai para dentro do XML: `01 Truck · 02 Toco · 03 Cavalo mecânico · 04 VAN · 05 Utilitário ·
06 Outros`. Quatro das seis colunas do PDF têm código lá; **VUC/VLC e 3/4 não existem na tabela da
SEFAZ**, e inventar `07`/`08` faz o MDF-e ser rejeitado na transmissão — o `check` de
`fleet_vehicles` já amarra o rodado à `role = 'traction'` por isso.

Então a classe é campo próprio, `freight_class`, ao lado do rodado na mesma tela e **derivado dele
por padrão**: `01 → truck`, `02 → toco`, `04 → van`, `05 → utility`. Só `03` e `06` (onde VUC e 3/4
se escondem hoje) exigem escolha do operador. A frota já cadastrada não fica em branco, e o XML
fiscal continua com o código que a SEFAZ publica.

**A importação é aditiva e idempotente.** A chave natural é `(company_id, code)` para a região e
`(company_id, region_id, freight_class)` para o valor: reimportar a mesma tabela atualiza, não
duplica. Região que sumiu do arquivo **não é apagada** — vai a `inactive`, porque motorista pode
estar ligado a ela e apagar em silêncio quebraria o cadastro dele.

## Fora de escopo

- **Calcular o pagamento de uma viagem.** Esta spec entrega o cadastro e o valor consultável; casar
  viagem + motorista + veículo + região e emitir o valor a pagar é spec própria, com o módulo
  `trips` na mesa.
- **Cobrança do cliente.** A regra percentual de `freight-rules` fica como está.
- **Cidade validada contra IBGE.** A cidade é texto normalizado; amarrar ao código IBGE é melhoria
  posterior e não muda o modelo.
- **Selecionar motorista no bloco de proprietário do veículo agregado** — defeito reportado à parte,
  fila própria.

## Critérios de aceite

1. `freight_regions`, `freight_region_cities` e `freight_region_driver_rates` existem com
   `company_id`, migration aditiva e `rollback.sql` ao lado.
2. `test/freight-regions-schema/tenant-safety.contract.ts` prova que as três tabelas filtram por
   tenant, e que a mesma cidade pode existir em duas regiões da mesma empresa.
3. `GET/POST/PUT/DELETE /freight-regions` sob `settings.manage`, escopo `company`, com o valor por
   classe no mesmo corpo da região.
4. `coversRegion` responde que `1.002 Barretos Zona 3` cobre as zonas 1, 2 e 3 de Barretos, e não
   cobre zona 4 nem outra família.
5. `fleet_drivers` ganha cobertura: `GET/PUT /fleet/drivers/{id}/regions` aceita entradas de escopo
   `region` e `city` na mesma lista, e recusa `city` sem cidade.
6. `fleet_vehicles.freight_class` existe com as seis classes do PDF; a migration preenche a frota
   pelo rodado (`01→truck`, `02→toco`, `04→van`, `05→utility`) e deixa `03`/`06` sem classe.
7. `POST /freight-regions/import` recebe o CSV, cria e atualiza por chave natural, inativa o que
   sumiu, e devolve o resumo (`created`, `updated`, `deactivated`) — reimportar o mesmo arquivo
   devolve `created: 0`.
8. Frontend: aba **Regiões** no módulo `fleet`, guardada por `settings.manage`, com a tabela de
   regiões (código, nome, zona, cidades, valor por classe) seguindo `docs/frontend/data-tables.md`.
9. Frontend: o formulário de motorista tem o campo de cobertura, somando zonas e cidades soltas.
10. Frontend: o formulário de veículo tem **Classe de frete** ao lado de **Tipo de rodado**, com o
    valor sugerido pelo rodado e editável.
11. Texto pt-BR acentuado nos dois `*.locale.json` — `locale-accents` verde.
12. `make check` completo verde, `make migration-test` verde.

## Riscos

**A classe de frete nasce vazia em quem hoje é `03` ou `06`.** Cavalo mecânico e "Outros" somam a
maior parte de uma frota de carga, e a tela vai pedir a classe deles um a um. É aceito: a alternativa
— chutar TRUCK para todo cavalo mecânico — poria um valor de pagamento errado no cadastro sem
ninguém saber.

**As abreviações do PDF foram expandidas na transcrição** ("AMÉRICO BRASIL." → Américo Brasiliense,
"CÁSSIA DOS COQ." → Cássia dos Coqueiros, "SANTA R. DO P. QUATRO" → Santa Rita do Passa Quatro, e
mais seis). Se alguma expansão estiver errada, o erro está no CSV da spec, não no produto — e se
corrige reimportando.

**A tabela do PDF não tem data.** Ela entra como está e passa a valer indefinidamente; reajuste é
reimportação, sem histórico de vigência. Versionar o valor (como `freight_rule_versions` faz) é
melhoria que este cadastro comporta depois, e que a chave natural já não atrapalha.
