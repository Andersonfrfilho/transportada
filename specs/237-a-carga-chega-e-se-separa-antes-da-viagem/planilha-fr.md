# O layout da planilha de prévia `FR` (analisado em 2026-10-03)

Fonte: três arquivos reais do contratante (`FR-28-09.xlsm`, `FR-01-10.xlsm`, `FR-05-10.xlsm`), lidos como OOXML
(zip + XML), sem executar macro nem avaliar fórmula. **Nomes de destinatários e endereços não são reproduzidos
aqui.** Os arquivos originais ficam fora do repositório; as fixtures de teste da Fase 4 serão **anonimizadas**.

## Estrutura

- Formato `.xlsm` (contém `vbaProject`): **a macro nunca roda nem é lida**.
- Duas abas: **`IMPORTAÇÃO`** (os dados) e **`RESULTADO`** (tabela dinâmica derivada, com `#NAME?` no valor em
  cache) — a segunda **se ignora**.
- `IMPORTAÇÃO`: cabeçalho na **linha 4**; ~13,8 mil linhas reservadas, **107–194 preenchidas** (ler até a
  última linha com dado). Algumas linhas trazem só `RouteName` + `RoutingDate`: **cabeçalho de rota, não
  nota** (um por rota).

| Coluna | Cabeçalho     | Significado (leitura)                                                                        | Exemplo (sem PII)                  |
| ------ | ------------- | -------------------------------------------------------------------------------------------- | ---------------------------------- |
| A      | `RouteName`   | **roteiro do contratante** (`FR.<região>`)                                                   | `FR.S.CAR`, `FR.R.PRE`, `FR.FRANC` |
| B      | `RoutingDate` | data do roteiro, serial do Excel                                                             | `46297` = 02/10/2026               |
| C      | `Text001`     | **identificador do contratante** (pedido/ordem dele, 6 dígitos) — **não é o número da NF-e** | `815358`                           |
| D      | `Company`     | código do destinatário no contratante                                                        | `42647`                            |
| E      | `CompanyName` | razão social do destinatário                                                                 | (omitido)                          |
| F      | `PESO TOTAL`  | peso em kg                                                                                   | `138.7`                            |
| G      | `VOLUME(M3)`  | volume em m³                                                                                 | `0.26`                             |
| H      | `VALOR`       | valor da nota                                                                                | `1780.62`                          |
| I      | `ENDEREÇO`    | logradouro + número (sem acento, caixa alta)                                                 | (omitido)                          |
| J      | `Comment16`   | bairro (pode faltar: 1 linha em 2 dos 3 arquivos)                                            | (omitido)                          |
| K      | `City`        | cidade (sem acento, caixa alta)                                                              | `SAO CARLOS`                       |
| L      | `State`       | UF                                                                                           | `SP`                               |
| M      | `PostalCode`  | CEP, 8 dígitos                                                                               | (omitido)                          |

**Não há** número de NF-e, chave de acesso (44 dígitos), série nem CNPJ do emitente. `Text001` é o número
**do contratante** (correção do usuário em 2026-10-03: o número que a planilha traz é do cliente, não da nota).
O vínculo é **por conteúdo**: entre as notas **do emitente do perfil**, valor + CEP + destinatário (+ cidade e
peso); `Text001` só ajuda se aparecer na NF-e (informações adicionais ou pedido de compra `xPed`).

## Números medidos

| Arquivo    | Recebido em | `RoutingDate` | Notas | Roteiros | Cidades | Peso   | Valor        |
| ---------- | ----------- | ------------- | ----- | -------- | ------- | ------ | ------------ |
| `FR-28-09` | 25/09 16:33 | 25/09         | 107   | 8        | 41      | 23,7 t | R$ 201,4 mil |
| `FR-01-10` | 30/09 14:54 | 30/09         | 191   | 12       | 56      | 20,6 t | R$ 321,4 mil |
| `FR-05-10` | 02/10 14:06 | 02/10         | 194   | 11       | 59      | 22,0 t | R$ 360,8 mil |

- Todas as notas são de **SP**; `Text001` tem sempre **6 dígitos**; **nenhum valor se repete** dentro de um
  arquivo.
- **Nenhuma nota aparece em dois arquivos** (interseção 0): cada planilha é um **lote novo**, não acumulativo.
  O mesmo número não precisa ser deduplicado entre prévias; a idempotência é pelo hash do anexo.
