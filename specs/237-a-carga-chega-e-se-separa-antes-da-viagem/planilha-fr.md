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
