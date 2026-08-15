# ADR 0033 — O preço de combustível vem do resumo semanal da ANP, em XLSX lido por nós

- Status: aceito
- Data: 2026-08-14
- Decisores: mantenedor do projeto e revisão Opus

## Contexto

A spec 038 deriva o custo por quilômetro do preço do combustível, e por isso precisa de um preço de
referência por UF que se atualize sozinho. O `plan.md` já apontava a ANP como fonte e supunha o
formato: "arquivo em vez de API, CSV em vez de XLSX (dependência)". A sondagem de T000, colada em
`evidence.md`, desmentiu a segunda metade da suposição.

### O que existe de graça

A ANP publica duas séries públicas, e as alternativas de mercado não são alternativas:

- **Base dos Dados** republica a série da ANP em BigQuery, mas exige credencial de projeto Google e
  entra atrás da publicação original.
- **Apify** e afins cobram crédito por execução para raspar o mesmo dado público.
- **Kaggle** tem cópias paradas há anos.

Nenhuma das três é fonte primária: todas são a ANP com atraso, custo ou ambos.

### As duas séries da ANP não servem para a mesma coisa

|                     | Série em CSV                                                        | Série semanal agregada                  |
| ------------------- | ------------------------------------------------------------------- | --------------------------------------- |
| Periodicidade       | **semestral**                                                       | **semanal**, domingo a sábado           |
| Formato             | ZIP → CSV `;`, UTF-8 com BOM, decimal com vírgula                   | **XLSX, sem equivalente em CSV**        |
| Granularidade       | posto, com CNPJ e bandeira                                          | já agregada — aba `ESTADOS`, as 27 UFs  |
| Tamanho             | 8,5 MB comprimidos, **72 MB** abertos, 422.418 linhas no semestre   | **298 KB**, 177 linhas                  |
| Frescor na sondagem | fechada em 30/06, publicada em 03/07 — **até seis meses de atraso** | semana de 09/08 a 15/08, no ar em 14/08 |

O CSV é a série granular para pesquisa; o resumo semanal é o dado operacional. A escolha do plano
otimizava a dependência e sacrificava exatamente aquilo que a feature vende: um preço que acompanha a
bomba. Um custo por quilômetro calculado sobre preço de seis meses atrás não erra por pouco.

### O XLSX não obriga a uma dependência

Um `.xlsx` é um ZIP de XML, e todas as entradas do arquivo da ANP são deflate puro (método 8). O Bun
lê isso com `node:zlib` e o diretório central do próprio ZIP, sem pacote nenhum — provado em T001
sobre o arquivo real: 89.203 bytes de XML da aba `ESTADOS` extraídos com `inflateRawSync`.

Isso importa porque as opções de mercado são ruins. O `xlsx` do SheetJS **saiu do npm** e é
distribuído pelo próprio site — instalar por nome é exatamente o risco de supply chain do
`A03:2025`. O `exceljs` traz um grafo de dependências grande para ler uma tabela de 177 linhas de
formato fixo. Ler um formato conhecido e estável com 150 linhas nossas é menos superfície do que
qualquer das duas.

### O ponto que decide o desenho

**Preço de bomba no varejo é sugestão, não verdade.** O que a ANP publica é média de revenda por
pesquisa de postos — com desvio padrão, mínimo, máximo e número de postos pesquisados na mesma linha.
A transportadora abastece com contrato, desconto de frota e nota própria; o preço dela não é a média
do estado. Então a referência pública **não é o preço da empresa**: é o padrão de partida, sobreposto
pelo valor que a empresa configurar.

## Decisão

### 1. A fonte é o resumo semanal da ANP, aba `ESTADOS`

URL derivável por semana, de domingo a sábado:
`.../precos/arquivos-lpc/<ano>/resumo_semanal_lpc_<domingo>_<sábado>.xlsx`. Semana ainda não
publicada responde **404 com `application/json`** — a ausência chega como erro, não como planilha
vazia, e o cliente trata isso antes de entregar bytes ao parser.

Consequência para T012 e T013: o parser lê **XLSX**, não CSV. O contrato usa o cabeçalho da linha 7 —
há seis linhas de preâmbulo institucional antes dele —, e a tradução de produto é a da série semanal
(`OLEO DIESEL S10`, `OLEO DIESEL`, `GASOLINA COMUM`, `ETANOL HIDRATADO`, `GNV`).

### 2. O leitor de XLSX é nosso, sem dependência nova

ZIP pelo diretório central + `inflateRawSync` + varredura do XML de uma aba. Cabeçalho inesperado
aborta o ciclo em vez de gravar — é a proteção contra a ANP mudar a planilha sem avisar, que é o
modo de falha real de fonte de terceiro.

### 3. O S-500 é reconhecido pela ausência do sufixo, e isso fica escrito

Nenhuma das duas séries escreve "S-500". O produto aparece como `OLEO DIESEL` seco, e só a nota do
preâmbulo diz que é o B S500 comum. A tabela de tradução carrega esse mapeamento com o motivo ao
lado, porque um parser que procure `S500` não acha nada e deixa o produto sem preço, calado.

### 4. A cobertura não é retangular, e o vazio é um estado legítimo

Na semana sondada o GNV tinha **17 UFs**, não 27; óleo diesel e etanol hidratado, 26. Produto ausente
para uma UF não é falha do ciclo: os outros gravam, e a tela diz que não há preço publicado em vez de
mostrar zero.

### 5. A referência pública nunca sobrescreve o valor da empresa

O preço da ANP entra como padrão. O valor configurado pela empresa vence sempre, e a tela mostra qual
dos dois está valendo.

## Consequências

- O trilho é semanal de verdade, e não há dependência nova em nenhuma das quatro apps.
- O leitor de XLSX é código nosso e precisa de fixture do arquivo real no teste — sem isso, ele é uma
  suposição sobre bytes de terceiro.
- Não há sondagem barata de frescor: o host da ANP responde **403 a `HEAD`** e não manda
  `Last-Modified`. O ciclo baixa os 298 KB e decide pela semana que veio **no dado**, não pelo
  cabeçalho HTTP. A chave natural `(semana, produto, UF)` é o que torna reexecução um no-op.
- Se a ANP mudar o layout da planilha, o ciclo falha ruidosamente e a referência anterior fica de pé.
  É o comportamento correto para um número que vai virar custo — o oposto do erro silencioso descrito
  na [ADR-0034](0034-aliquota-de-ipva-existe-em-27-leis.md).
- A série semestral em CSV continua sendo a fonte certa para qualquer análise por posto ou por
  município. Esta ADR não a descarta; ela só não alimenta o cron.