- `RoutingDate` = dia em que o e-mail chegou; **o dia do nome do arquivo (28/09, 01/10, 05/10) é o dia
  planejado** — o próximo dia útil (25/09 sexta → 28/09 segunda; 30/09 quarta → 01/10 quinta; 02/10 sexta →
  05/10 segunda). A prévia chega **um dia útil antes**.
- Roteiros por arquivo: 8, 12 e 11 (`FR.R.PRE`, `FR.FRANC`, `FR.BARRE`, `FR.S.CAR`, `FR.MATAO`...). Uma rota
  pode ter 1 nota (`FR.R.PR2` no primeiro arquivo) ou 32 (`FR.S.CAR` no último).
- Uma cidade pode estar em mais de um roteiro; um roteiro cobre várias cidades.

## O que isso decide no desenho (reflexo na spec 237)

1. **Mapeamento por nome de coluna**, nunca por posição (o contratante pode reordenar; o perfil guarda o mapa).
2. **Vínculo por conteúdo** (valor, CEP, destinatário, cidade, peso) **dentro do universo de um contratante**,
   com `ambiguous`/`suggested` explícitos e confirmação do operador; nunca vínculo silencioso (RF5/RF5a).
3. **Os grupos do contratante (`RouteName`) são o ponto de partida da recomendação de viagens**, e a proposta
   do roteirizador é a segunda visão (RF7).
4. **A separação no celular** agrupa por **rota × cidade**, que é como a planilha já vem (US P1).
5. **O momento do recebimento do e-mail** precisa ser gravado: o relógio da comparação com o XML (item 7 do
   usuário) e o do "dia planejado" dependem dele.

## Pendente: comparar recebimento do e-mail × chegada do XML

`consulta-recebimento-vs-xml.sql` (somente leitura, 492 linhas com valor, CEP e peso) responde, por
planilha: quantas linhas achariam **uma** nota só por valor + CEP, quantas ficariam ambíguas, se `Text001`
aparece nas informações adicionais, e se o e-mail chegou **antes** ou **depois** do XML. Não foi executada na sessão (leitura em
produção bloqueada). Quem tiver acesso ao banco desejado a roda e traz o resultado: com ele a Fase 4 já nasce
sabendo se a prévia chega **antes** (e a nota fica `awaiting_xml`) ou **depois** do XML (e nasce `matched`).

## Comparação com XMLs reais (2026-10-03)

Dois corpos de XML do emitente desse contratante: **346 notas de 07/07 a 28/08** (`tmp/nfe-fixture/`, sem
nenhuma nota das planilhas) e **277 notas de 23/09 e 25/09** (`ID1026570_procNFe_parte1`, a pasta que o
usuário mandou, **parte 1** de uma exportação maior), séries e emitente iguais. Comparadas com `FR-24-09`
(187 linhas, `RoutingDate` 23/09) e `FR-28-09` (107 linhas, e-mail de 25/09 16:33). As planilhas `FR-01-10` e
`FR-05-10` não têm XML nessa pasta (os XMLs de 30/09 e 02/10 não foram enviados). Método reproduzível: ler
`infNFe` de cada XML (`nNF`, `vNF`, `dest/CEP`, `dest/xNome`, `transp/vol/pesoB`, `infAdic/infCpl`) e cruzar com
as linhas.

### O que não está no XML

- **`Text001` não aparece em nenhum XML** (0 de 187 e 0 de 107 linhas; texto bruto, atributos incluídos).
- **O código do cliente (`Company`, coluna D) também não aparece** (0 ocorrências). O XML **não carrega** os
  códigos do contratante; só `LACRE`, `NroCarga` e, em parte, o pedido do destinatário (`xPed`).
- `Text001` (782.100–821.804) não é o `nNF` (852.674–899.884): faixas separadas.

### O que liga a linha à nota: o conteúdo (medido)

| Chave (linha × XML)                 | FR-24-09 (187) | FR-28-09 (107) |
| ----------------------------------- | -------------- | -------------- |
| valor + CEP → **uma** nota          | **139** (74%)  | **96** (90%)   |
| valor + **peso** → **uma** nota     | **146** (78%)  | **91** (85%)   |
| valor + CEP: mais de uma nota       | 0              | 2              |
| valor + peso: mais de uma nota      | 4              | 6              |
| sem nota (XML não está nessa pasta) | 37–48          | 9–10           |

- **O peso é exato:** `PESO TOTAL` da linha = `pesoB` do XML, **desvio 0** (mediana e p90); `VALOR` =
  `vNF` ao centavo; a cidade bate em **100%** dos vínculos. O **nome** do destinatário bate só em 115 de 139 (a
  razão social da planilha diverge): **não serve de chave obrigatória**, só de reforço.
- Linhas sem candidata por valor + CEP (48) que têm **o mesmo valor e peso** num XML do mesmo destinatário, com
  CEP diferente: o CEP da planilha pode ser o de entrega. Por isso **nenhuma chave isolada é obrigatória**:
  vale o **conjunto** (valor + peso + CEP + cidade + destinatário) com escore.
- Os XMLs não vinculados provavelmente estão nas outras partes da exportação (277 XMLs para 187 + 107 linhas
  que cobrem dois dias); **a taxa real só sai com o conjunto completo.**

### O que o XML tem de útil: `NroCarga` e `LACRE`

- Todos os 277 XMLs trazem `LACRE` e `NroCarga` nas informações adicionais. **3 lacres e 18 cargas.**
- **`NroCarga` ↔ `RouteName` é 1:1** (medido nas notas vinculadas): FR-24-09 → 10 cargas × 10 roteiros; FR-28-09
  → 8 × 8; cada roteiro tem exatamente uma carga e vice-versa. **A carga do XML é o roteiro da planilha.**
- O **lacre** reúne várias cargas (o caminhão): 3 lacres para 18 cargas, emitidas em 3 horários (19h, 20h e
  23h). **Decisão do usuário: 1 prévia = 1 chegada;** o lacre é só informação de apoio.

### Os totais fecham por roteiro e por carga, e uma NF junta vários pedidos

- **Soma de valor e de peso por `RouteName` = soma por `NroCarga`, ao centavo**, em 8 de 10 roteiros
  (`FR-24-09`) e 7 de 8 (`FR-28-09`); o nº de notas só difere quando há **mais linhas do que notas** (ex.:
  `FR.BARRI`: 20 linhas, 16 notas, **mesmo valor e mesmo peso**).
- **Explicação medida: uma NF pode juntar vários pedidos (`Text001`) do mesmo cliente.** Agrupando as linhas
  por cliente e somando, o valor e o peso fecham numa nota em **13/14**, **22/24**, **23/25** e **10/10**
  clientes dos roteiros testados (ex.: 2.664,00 + 1.243,56). O inverso também ocorre: o mesmo cliente com duas
  NF separadas, cada uma fechando com **uma** linha. Logo o vínculo é **n linhas ↔ 1 nota** (RF5a, nível 3).
- A planilha **não traz `NroCarga`** (nem o lacre) em nenhuma célula das duas abas; o `NroCarga` só existe no
  XML. O par `RouteName` ↔ `NroCarga` vem do encaixe dos totais e vale **por prévia** (o `NroCarga` muda a
  cada dia; o `RouteName` se repete).

### Tempo: a prévia chega **antes** do XML (item 7 do usuário)

- FR-28-09: e-mail às **16:33** de 25/09; as **91 notas** vinculadas foram **emitidas 2,7 a 4,2 h depois**
  (mediana 2,9 h) — **todas depois**, nenhuma antes. As emissões ocorrem à noite (19h, 20h, 23h).
- Logo, no momento em que a prévia chega, **nenhuma nota tem XML**: todos os itens nascem `awaiting_xml` e o
  vínculo acontece **quando cada XML é importado** (horas depois). **Esse é o fluxo principal, não a exceção.**
- O instante em que o XML entra no **nosso** sistema (`created_at`) depende da importação (distribuição ou
  upload) e é ainda mais tarde: a consulta SQL mede isso no banco.

### O que o desenho tem de garantir

1. Vínculo **por grupo e por soma** (roteiro ↔ carga, depois cliente, depois n linhas ↔ 1 nota), nunca por
   número do cliente (RF5a).
2. **`Company` ↔ CNPJ do destinatário é 1:1** (212 códigos aprendidos pelo conteúdo, **0 conflitos**, nenhum
   CNPJ com dois códigos): vale guardar o par e usá-lo dali em diante.
3. **`RouteName` ↔ `NroCarga` é 1:1 e vale por prévia**: o par sai do encaixe dos totais e restringe os
   candidatos (só as notas daquela carga).
4. O vínculo é **assíncrono**: nasce quando o XML chega, e a tela mostra "esperando o XML" por item.

## Pendente

Rodar `consulta-recebimento-vs-xml.sql` no banco (somente leitura) para o **conjunto completo** de XMLs e
confirmar a taxa e o `created_at` real; e os XMLs de 30/09 e 02/10 para `FR-01-10` e `FR-05-10`.
