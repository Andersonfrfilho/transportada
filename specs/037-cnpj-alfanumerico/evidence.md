# 037 — Evidência

## T000 — a norma ✅

Consultado em 14/08/2026. Três fontes, duas delas primárias.

| #   | Fonte                     | Documento                                                                                                                                                       |
| --- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Receita Federal do Brasil | _Novo CNPJ Alfanumérico — Perguntas & Respostas_ (`gov.br/receitafederal/.../cnpj/cnpj-alfanumerico.pdf`)                                                       |
| F2  | SERPRO                    | _Cálculo dos dígitos verificadores de CNPJ alfanumérico_ (`serpro.gov.br/menu/noticias/videos/calculodvcnpjalfanaumerico.pdf`)                                  |
| F3  | ENCAT / SEFAZ             | _Nota Técnica Conjunta CNPJ Alfanumérico — NT 2025.001_, v1.00 de 25/04/2025 (`nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=5ZkvIZt10mQ=`), 15 páginas |

### (a) Estrutura e valor do caractere

> **F3, item 2** — "O novo número de identificação — CNPJ alfanumérico — terá o mesmo tamanho que o
> número atual, com 14 posições. As oito primeiras posições terão caracteres alfanuméricos (letras e
> números) e identificarão a raiz do novo número. As quatro posições seguintes à raiz também terão
> caracteres alfanuméricos (letras e números) e identificarão a ordem do estabelecimento a ser
> inscrito. As duas últimas posições serão numéricas e identificam os dígitos verificadores deste
> CNPJ alfanumérico."

> **F3, item 2** — "Na rotina de cálculo do Dígito Verificador (DV) no CNPJ, serão substituídos os
> valores numéricos e alfanuméricos pelo valor decimal correspondente ao código constante na tabela
> ASCII e dele subtraído o valor 48. Desta forma os caracteres numéricos continuarão com os mesmos
> montantes, e os caracteres alfanuméricos terão os seguintes valores: A=17, B=18, C=19… e assim
> sucessivamente. Esta definição permitirá que o atual número do CNPJ tenha o mesmo cálculo do seu
> dígito verificador quando os sistemas iniciarem a identificação alfanumérica."

F2 traz a tabela completa `0`→0 … `9`→9, `A`→17 … `Z`→42. F1 (pergunta 14) traz a mesma tabela.
**Confirmado: o valor é `charCodeAt(0) - 48`.** O Anexo I de F3 escreve isso literalmente como
`static valorBase = "0".charCodeAt(0)`.

### (b) DV do CNPJ — pesos e resto

> **F2, item 1** — "Os dígitos verificadores (DV) são calculados a partir dos doze primeiros
> caracteres em duas etapas, utilizando o módulo de divisão 11 e pesos distribuídos de 2 a 9."
> "Distribuir os pesos de 2 a 9 da direita para a esquerda (recomeçando depois do oitavo caracter)."
> "Se o resto da divisão for igual a 1 ou 0, o primeiro dígito será igual a 0 (zero). Senão, o
> primeiro dígito será igual ao resultado de 11 − resto."

O 2º DV repete o processo sobre 13 caracteres (os 12 + o 1º DV). O Anexo I de F3 traz o vetor
único `pesosDV = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]`, com o 1º DV usando `pesosDV[i+1]` e o
2º usando `pesosDV[i]` — é a mesma coisa escrita de forma compacta, e é a forma que vamos
implementar.

### (c) DV da chave de acesso

> **F3, item 5** — "A expressão regular que verifica a chave de acesso passa a suportar letras nas
> 12 primeiras posições do CNPJ: `[0-9]{6}[A-Z0-9]{12}[0-9]{26}`"

> **F3, item 5, "Cálculo do DV da Chave de Acesso"** — "O cálculo do DV da chave de acesso deverá
> aplicar a mesma lógica da validação do CNPJ Alfa, trocando todos os caracteres (44) que compõe a
> chave (números e letras) pelos números correspondentes da tabela ASCII subtraindo 48.
> Posteriormente à substituição, deverá ser aplicado o cálculo do Modulo 11 para a totalidade dos
> dígitos resultantes da chave de acesso."

O Anexo II de F3 (VB.NET) fecha a ambiguidade que a spec apontava como o ponto a confirmar: os
pesos **continuam 2→9 ciclando da direita para a esquerda** sobre as 43 posições, e só o valor do
caractere muda.

```vbnet
chAcessoBytes(i) = CByte(Asc(chaveAcesso(i)) - 48)
Dim peso As Integer = 2  ' multiplicador vai de 9 a 2
For i = 42 To 0 Step -1
    soma = soma + chAcessoBytes(i) * peso
    peso += 1 : If peso > 9 Then peso = 2
Next
Dim dv As Integer = 11 - (soma Mod 11)
If dv >= 10 Then dv = 0
```

`dv >= 10 → 0` cobre resto 0 (dv 11) e resto 1 (dv 10) — é **exatamente** o `remainder < 2 ? '0'`
do `calculateModulo11` que já existe em `SefazChave.ts:66-67`. A lógica de resto do pacote está
certa hoje; o que está errado é só o mapeamento de valor.

### (d) Expressão regular do CNPJ

> **F3, item 4** — "A expressão regular que valida um campo do tipo CNPJ passa a aceitar letras
> maiúsculas nas primeiras 12 posições: `[A-Z0-9]{12}[0-9]{2}`"

### (e) Conferência do algoritmo contra o exemplo oficial

Exemplo publicado por F1 (pergunta 14) e F2 (item 1.2), idêntico nos dois: **`12.ABC.345/01DE-35`**.
F2 mostra o caminho todo — valores `1 2 17 18 19 3 4 5 0 1 20 21`, pesos `5 4 3 2 9 8 7 6 5 4 3 2`,
soma **459**, `459 mod 11 = 8`, 1º DV `= 11−8 = 3`; depois soma **424**, `424 mod 11 = 6`,
2º DV `= 11−6 = 5`.

Implementação de referência executada em `bun` contra a norma:

```
--- CNPJ: exemplo oficial RFB/SERPRO 12.ABC.345/01DE-35 ---
calculado: 35 | esperado: 35

--- CNPJ numérico real (não-regressão) ---
11222333000181 -> DV calculado 81 | DV real 81 OK
19131243000197 -> DV calculado 97 | DV real 97 OK
00000000000191 -> DV calculado 91 | DV real 91 OK
```

Para o DV da chave, a norma não publica exemplo trabalhado. A compatibilidade retroativa foi
provada por equivalência exaustiva contra a implementação atual do `fiscal-provider`:

```
chaves numéricas aleatórias testadas: 200000 | divergências: 0
```

Ou seja: para toda chave puramente numérica, o cálculo novo devolve o mesmo DV que o
`calculateModulo11` de hoje. O algoritmo novo é superconjunto estrito do atual — é o que autoriza
trocar um pelo outro sem risco no acervo existente.

Com CNPJ alfanumérico, o mesmo par de entradas:

```
chave: 35260812ABC34501DE35550010000000011152191428
CNPJ nas posições 6..17: 12ABC34501DE35
DV legado sobre a mesma base (parseInt em letra): NaN
```

### (f) Correções à spec, decorrentes da leitura

1. **A exclusão de letras não é norma.** F3, item 4, traz a ressalva: _"Algumas letras não devem
   ser aceitas no CNPJ Alfa, como I, O, U, Q e F, essa exclusão faz parte das solicitações feitas
   pela equipe técnica do ENCAT para a Receita Federal do Brasil **e precisa ser confirmada**."_ A
   expressão regular publicada é `[A-Z0-9]{12}[0-9]{2}`, com as 26 letras, e F1 (pergunta 1) diz
   "quaisquer uma das 26 letras de A até Z". **Decisão: aceitar A–Z inteiro.** Nós somos, antes de
   tudo, receptores de documento de terceiro; recusar uma letra que o autorizador aceitou seria
   inventar regra. Fontes secundárias que afirmam a exclusão como fato estão erradas.

2. **A máscara a remover é exatamente `[./-]`.** F3, Anexo I: `regexCaracteresMascara = /[./-]/g` e
   `regexCaracteresNaoPermitidos = /[^A-Z\d./-]/i`. O plano previa remover espaço também — fica,
   por conveniência de entrada de formulário, mas o conjunto normativo é esse.

3. **`00000000000000` é inválido por definição** (F3, Anexo I: `cnpjZerado`). A primitiva precisa
   rejeitá-lo explicitamente — e isso é exatamente o que o `padStart(14, '0')` de
   `SefazChave.ts:28` fabrica quando recebe um CNPJ alfanumérico curto.

4. **O código de barras precisa de mais atenção do que a spec supôs.** F3, item 6, é explícito:
   _"O CODE-128C tem como característica suportar somente números, portanto, não é compatível com
   uma chave de acesso que venha possuir caracteres alfanuméricos nas posições do CNPJ"_ — e a NT
   publica as regras de alternância entre Code Set C e Code Set A. Já estava verificado
   empiricamente que o `bwip-js` faz essa alternância sozinho, então **a conclusão da spec não
   muda** (nenhuma linha de código), mas a T018 ganha um caso de teste: renderizar uma chave
   alfanumérica e conferir que o símbolo sai com troca de conjunto, em vez de confiar na
   observação anterior.

5. **Observação lateral, fora do escopo desta spec:** duas chaves de fixture do repositório têm DV
   inválido (`31260712345678000195570010000000021000000029` calcula DV `8`, não `9`;
   `…031000000030` calcula `3`, não `0`). Fixtures não são obrigadas a ter DV válido e nada depende
   disso hoje — mas se a validação de DV vier a ser ligada na API, esses dois quebram.

**Verificação:** os quatro itens da T000 registrados, com fonte e data. Fase A liberada.

## T001 — contrato da primitiva, escrito antes ✅

`adatechnology-packages/packages/backend/fiscal-provider/test/contract/sefaz-tax-id.contract.test.ts`.

⚠️ **Correção de caminho:** a task dizia `test/unit/`, mas o pacote não tem `test/unit/` — a
convenção é `test/contract/*.contract.test.ts`, que é o que o script `test:contract`
(`bun test test/contract`) executa. Um arquivo em `test/unit/` não rodaria em lugar nenhum.
`tasks.md` corrigida.

Primeira execução, com a primitiva ainda inexistente — vermelho pelo motivo certo:

```
error: Cannot find module '../../src/sefaz/SefazTaxId'
```

## T002 — a primitiva ✅

`fiscal-provider/src/sefaz/SefazTaxId.ts`, com `charValue`, `normalizeTaxId`, `calcularDvCnpj`,
`calcularDvChave`, `isCnpjValid`, `CNPJ_PATTERN` e `CHAVE_PATTERN`.

```
$ bun test test/contract/sefaz-tax-id.contract.test.ts
 22 pass
 0 fail
 39 expect() calls
```

## T003 — linha de base do XML numérico ✅

Três arquivos, nenhuma linha de `src/` tocada:

| Arquivo                                               | Papel                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `test/fixtures/xml-numeric-baseline.fixture.ts`       | entradas fixas (CNPJ `11222333000181`, emissão `2026-08-14T18:30:00Z`) e `maskRandomCode()` |
| `test/fixtures/xml-numeric-baseline.golden.ts`        | o XML capturado hoje, antes de qualquer mudança em builder                                  |
| `test/contract/xml-numeric-baseline.contract.test.ts` | o contrato                                                                                  |

`cNF`/`cCT`/`cMDF` são aleatórios por exigência do manual e o DV depende deles, então só essas duas
posições saem do congelamento. **As 35 primeiras posições da chave ficam literais** — é exatamente
onde o CNPJ mora (6..19), e é o que a fase A pode quebrar:

```
NFE_BASELINE_KEY_PREFIX  = '35260811222333000181550010000000011'
CTE_BASELINE_KEY_PREFIX  = '35260811222333000181570010000000011'
MDFE_BASELINE_KEY_PREFIX = '35260811222333000181580010000000011'
```

Verde antes de qualquer mudança em builder, como a task exige:

```
$ bun test test/contract/xml-numeric-baseline.contract.test.ts
 7 pass
 0 fail
 17 expect() calls
```

**A linha de base morde.** Um golden que nunca falha não protege nada, então foi perturbado um
builder de propósito (`CteXmlBuilder`, `mod` de `'57'` para `'58'`) e o contrato reprovou nas duas
frentes — prefixo da chave e XML:

```
Expected: ...Id="CTe35260811222333000181570010000000011«RND»«DV»"...
Received: ...Id="CTe35260811222333000181580010000000011«RND»«DV»"...
 5 pass
 2 fail
```

Perturbação revertida (`git status` do `CteXmlBuilder.ts` limpo) e suíte inteira do pacote:

```
$ bun test test/contract
 154 pass
 0 fail
 445 expect() calls

$ bun run check     # tsc --noEmit
(sem saída)
```

## T004 — uma implementação de módulo 11, nenhum `padStart(14)` ✅

`SefazChave.ts`, `CteXmlBuilder.ts` e `MdfeXmlBuilder.ts` — **16 inserções, 47 remoções**. As três
cópias privadas do módulo 11 (`calculateModulo11`, dois `calcDigitoVerificador`) foram apagadas e
os três sítios passam por `calcularDvChave`. `isChaveDvValid` também: continua normalizando por
dígito nesta task (é a T006 que troca a validação por `CHAVE_PATTERN`), mas já não tem algoritmo
próprio.

Os três `replace(/\D/g, '').padStart(14, '0')` viraram `normalizeTaxId` + rejeição:

```ts
const cnpj = normalizeTaxId(params.cnpj)
// Sem padStart: CNPJ que não fecha 14 posições é erro de cadastro, não valor a completar com zero
if (!CNPJ_PATTERN.test(cnpj))
  throw new Error(`CNPJ inválido para a chave de acesso: ${params.cnpj}`)
```

O `padStart` era o mecanismo do defeito: com CNPJ alfanumérico, o `replace` derrubava as letras e o
`padStart` recompunha 14 posições com zero à esquerda — chave sintaticamente perfeita apontando
para outro contribuinte, sem um erro sequer. É por isso que ele sai em vez de ser adaptado.

Nenhuma cópia sobrou:

```
$ rg -n "calcDigitoVerificador|calculateModulo11|padStart\(14" src/ --glob '*.ts'
(sem resultado)
```

Verificação exigida pela task — a linha de base continua verde, ou seja, o XML numérico saiu
**byte a byte** igual ao de antes da mudança:

```
$ bun run check
(sem saída)

$ bun test test/contract
 154 pass
 0 fail
Ran 154 tests across 7 files. [6.80s]
```

Mesmos 154 antes e depois: a T003 continua verde e a T001 também.

---

## T005 — contrato da chave com CNPJ alfanumérico

`test/contract/chave-alfanumerica.contract.test.ts`, 7 casos em dois blocos: o que `buildChaveAcesso`
grava nas posições 6..19 e o que `isChaveDvValid` aceita. O CNPJ do caso é `12ABC34501DE35`.

Primeira execução, **antes** da T006, com a T004 já aplicada:

```
$ bun test test/contract/chave-alfanumerica.contract.test.ts
(fail) isChaveDvValid com CNPJ alfanumérico > aceita a chave que o próprio provider acabou de gerar
Expected: true
Received: false

 6 pass
 1 fail
 9 expect() calls
```

Um vermelho só, e é o vermelho certo. A T004 já tinha consertado a **geração** da chave — por isso os
quatro casos de `buildChaveAcesso` nasceram verdes —, mas a **validação** ainda era o mód. 11 de
dígito: `isChaveDvValid` recusava a chave que o próprio provider acabava de emitir. Esse é
exatamente o buraco que a T006 fecha, e registrar isso é mais honesto do que atrasar o contrato para
que ele nascesse todo vermelho.

Antes da spec, a mesma chamada devolvia `35260800000123450135550010000000011521914221`: 44 posições,
sintaxe impecável, `00000123450135` no lugar do CNPJ — outro contribuinte.

## T006 — validação de chave por `CHAVE_PATTERN`

`isChaveDvValid` (`SefazChave.ts:45-50`) passou a normalizar, conferir `CHAVE_PATTERN`
(`[0-9]{6}[A-Z0-9]{12}[0-9]{26}`) e delegar o dígito a `calcularDvChave`. Os seis sítios da task,
mais um sétimo encontrado durante a execução:

| Arquivo                                      | Antes                                          | Depois                                              |
| -------------------------------------------- | ---------------------------------------------- | --------------------------------------------------- |
| `providers/SefazNfeProvider.ts:169`          | `chaveAcesso.replace(/\D/g,'').length !== 44`  | `CHAVE_PATTERN.test(normalizeTaxId(...))`           |
| `providers/SefazNfceProvider.ts:217`         | idem                                           | idem                                                |
| `providers/SefazMdfeProvider.ts:20,52,71`    | `ACCESS_KEY_PATTERN = /^[0-9]{44}$/`           | constante local removida, `CHAVE_PATTERN` importado |
| `providers/NfeDistribuicaoProvider.ts:284`   | `chaveNfe.replace(/\D/g,'')` + `length !== 44` | `normalizeTaxId` + `CHAVE_PATTERN`                  |
| `providers/NfeXmlImporter.service.ts:27,454` | `ACCESS_KEY_PATTERN = /^\d{44}$/`              | constante local removida, `CHAVE_PATTERN` importado |
| `sefaz/SefazQrCodeVerifier.ts:90,102`        | `/^\d{44}$/`                                   | `CHAVE_PATTERN`                                     |
| `sefaz/SefazDocumentOps.ts:41,67`            | `params.chaveAcesso.replace(/\D/g,'')`         | `normalizeTaxId(params.chaveAcesso)`                |

**Sítio acrescentado à task:** `SefazDocumentOps.ts` não estava na lista da T006 e é a mesma classe de
defeito — `consultarNfe` e `cartaCorrecao` limpavam a chave com `replace(/\D/g,'')` **antes de
transmitir para a SEFAZ**, o que não recusa a chave alfanumérica: manda uma chave errada, de 42
posições, e a rejeição volta como erro de schema sem nenhuma pista da causa. Entrou junto.

Duas decisões registradas:

- O check do QR Code chamado `chave-44-digitos` virou `chave-44-posicoes`. É nome de contrato, então
  foi verificado antes: `rg "chave-44-digitos"` devolve **0 ocorrências** nos dois repositórios — não
  há consumidor. "Dígitos" passou a ser mentira no rótulo.
- O `CNPJ_PATTERN = /^\d{14}$/` local do `NfeXmlImporter.service.ts:28` **ficou como estava**. Ele não
  é validação de chave, é o filtro de `collectRelatedCnpjs`, e é a T008 que o trata.

Nenhum resto de validação de chave por dígito no pacote:

```
$ rg -n "\{44\}|length !== 44|=== 44" src
src/sefaz/LogObfuscator.ts:17: if (digits.length !== 44) return '**masked**'
```

A única sobra é a máscara de log — território declarado da T009.

Verificação exigida pela task:

```
$ bun run check
(sem saída)

$ bun test test/contract/chave-alfanumerica.contract.test.ts     # T005
 7 pass
 0 fail
 9 expect() calls

$ bun test test/contract/xml-numeric-baseline.contract.test.ts   # T003
 7 pass
 0 fail
 17 expect() calls

$ bun test test/contract
 161 pass
 0 fail
 454 expect() calls
Ran 161 tests across 8 files. [6.89s]
```

154 → 161 é exatamente o arquivo da T005 entrando; nenhum teste que já existia mudou de resultado, e
o golden numérico da T003 continua batendo byte a byte. Diff da T006: 8 arquivos, 36 inserções, 41
remoções.

## T007 — CNPJ nos pontos de montagem de XML e de wire

Todo lugar que escrevia CNPJ em documento fiscal ou em cabeçalho de integração passou de
`replace(/\D/g, '')` para `normalizeTaxId`. O `replace` não falhava: ele **descartava a letra e
escorregava o resto para a esquerda**, produzindo um CNPJ de 9 posições que aponta para outro
contribuinte — documento aceito pela SEFAZ, emitido em nome de quem não é.

### Convertidos (11 arquivos)

| Arquivo                                             | Ponto                                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `sefaz/SefazXmlBuilder.ts`                          | `<emit><CNPJ>` da NFC-e                                                                                          |
| `sefaz/NfeXmlBuilder.ts`                            | `<emit><CNPJ>` e `<dest><CNPJ>`                                                                                  |
| `sefaz/SefazSoapClient.ts`                          | `<envEvento>` do cancelamento (110111), da carta de correção (110110) e `sendInutilizacao`                       |
| `sefaz/CteSoapClient.ts`                            | `<eventoCTe><CNPJ>`                                                                                              |
| `sefaz/CteXmlBuilder.ts`                            | `buildParticipante`, `contratante` do modal rodoviário, `ferrEmi`, `emit`, `infRespTec`                          |
| `sefaz/MdfeXmlBuilder.ts`                           | `prop`, `infContratante`, `CNPJIPEF`, `buildPagamento`, `seguro.responsavelCnpj`, seguradora do `infSeg`, `emit` |
| `providers/SatProvider.ts`                          | `<ide>` e `<emit>` do CF-e                                                                                       |
| `providers/controlid-cupom.ts`                      | `<ide>` e `<emit>`                                                                                               |
| `providers/NfseProvider.ts`                         | `cnpjLimpo`, os dois `<CpfCnpj><Cnpj>` do Prestador, `tomadorCnpj`                                               |
| `providers/NotaRpNfseProvider.ts`                   | cabeçalho `X-Auth-CNPJ`                                                                                          |
| `sefaz/SefazChave.ts` · `sefaz/SefazDocumentOps.ts` | já convertidos em T004/T006                                                                                      |

### Deliberadamente **não** tocados

O CNPJ mudou; o resto do cadastro não. Trocar `replace(/\D/g,'')` por `normalizeTaxId` num campo
que continua sendo só dígito não corrige nada e **deixa passar lixo** que hoje é filtrado — um CEP
digitado como `01310-100 SP` sairia com o `SP` colado.

- **CPF** — 11 dígitos numéricos, sem mudança na IN RFB 2229/2024: `buildParticipante` (`p.cpf`),
  `moto.CPF`, `prop.cpf`, `contratante.CPF`, `buildPagamento` (`cpf`), `seguro.responsavelCpf`,
  `dest.cpf`, `tomadorCpf`, `customerCpf`.
- **CEP** — `config.cep`, `p.cep` nos dois builders de endereço.
- **Telefone** — `config.telefone`, `p.fone`.
- **Inscrição estadual e municipal** — `config.inscricaoEstadual`, `inscricaoMunicipal` (header
  `X-Auth-IM` do NotaRP).
- **Códigos de tabela** — NCM, CFOP, CST/CSOSN, CNAE, cMun, cPais.

### Contrato de travessia

`test/contract/cnpj-alfanumerico-xml.contract.test.ts` — o mesmo par de CNPJs alfanuméricos
(`12ABC34501DE35` emitente, `45XY6789ZW0165` destinatário, ambos com DV conferido pelo
`calcularDvCnpj` do próprio pacote) atravessando NF-e, NFC-e, CT-e e MDF-e, mais o caso da máscara
(`12.ABC.345/01DE-35` → `12ABC34501DE35`, sem `12.ABC` vazando). Cada asserção verifica três coisas:
o CNPJ íntegro no XML, a **ausência** de `123450135` (o que o defeito produzia), e o DV da chave.

```
$ bun test test/contract/cnpj-alfanumerico-xml.contract.test.ts
 7 pass · 0 fail · 22 expect() calls
```

### O contrato morde

Perturbação deliberada: `CteXmlBuilder.ts:252` revertido para
`${config.cnpj.replace(/\D/g, '')}`.

```
$ bun test test/contract/cnpj-alfanumerico-xml.contract.test.ts
124 |     expect(xml).not.toContain(CORRUPTED_EMITENTE)
error: expect(received).not.toContain(expected)
Expected to not contain: "123450135"
Received: ...<emit><CNPJ>123450135</CNPJ><IE>111111111111</IE>...
(fail) CT-e com CNPJ alfanumérico > emitente, remetente e destinatário saem íntegros
 6 pass · 1 fail
```

O XML capturado mostra o defeito inteiro: `<emit>` com 9 posições e `<rem>`/`<dest>` íntegros no
mesmo documento — dois participantes escritos por caminhos diferentes, só um corrompido. Revertido
em seguida (`grep -c "config.cnpj.replace"` → `0`, sem `.bak` residual).

### Verificação

```
$ bun run check
$ tsc -p tsconfig.json --noEmit      # sem saída

$ bun test test/contract
 168 pass · 0 fail · 476 expect() calls · 9 arquivos
```

161 → 168: os 7 novos. A linha de base numérica de T003 continua batendo **byte a byte** depois de
mexer em 18 arquivos — é para isso que ela foi congelada antes de qualquer edição.

## T008 — Lado de entrada: importação, distribuição e certificado

T007 cuidou do que a gente **escreve**. T008 é o que a gente **lê**: NF-e emitida por terceiro,
consulta ao DFe, e o certificado que prova a titularidade. Aqui o defeito não corrompe documento —
ele faz o contribuinte alfanumérico **desaparecer**, em silêncio.

### O vermelho, antes de qualquer correção

```
$ bun test test/contract/cnpj-alfanumerico-importacao.contract.test.ts
69 |     expect(document.relatedCnpjs).toContain(ISSUER)
error: expect(received).toContain(expected)
Expected to contain: "12ABC34501DE35"
Received: []
 4 pass · 2 fail
```

`Received: []` — lista **vazia**. Emitente, destinatário e transportadora, os três descartados pelo
`/^\d{14}$/` do `collectRelatedCnpjs`. A NF-e importa sem erro, os participantes estão íntegros em
`issuer`/`recipient`/`carrier`, e mesmo assim quem consulta `relatedCnpjs` para decidir de quem é a
nota recebe nada.

### Correções

| Arquivo                                   | Antes                                                                                     | Depois                                                                                 |
| ----------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `NfeXmlImporter.service.ts:28,379`        | `CNPJ_PATTERN = /^\d{14}$/` local                                                         | `CNPJ_PATTERN` de `SefazTaxId` — a constante local sumiu, sem segunda fonte de verdade |
| `NfeDistribuicaoProvider.ts:165-167`      | `consultarCnpj`: `replace` + `length !== 14`                                              | `normalizeTaxId` + `CNPJ_PATTERN`                                                      |
| `NfeDistribuicaoProvider.ts:232,271,295`  | `config.cnpj.replace(/\D/g,'')` em `consultarDFe`, `consultarPorNsu`, `consultarPorChave` | `normalizeTaxId(config.cnpj)`                                                          |
| `NfeDistribuicaoProvider.ts:385`          | filtro por emitente com `replace` **dos dois lados**                                      | `normalizeTaxId` dos dois lados                                                        |
| `CertificateValidator.ts:168-170,180-181` | `/:(\d{14})$/` no CN e `/^\d{14}$/` no OU                                                 | `/:([A-Z0-9]{12}[0-9]{2})$/u` e `CNPJ_PATTERN`                                         |

O `cnpjClean` de `consultarDFe` também é a chave do cooldown pós-cStat 137. Com o `replace`, duas
empresas alfanuméricas diferentes podiam colidir na mesma chave — uma herdando o bloqueio da outra.

O filtro merecia atenção separada: `replace(/\D/g,'')` aplicado aos dois lados **iguala CNPJs
distintos**. `12ABC34501DE35` e `12XYZ34501FG35` viram ambos `123450135` — o filtro por emitente
traria nota de outro contribuinte, o que é pior que não trazer nenhuma.

### `parseIcpBrasilSubject` — extraída para poder ser testada

A leitura do CNPJ do certificado estava presa dentro de `extractIcpBrasilIds(cert)`, que só roda com
um PFX real. A parte que interessa é parsing de string, então ela saiu para
`parseIcpBrasilSubject({ commonName, organizationalUnits })`, exportada e pura. `extractIcpBrasilIds`
continua sendo quem fala com o node-forge e passou a delegar.

Sem isso, um certificado A1 com `CN=TRANSPORTADORA TESTE LTDA:12ABC34501DE35` devolvia
`cnpj: undefined` — e a validação de titularidade contra o emitente virava no-op silencioso, que é
exatamente o tipo de defeito que só aparece em produção.

**O CPF continua discriminado pelo tamanho**, não pela ausência de letra: 11 dígitos é CPF, 14
posições é CNPJ. `OU_CPF_PATTERN` e `CN_CPF_SUFFIX_PATTERN` seguem `[0-9]` puro.

### O contrato morde

Perturbação: `CN_CNPJ_SUFFIX_PATTERN` → `/:([0-9]{14})$/u` e o OU → `/^[0-9]{14}$/u`.

```
$ bun test test/contract/cnpj-alfanumerico-importacao.contract.test.ts
@@ -1,3 +1,3 @@
  {
-   "cnpj": "12ABC34501DE35",
+   "cnpj": undefined,
    "cpf": undefined,
(fail) sujeito do certificado ICP-Brasil > CNPJ alfanumérico é lido do CN
(fail) sujeito do certificado ICP-Brasil > CNPJ alfanumérico é lido do OU quando o CN não traz sufixo
 8 pass · 2 fail
```

Os casos numérico e de CPF ficaram **verdes** durante a perturbação — o contrato aponta para a
regressão certa, não dispara por qualquer mudança. Revertido em seguida.

### Fixture parametrizada

`test/fixtures/nfe-xml.fixture.ts` ganhou `issuerCnpj`/`recipientCnpj`/`carrierCnpj` opcionais, com
default nas constantes numéricas de sempre. Mudança aditiva: `nfe-import.contract.test.ts` não foi
tocado e continua verde.

### Verificação

```
$ bun run check
$ tsc -p tsconfig.json --noEmit      # sem saída

$ bun test test/contract/cnpj-alfanumerico-importacao.contract.test.ts
 10 pass · 0 fail · 21 expect() calls

$ bun test test/contract
 178 pass · 0 fail · 497 expect() calls · 10 arquivos
```

---

## T009 — redação de log e máscaras de impressão

### O defeito

Dois defeitos de naturezas opostas no mesmo eixo, e o contraste é a prova mais limpa: no
`maskXmlResponse`, o grupo `(<CNPJ>)(\d{14})(</CNPJ>)` **não casa** um CNPJ alfanumérico. A tag
passa direto e o documento vai inteiro para o log estruturado — ao lado de um `<xNome>` corretamente
mascarado, na mesma string. Vermelho capturado:

```
Expected to not contain: "12ABC34501DE35"
Received: "<retConsSitNFe><CNPJ>12ABC34501DE35</CNPJ><xNome>**masked**</xNome></retConsSitNFe>"
```

Do outro lado, `maskCnpj` e `maskChaveAcesso` falhavam **seguro**: `replace(/\D/g,'')` derrubava o
tamanho para 11 e as duas caíam no `'**masked**'`. Não vaza, mas apaga o rastreio — o log deixa de
correlacionar a operação com o contribuinte exatamente quando a instalação é de um CNPJ novo.

Nas três máscaras de impressão o efeito é o terceiro: elas **mentem**. O DANFE saía com
`CNPJ: 12.345.013/5-` no cabeçalho, e o cupom térmico do Control-ID com o mesmo valor. Impresso, um
documento truncado é indistinguível de um documento real — ninguém do outro lado do balcão tem como
perceber.

### Alterações

| Arquivo                                    | Antes                                    | Depois                             |
| ------------------------------------------ | ---------------------------------------- | ---------------------------------- |
| `sefaz/LogObfuscator.ts` `maskCnpj`        | `replace(/\D/g,'')` + `length !== 14`    | `normalizeTaxId` + `CNPJ_PATTERN`  |
| `sefaz/LogObfuscator.ts` `maskChaveAcesso` | idem, `length !== 44`                    | `normalizeTaxId` + `CHAVE_PATTERN` |
| `sefaz/LogObfuscator.ts` `maskXmlResponse` | `(<CNPJ>)(\d{14})`                       | `(<CNPJ>)([A-Z0-9]{12}[0-9]{2})`   |
| `danfce/DanfceBuilder.ts:29-32`            | `formatCnpj` local, **sem guarda**       | `formatCnpjForDisplay`             |
| `providers/controlid-cupom.ts:319`         | `formatarCNPJ` local, **sem guarda**     | delega a `formatCnpjForDisplay`    |
| `danfce/CupomPdfBuilder.ts:29-33`          | `formatCnpj` local com guarda de tamanho | `formatCnpjForDisplay`             |
| `danfce/CupomPdfBuilder.ts:40-43`          | `formatChave` agrupando `\D`-filtrado    | `normalizeTaxId` + `CHAVE_PATTERN` |
| `danfce/CupomPdfBuilder.ts:210`            | `chaveSuffix` por `replace(/\D/g,'')`    | `normalizeTaxId`                   |

As três cópias da pontuação viraram uma: `formatCnpjForDisplay`, em `sefaz/SefazTaxId.ts`. Eram três
implementações do mesmo formato, duas delas sem guarda nenhuma — o mesmo defeito escrito três vezes.
A função devolve **o valor recebido intacto** quando ele não é CNPJ, em vez de fatiar às cegas.

`maskCpf` e o grupo `(<CPF>)(\d{11})` **não foram tocados**: o CPF continua com 11 dígitos
numéricos, e afrouxar o conjunto ali só faria a máscara casar coisa que não é CPF.

O `chaveSuffix` funcionava por acidente — as 8 últimas posições da chave (cNF+DV) são sempre
numéricas. Passou a normalizar mesmo assim, para não depender de uma fatia que pode mudar.

### O contrato

`test/contract/cnpj-alfanumerico-redacao.contract.test.ts` — 7 testes, 14 `expect()`. Cobre o
vazamento no `rawResponse`, as duas máscaras que perdiam rastreio, o CNPJ e o CPF numéricos
inalterados, o valor que **não** é documento continuando a virar borrão (a guarda não afrouxou), e
os dois caminhos de impressão exportados: `buildDanfce` e `gerarCupomTermico`.

### A prova de que o contrato morde

**Perturbação 1** — regex do `maskXmlResponse` de volta para `\d{14}`: o teste do vazamento falha
com a saída citada acima, e os outros 6 seguem verdes.

**Perturbação 2** — guarda de `formatCnpjForDisplay` de volta para `replace(/\D/g,'')`:

```
(fail) máscara de impressão do DANFE NFC-e > o cupom imprime o CNPJ alfanumérico inteiro e pontuado
   Expected to contain: "12.ABC.345/01DE-35"
   Received: "…      CNPJ: 12.345.013/5-       …"
(fail) máscara de impressão do DANFE NFC-e > o cupom térmico do Control-ID imprime o mesmo CNPJ
   Expected to contain: "12.ABC.345/01DE-35"
   Received: "…CNPJ: 12.345.013/5-\nIE: 110042490114…"
 5 pass · 2 fail
```

Os dois caminhos de impressão caem juntos e os cinco testes de redação continuam verdes — o
contrato aponta para a regressão certa, não dispara a qualquer mudança. Note na saída do DANFE que a
chave (`3526 0712 ABC3 4501 DE35 …`) sai íntegra mesmo na perturbação: ali o formatador é outro, e
só o CNPJ estava quebrado.

### Verificação

```
$ bun test test/contract/cnpj-alfanumerico-redacao.contract.test.ts
 7 pass · 0 fail · 14 expect() calls

$ bun test test/contract
 185 pass · 0 fail · 511 expect() calls · 11 arquivos

$ bun run check
 (tsc --noEmit, sem saída)
```

---

## T010 — caso alfanumérico no contrato de fio do MDF-e, changeset e release

### O caso

`mdfe-sefaz-wire.contract.test.ts` já afirmava, no teste da chave, que
`chaveAcesso.slice(6, 20)` é o CNPJ do certificado — com o CNPJ numérico. O caso alfanumérico entrou
ao lado, não no lugar: a chave de 44 é o único lugar onde o CNPJ aparece **sem tag em volta**, e é
ela que a SEFAZ confere. O teste afirma as posições 6..19, o modelo em 20..21, o cDV recalculado
pela função do pacote, o `<emit><CNPJ>` íntegro, o `Id="MDFe…"` coerente, e a ausência do
`123450135` que o `replace(/\D/g,'')` produziria.

Verde de primeira: o `MdfeXmlBuilder` já tinha sido convertido nas tasks anteriores. O caso aqui é
**guarda de regressão**, e é assim que está registrado — não uma correção.

### A prova de que o caso morde

Perturbação em `MdfeXmlBuilder.ts:40`, `normalizeTaxId(params.cnpj)` de volta para
`params.cnpj.replace(/\D/g, '')`:

```
error: CNPJ inválido para a chave do MDF-e: 12ABC34501DE35
(fail) MDF-e 3.00 schema element names > carries an alphanumeric CNPJ in the access key and in the emit group
 36 pass · 1 fail
```

A guarda `CNPJ_PATTERN` logo abaixo transforma o que era corrupção silenciosa em erro alto — o
builder falha fechado. Os 36 testes numéricos seguem verdes.

### Superfície pública

As apps consumidoras não podem importar `src/sefaz/*` (regra do repo TransportAdA), então a
primitiva foi exportada pelo `src/index.ts`: `CNPJ_PATTERN`, `CHAVE_PATTERN`, `normalizeTaxId`,
`calcularDvCnpj`, `calcularDvChave`, `charValue`, `isCnpjValid`, `formatCnpjForDisplay`. Sem isso o
release não serviria à T016, e o consumidor descobriria tarde. O contrato
`cnpj-alfanumerico-xml.contract.test.ts` passou a afirmar a superfície pelo `index`, não pelo
caminho interno.

### Changeset

`.changeset/cnpj-alfanumerico.md`, `minor` em `@adatechnology/fiscal-provider` (repo em modo `pre`,
tag `rc`, versão corrente `0.3.0-rc.6`).

### Verificação

```
$ bun test test/contract
 187 pass · 0 fail · 11 arquivos

$ bun run check
 (tsc --noEmit, sem saída)

$ bun run build
 CJS dist/index.js 271.64 KB · Build success
```

### Release

Publicado: **`@adatechnology/fiscal-provider@0.3.0-rc.7`** (dist-tag `rc`).

O changeset `cnpj-alfanumerico` (minor) foi escrito e consumido por `pnpm run version:changeset`,
que subiu `0.3.0-rc.6 → 0.3.0-rc.7`. O `changeset version` local arrastou junto um changeset
pendente de outro assunto (`catalog-retail-fields`, quatro pacotes de catálogo cujo código estava
fora deste commit); os quatro `package.json` foram revertidos e a entrada tirada de
`.changeset/pre.json`, para o release não anunciar uma feature que não estava dentro dele.

O commit foi feito no branch de trabalho e **cherry-pickado para `main` sozinho**, sem o commit de
catálogo que era pai dele — `git diff --stat origin/main..HEAD` confirmou os mesmos 37 arquivos.
Push em `main` disparou o `publish.yml`; run [31829276844] verde em todos os passos.

```
$ npm view @adatechnology/fiscal-provider dist-tags
{ latest: '0.2.0', rc: '0.3.0-rc.7' }
```

É esta versão que a T016 fixa no `package.json` da `api-transportada`.

## T011 — contrato de redação do `logger`, com a lista do que não pode ser apagado ✅

`packages/backend/logger/src/redact.test.ts` (repositório `adatechnology-packages`). O pacote usa
colocation — `src/*.test.ts` ao lado do fonte — então o contrato entrou no arquivo que já testa
`redact.ts`, e não num diretório `test/` como na `transportada`.

### O defeito

`redact.ts` tem duas camadas: denylist por **nome de chave** e varredura por **forma do valor**. A
segunda é a que pega documento em texto livre — `descricao`, `message`, `error.stack` — e é ela que
foi escrita quando `\d` era o alfabeto inteiro do CNPJ:

| Linha          | Padrão                                                        | O que deixa passar                    |
| -------------- | ------------------------------------------------------------- | ------------------------------------- |
| `redact.ts:44` | `ACCESS_KEY_PATTERN = /(?<!\d)\d{44}(?!\d)/g`                 | chave de acesso com CNPJ alfanumérico |
| `redact.ts:45` | `CNPJ_FORMATTED_PATTERN` — `\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}` | CNPJ alfanumérico pontuado            |
| `redact.ts:50` | `CNPJ_BARE_PATTERN = /(?<!\d)\d{14}(?!\d)/g`                  | CNPJ alfanumérico cru                 |

A chave de acesso é o caso mais feio, e o vermelho mostrou por quê: `chaveAcesso` **não está na
denylist por nome** (`chave` não é uma das chaves negadas), então a única defesa dela é o padrão de
forma. Sem ele, saiu inteira:

```
expect(redacted.chaveAcesso).toBe('****000014')
Received: "35260712ABC34501DE35550010000000011000000014"
```

Quarenta e quatro caracteres nomeando o emitente, num campo que o teste anterior deste mesmo arquivo
garante que sai como `****012347` quando é numérica. O log continua com aparência normal — é isso que
faz a classe do defeito ser vazamento e não erro.

### As duas listas

**Tem de ser redigido:** CNPJ alfanumérico cru (`12ABC34501DE35`), pontuado
(`12.ABC.345/01DE-35`), em minúscula (`12abc34501de35` — a canonicalização em maiúscula é da
fronteira da aplicação, e o log é defesa em profundidade), chave de acesso alfanumérica, e o CNPJ
numérico e a chave numérica exatamente como hoje.

**Não pode ser redigido** — e esta é a lista que decide o desenho:

| Valor                                        | Por que sobrevive                                                                                  |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `01J8Z9ABCDEF12`                             | catorze posições, letras, dois dígitos no fim: a forma de um CNPJ, o DV não fecha (`00`, não `12`) |
| `A1B2C3D4E5F601`                             | idem, ainda mais parecido; DV correto seria `68`                                                   |
| `TRANSPORTADORA`                             | palavra de catorze letras — não termina em dois dígitos                                            |
| `e3b0c442…52b855`                            | hash sha256, 64 posições                                                                           |
| `9f1c2b3a…2e3f4a5b`                          | UUID sem hífen, 32 posições                                                                        |
| `nfe_documents_company_id_access_key_unique` | nome de constraint, que é diagnóstico puro                                                         |

Os dois primeiros são o ponto. Hash e UUID caem sozinhos pelo comprimento, e a palavra cai pelos
dois dígitos finais — nenhum dos três pressiona o desenho. Um id opaco de catorze posições com dois
dígitos no fim, esse cabe no formato inteiro, e é ele que obriga o **DV a ser a evidência** na forma
crua alfanumérica: sem pontuação em volta, não há mais nada que separe documento de identificador.

### O vermelho

```
$ bun test src/redact.test.ts
 23 pass
 5 fail
 75 expect() calls
```

As cinco falhas são a lista positiva alfanumérica, uma a uma. **Os dois casos da lista negativa
passaram já no vermelho** — como tinham de passar: eles fixam o comportamento de hoje, e existem
para falhar depois, se o padrão da T012 abrir demais.

## T012 — os três padrões do `redact`, com o DV como evidência ✅

`packages/backend/logger/src/redact.ts`. A chave de acesso e o CNPJ pontuado alargaram **só pela
forma** — `[0-9]{6}[A-Za-z0-9]{12}[0-9]{26}` e letras dentro da máscara. Pontuação já é evidência de
intenção, e nada mais num log tem esse desenho.

A forma crua não podia alargar do mesmo jeito. `\d{14}` continua como sempre esteve, sem conferir
dígito verificador — catorze dígitos seguidos já são documento em praticamente todo log, e pedir DV
ali seria regressão. O que entrou é um segundo padrão, só para quem tem letra:

```ts
const CNPJ_ALPHANUMERIC_BARE_PATTERN = /(?<![A-Za-z0-9])[A-Za-z0-9]{12}\d{2}(?![A-Za-z0-9])/g

function redactAlphanumericCnpj(match: string): string {
  if (!/[A-Za-z]/.test(match)) return match
  return hasValidCnpjCheckDigits(match.toUpperCase()) ? '[CNPJ_REDACTED]' : match
}
```

O módulo 11 foi **escrito neste pacote de propósito**: ele não declara dependência de runtime
nenhuma, e quem o consome é produto de conversa, de catálogo, de fiscal — importar o
`fiscal-provider` só para redigir uma linha de log arrastaria `pdfkit`, `xml-crypto` e `node-forge`
para dentro de todos eles.

### O verde

```
$ bun test
 48 pass
 0 fail
 126 expect() calls
Ran 48 tests across 3 files. [174.00ms]
$ tsc --noEmit
$ tsup
DTS ⚡️ Build success in 534ms
```

### A prova por perturbação

Verde sozinho não mostra que o DV está segurando alguma coisa. Removida a checagem — isto é, com o
padrão redigindo qualquer casamento de catorze posições —, o resultado foi **exatamente** os dois
testes da lista negativa falhando (`26 pass / 2 fail`), com

```
retry de [CNPJ_REDACTED] apos e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

o id opaco apagado e o hash intacto, confirmando a análise de comprimento da T011. A checagem foi
restaurada em seguida.

**Trade-off registrado:** um CNPJ alfanumérico com DV quebrado não é redigido na forma crua. Ele não
identifica ninguém — não é documento de empresa nenhuma —, e o preço alternativo seria apagar
identificador opaco de log.

### Release

`@adatechnology/logger@0.1.0-rc.1`, changeset `redact-cnpj-alfanumerico`, commit `6e2c894`, run
`31831556713` verde. Confirmado no registry:

```
$ npm view @adatechnology/logger dist-tags
{ latest: '0.0.1', rc: '0.1.0-rc.1' }
```

O `pre.json` foi conferido antes do push — `redact-cnpj-alfanumerico` era o **único** changeset não
consumido, para não repetir o carona da T010.

## T013 — contrato do banco, com os CHECK de CPF fixados para não irem de arrasto ✅

### O inventário, contado no schema e não na estimativa

O `plan.md` falava em "onze CHECK de CNPJ e cinco de chave", contando pontos citados no código. A
varredura sobre `database.schema.ts` devolveu o número real:

| Grupo                 | Quantos | Onde                                                                                                                                                                                                                  |
| --------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CNPJ                  | 10      | `company_fiscal_profiles` (2), `digital_certificates`, `fleet_drivers`, `fleet_vehicles`, `cte_emission_profile_matchers`, `billing_invoices`, `nfse_provider_credentials`, `nfse_service_invoices`, `mdfe_manifests` |
| Chave de acesso       | 7       | `nfe_documents`, `nfe_events`, `nfe_import_items`, `cte_fiscal_documents`, `billing_invoice_items`, `mdfe_fiscal_documents`, `mdfe_manifest_items`                                                                    |
| CPF — **não tocados** | 4       | `fleet_drivers.tax_id`, `fleet_drivers.license_number`, `trip_drivers.driver_tax_id`, `mdfe_manifest_drivers.driver_tax_id`                                                                                           |

A diferença nas chaves é o `ACCESS_KEY_PATTERN` de `mdfe.schema.ts`, que é **uma** constante usada em
**duas** tabelas. Nos CNPJ, `billing_invoices_customer_document_check` não aparecia nas buscas por
`[0-9]{14}` porque ele sempre foi `^[0-9]{11,14}$`.

### O contrato

`test/tax-id-pattern/schema-checks.contract.ts`, entrypoint `test/tax-id-pattern.contract.test.ts`,
inscrito na lista literal do `package.json` — sem isso não roda. Ele varre **todas** as tabelas
exportadas do schema agregado e afirma, por grupo:

- CNPJ puro → contém `^[A-Z0-9]{12}[0-9]{2}$`
- CPF **ou** CNPJ → contém os dois ramos, o de onze **intacto**
- matcher de perfil → abre também a raiz, `^[A-Z0-9]{8}$` (a raiz é prefixo do documento; deixá-la
  numérica faria o matcher parar de casar exatamente as empresas novas)
- documento do cliente da fatura → mantém `^[0-9]{11,14}$` e **ganha** o ramo alfanumérico ao lado,
  porque apertar o intervalo agora rejeitaria linha já gravada
- chave de acesso → `^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$`
- CPF → segue `^[0-9]{11}$` e **não pode conter `A-Z`**

O último teste é a rede para o que a lista não conhece: nenhum CHECK do schema inteiro pode conter
`[0-9]{14}` ou `[0-9]{44}`. Tabela nova, coluna nova ou CHECK esquecido numa migration futura cai
aqui — esses dois comprimentos não existem neste banco para mais nada.

Os contratos que já fixavam a expressão exata do CHECK foram atualizados junto (12 arquivos): eles
comparam string literal, então continuariam vermelhos depois da T014 se ficassem para trás.
`static-migration.contract.ts` ganhou o diretório `_tax_id_alphanumeric`, exigindo `DROP CONSTRAINT`
**e** `ADD CONSTRAINT` do mesmo nome para os 17, os quatro CHECK de CPF ausentes do arquivo, e o
`rollback.sql` guardado por nome e hash com os padrões numéricos de volta.

### O vermelho

```
$ bun test ./test/tax-id-pattern.contract.test.ts ./test/database-migration.contract.test.ts \
    ./test/fiscal-schema.contract.test.ts ./test/fleet-schema.contract.test.ts …
 242 pass
 20 fail
 1744 expect() calls
```

Das 7 asserções do contrato novo, **a de CPF passou já no vermelho** — como tinha de passar: ela
fixa o comportamento de hoje e existe para falhar depois, se a T014 afrouxar um CPF de arrasto.

## T014 — os CHECK do banco abertos, e a prova de que o rollback volta ✅

Os nove `src/database/*.schema.ts` foram alargados nos 17 CHECK inventariados na T013 — dez de
CNPJ (contando a raiz do matcher e o documento do cliente da fatura) e sete de chave de acesso. Os
quatro CHECK de CPF ficaram intocados, que é o que o contrato da T013 guarda.

`bun run db:generate --name tax_id_alphanumeric` gerou
`drizzle/20260814191354_tax_id_alphanumeric/migration.sql` com exatamente 17 comandos, cada um
`ALTER TABLE "t" DROP CONSTRAINT "x", ADD CONSTRAINT "x" CHECK (…)` — o par no mesmo statement, que é
o que mantém a coluna validada o tempo todo. Nenhum `DROP TABLE`, `DROP COLUMN` ou `CASCADE`.

O `rollback.sql` foi escrito à mão no molde do repo: cabeçalho de copyright, aviso de execução
manual, os 17 CHECK numéricos de volta e o bloco guardado que apaga a entrada do journal por
**nome e hash** (`0c365960…8e82`) e levanta exceção se não remover exatamente uma linha.

### Verificação

```
$ bun test ./test/tax-id-pattern.contract.test.ts ./test/database-migration.contract.test.ts
 42 pass · 3 skip · 0 fail · 409 expect()

$ bun test ./test/fiscal-schema.contract.test.ts ./test/fleet-schema.contract.test.ts \
    ./test/cte-profiles-schema.contract.test.ts ./test/billing-schema.contract.test.ts \
    ./test/nfe-schema.contract.test.ts ./test/mdfe-schema.contract.test.ts \
    ./test/cte-issuance-schema.contract.test.ts
 165 pass · 0 fail · 1058 expect()

$ bun run db:check
Everything's fine 🐶🔥

$ make migration-test
 66 pass · 0 fail · 656 expect()
```

### O ciclo completo num banco descartável

`make migration-test` valida o arquivo, não o efeito. Como esta migration mexe em constraint de
tabela com dado, o ciclo foi rodado inteiro num banco `rollback_probe` criado e destruído para isso:

```
$ db:migrate no banco novo → company_fiscal_profiles_cnpj_check = '^[A-Z0-9]{12}[0-9]{2}$'

$ CREATE TABLE cnpj_probe (cnpj text);            -- CHECK copiado do pg_constraint real
  INSERT '12ABC34501DE35'  → INSERT 0 1           -- CNPJ alfanumérico entra
  INSERT '12345678000195'  → INSERT 0 1           -- CNPJ numérico continua entrando
  INSERT '12abc34501de35'  → ERROR: violates check constraint
```

A minúscula ser rejeitada é o desenho: normalizar é trabalho da fronteira (T016), o banco só aceita
a forma canônica.

```
$ psql -v ON_ERROR_STOP=1 < rollback.sql        → 17× ALTER TABLE, DO, COMMIT
  count(journal onde hash = 0c365960…)          → 0
  company_fiscal_profiles_cnpj_check            → '^[0-9]{14}$'
  billing_invoices_customer_document_check      → '^[0-9]{11,14}$'
  nfe_documents_access_key_check                → '^[0-9]{44}$'
  fleet_drivers_tax_id_check                    → '^[0-9]{11}$'   (intocado nos dois sentidos)

$ db:migrate de novo                            → '^[A-Z0-9]{12}[0-9]{2}$'
```

O `DO` só termina se apagar exatamente uma linha do journal; com `ON_ERROR_STOP=1` ele completou,
então a guarda por nome e hash casou. Reaplicar depois do rollback funciona — a migration não
depende do estado anterior de nenhuma constraint além do nome.

Se alguma linha já tiver CNPJ com letra, o rollback **falha** ao revalidar e a transação volta
atrás inteira. É o comportamento correto e está escrito no cabeçalho do arquivo: rollback não pode
apagar documento válido em silêncio.

### Gates

`bun run format:check`, `bun run lint` e `bun run typecheck` limpos na raiz. A suíte da api roda
`2464 pass / 1 fail`, e a única falha é `deploy/service-naming.contract.ts` — serviço
`cron-notifications`
deployado sem entrada na tabela de build da documentação, pendência anterior a esta spec e sem
relação com CNPJ (nada aqui toca `.github/` nem `deploy/`).

A migration foi aplicada também no banco local de desenvolvimento, para o código e o schema não
ficarem descasados na próxima subida da API.

## T015 — o contrato de fronteira, escrito antes e vermelho ✅

Sete fronteiras onde um CNPJ entra pela borda HTTP da api, cobertas por duas suítes:

`test/tax-id-boundary/request-bodies.contract.ts` — corpos de requisição:

| Fronteira                    | Campo               | Como é exercitada                                           |
| ---------------------------- | ------------------- | ----------------------------------------------------------- |
| Perfil fiscal da empresa     | `profile.cnpj`      | `PATCH /company-settings` de verdade pelo fixture do router |
| Seguradora do MDF-e          | `mdfe.insurerTaxId` | mesmo `PATCH`, aceitando vazio                              |
| Proprietário do veículo      | `owner.taxId`       | `createVehicleSchema`                                       |
| Empresa ligada ao motorista  | `linkedTaxId`       | `createDriverSchema`                                        |
| Matcher do perfil de emissão | `matchers[].taxId`  | `createProfileSchema`, raiz de 8 **e** documento de 14      |
| Credencial de NFS-e          | `taxId`             | `saveCredentialSchema`                                      |
| Contratante do MDF-e         | `contractorTaxId`   | `createManifestSchema`                                      |

`test/tax-id-boundary/query-filters.contract.ts` — filtros de consulta:
`parseCompanySettingsLookupCnpjRequest` (`?cnpj=`), `parseBillingInvoiceList`
(`customerDocument` e `customerDocumentIn`) e `parseNfseInvoiceList` (`takerTaxIdEq`).

O caso da empresa vai pelo router porque ali dá para afirmar o que chega ao caso de uso — que é o
que o `GET` vai devolver depois. As outras seis afirmam direto sobre o schema Zod exportado: o
schema **é** a fronteira, e ir pelo HTTP só acrescentaria fixture sem acrescentar prova.

O documento usado é o exemplo oficial da IN RFB 2229/2024, `12.ABC.345/01DE-35` → `12ABC34501DE35`.
Toda fronteira é exercitada com três formas: alfanumérica **em minúscula** (tem de voltar em
maiúscula), numérica legada (não pode quebrar) e `12ABC34501DE3!` (tem de dar `400`). Onde o campo
aceita CPF ou vazio hoje, o teste fixa que continua aceitando.

### O vermelho

```
$ bun test ./test/tax-id-boundary.contract.test.ts
 1 pass
 10 fail
 12 expect() calls
Ran 11 tests across 1 file. [83.00ms]
```

O único verde é `o perfil fiscal recusa caractere fora de [A-Z0-9] antes do caso de uso` — hoje o
padrão é `^\d{14}$` e `!` já é recusado. Ele não é ruído: quando T016 abrir o padrão, é esse teste
que impede a abertura de virar `.*`.

As dez falhas são todas pela mesma causa, e o rastro mostra a linha exata do padrão numérico:

```
ApiError: Invalid request
  at parseCompanySettingsLookupCnpjRequest (src/companies/presentation/company-settings.schema.ts:151)
  at parseDocument (src/billing/presentation/billing.schema.ts:472)
  at parseTaxId (src/nfse-invoices/presentation/nfse-invoices.schema.ts:132)
```

O entrypoint `test/tax-id-boundary.contract.test.ts` foi acrescentado à lista literal de testes do
`package.json` da api — sem isso a suíte não rodaria em `make check`.

## T016 — a primitiva única e as fronteiras abertas ✅

### O seam

`src/shared/tax-id.service.ts` reexporta `CNPJ_PATTERN`, `CHAVE_PATTERN` e `normalizeTaxId` do
`@adatechnology/fiscal-provider` (raiz pública do pacote — nenhum módulo importa `src/sefaz/*`), e
acrescenta o que só existe aqui: `CPF_PATTERN`, `CNPJ_ROOT_PATTERN`, `TAX_ID_PATTERN`,
`DOCUMENT_FILTER_PATTERN` e `parseTaxIdValue` para as fronteiras que não são Zod.

Os construtores Zod ficaram em `src/shared/tax-id.schema.ts`, separados de propósito: as políticas
de domínio (`cte-batch-eligibility`, `emission-profile-resolution`, `freight-rule-filters`)
precisam do padrão e não podem arrastar zod para dentro da camada.

`buildTaxIdSchema` normaliza **antes** de validar:

```ts
z.string()
  .transform(normalizeTaxId)
  .refine((value) => pattern.test(value))
```

`regex().transform()` recusaria a minúscula antes de ter chance de subir a caixa. Como o `CHECK` do
banco só aceita maiúscula (T013/T014), a ordem inversa produziria `400` em documento válido.

### O que mudou

| Arquivo                                                             | Antes                                   | Agora                                                                    |
| ------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------ |
| `companies/presentation/company-settings.schema.ts`                 | `/^\d{14}$/` e `/^(?:\d{11}\|\d{14})$/` | `CNPJ_PATTERN`, `TAX_ID_PATTERN`, `parseTaxIdValue` no lookup            |
| `fleet/presentation/fleet-request.schema.ts`                        | `CNPJ`, `OWNER_TAX_ID`                  | `TAX_ID_PATTERN` no proprietário, `CNPJ_PATTERN` no `linkedTaxId`        |
| `cte-profiles/presentation/cte-emission-profile-request.schema.ts`  | `/^(?:[0-9]{8}\|[0-9]{14})$/`           | `MATCHER_TAX_ID` = raiz alfanumérica ou documento inteiro                |
| `nfse-profiles/presentation/nfse-profile-request.schema.ts`         | `CNPJ`                                  | `CNPJ_PATTERN`                                                           |
| `mdfe-manifests/presentation/mdfe-manifest-request.schema.ts`       | `TAX_ID`                                | `TAX_ID_PATTERN`, mantendo o `''` como padrão                            |
| `billing/presentation/billing.schema.ts`                            | `/^[0-9]{11,14}$/`                      | `DOCUMENT_FILTER_PATTERN`; a lista agora **devolve** o valor normalizado |
| `nfse-invoices/presentation/nfse-invoices.schema.ts`                | `TAX_ID`                                | `TAX_ID_PATTERN`                                                         |
| `freight/presentation/freight-rule-mutation.schema.ts`              | `TAX_ID`                                | `buildTaxIdSchema(CNPJ_PATTERN)`                                         |
| `freight-rules/domain/freight-rule-filters.policy.ts`               | `TAX_ID_PATTERN` local                  | `CNPJ_PATTERN`                                                           |
| `cte-batches/domain/cte-batch-eligibility.policy.ts`                | `FULL_TAX_ID_PATTERN` local             | `CNPJ_PATTERN`                                                           |
| `cte-profiles/domain/emission-profile-resolution.policy.ts`         | `FULL_TAX_ID_PATTERN` local             | `CNPJ_PATTERN`                                                           |
| `companies/infrastructure/fiscal-certificate-validation.gateway.ts` | `/^[0-9]{14}$/` inline                  | `CNPJ_PATTERN`                                                           |

Os cinco últimos não são fronteira HTTP, e é justamente por isso que entraram: sem eles a nota com
CNPJ alfanumérico passaria pelo `400` e seria recusada depois, como documento "sem participante" ou
perfil de emissão "com CNPJ inválido" — erro que aponta para o lugar errado.

`parseDocumentList` do faturamento validava item a item e devolvia a lista **crua**; agora devolve o
resultado da normalização. Como estava, `?customerDocumentIn=12abc...` passaria na validação e
consultaria o banco em minúscula, sem casar nada.

CPF não foi tocado em lugar nenhum: continua `^[0-9]{11}$` (`fleet_drivers_tax_id_check`,
`licenseNumber`, `taxId` do motorista). A IN não mexe em CPF.

### Versão do pacote

`@adatechnology/fiscal-provider` `0.3.0-rc.6` → `0.3.0-rc.7`, que é a versão que publica
`CNPJ_PATTERN`/`CHAVE_PATTERN`/`normalizeTaxId`. O contrato
`certificate-validation-gateway.contract.test.ts` fixa a versão exata e falhou no bump — que é a
função dele: subir pacote fiscal é decisão, não efeito colateral de `bun install`.

### Verificação

```
$ bun test ./test/tax-id-boundary.contract.test.ts
 11 pass
 0 fail
 46 expect() calls
```

T015 verde. Suíte da api: `2445 pass / 14 skip / 1 fail`; a falha continua sendo
`deploy/service-naming.contract.ts` — `cron-notifications` deployado sem entrada na tabela de build
de `docs/spec/railway.md`. Os dois arquivos estão intocados nesta spec (`git status` vazio para
ambos): é pendência dos commits de notificação.

`bun run lint`, `bun run typecheck` e `bun run format:check` limpos na raiz, nas quatro apps.

Varredura final: nenhum padrão numérico de CNPJ sobrou em `src/` fora do schema do banco (que já foi
aberto em T013). O que resta numérico é a chave de acesso em `cte-xml.mapper.ts` e
`nfe-documents.routes.ts`, que são T018.

## T017 — a busca na Receita para de apagar a letra ✅

### O defeito, medido

`fiscal-company-profile-lookup.gateway.ts` mandava tudo que vem da Receita por `onlyDigits` —
`value.replace(/\D/g, '')`. Para CEP e código de município isso é certo; para o documento, não.
Uma sonda com o `consultarCnpj` do pacote interceptado mostrou o estrago exato:

```
consultarCnpj devolve  12ABC34501DE35
gateway devolve        123450135
```

Nove caracteres. Não é um CNPJ errado — não é um CNPJ. O formulário de configuração da empresa
seria preenchido com isso, e o `400` do schema (T016) só apareceria depois, culpando quem digitou.

O `consultarCnpj` do `0.3.0-rc.7` já normaliza e valida o alfanumérico na entrada, e devolve o
documento na forma canônica; a mutilação era só nossa, do lado de cá.

### O contrato, escrito antes

`test/company-settings-application/company-profile-lookup.contract.ts`, registrado no entrypoint
`test/company-settings-application.contract.test.ts`. Seis casos:

| Caso                                     | O que prova                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| documento alfanumérico na ida e na volta | a letra chega ao `consultarCnpj` e volta ao chamador                            |
| resposta mascarada `12.ABC.345/01DE-35`  | a normalização é da máscara, não dos caracteres                                 |
| documento numérico legado                | nada quebrou para quem foi aberto antes de 01/07/2026                           |
| corpo inteiro do perfil                  | CEP `01310-100` → `01310100` e IBGE `3550308` seguem numéricos, UF sobe a caixa |
| consulta que falha                       | continua respondendo `null`, sem vazar a mensagem do provedor                   |
| origem da normalização                   | vem de `shared/tax-id.service.js`, e `onlyDigits(result.cnpj)` não voltou       |

O `consultarCnpj` é interceptado com `spyOn` sobre o módulo do pacote — mesmo recurso do contrato do
gateway de certificado. Nenhum teste toca a BrasilAPI.

Vermelho: `29 pass / 4 fail`. Os dois casos de documento legado e de falha passavam desde o começo,
como tinham de passar — o defeito só existia para quem tem letra.

### A correção

Uma linha: `cnpj: onlyDigits(result.cnpj)` → `cnpj: normalizeTaxId(result.cnpj)`, com o
`normalizeTaxId` vindo do mesmo seam que T016 criou, não do pacote direto. O `onlyDigits` continua
vivo para CEP e código de município, agora com uma linha dizendo por quê.

Varredura de irmãos: `replace(/\D/g` só sobrou em `rntrc.service.ts` (registro da ANTT, numérico
por definição) e no próprio helper do gateway. O `cte-xml.mapper.ts:125` tira o prefixo `CTe` de um
identificador de chave — é T018.

### Verificação

```
$ bun test ./test/company-settings-application.contract.test.ts
 33 pass
 0 fail
 111 expect() calls
```

Suíte da api: `2451 pass / 14 skip / 1 fail` (era `2445`; os 6 a mais são este contrato). A falha
segue sendo a de `deploy/service-naming.contract.ts`, alheia a esta spec.

`bun run lint`, `bun run typecheck` e `bun run format:check` limpos na raiz, nas quatro apps.

## T018 — máscaras, nome do arquivo e código de barras ✅

### O defeito medido, não suposto

`formatDacteDocumentNumber('12ABC345000135')` devolvia `123.450.001-35` — um CNPJ impresso sob
máscara de CPF. É a colisão prevista: apagar o que não é dígito deixa onze caracteres num CNPJ de
três letras, e onze é o comprimento do CPF.

A máscara da fatura (`invoice-layout.policy.ts`) media **sem** filtrar, então acertava o
alfanumérico por acidente; o que ela errava era o oposto — aceitava qualquer coisa com catorze
caracteres (`DOCUMENTO NULO` sairia `DO.CUM.ENT/O NU-LO`) e imprimia letra minúscula como veio.
As duas passam a normalizar e casar conjunto (`CNPJ_PATTERN` / `CPF_PATTERN`), e o CNPJ sai por
`formatCnpjForDisplay` do pacote fiscal, reexportado pelo seam `shared/tax-id.service.ts`.

### O código de barras

O item 6 da NT Conjunta DF-e 2025.001 diz que o CODE-128C "não é compatível" com chave
alfanumérica. O `bwip-js` com `bcid: 'code128'` já alterna Code Set sozinho, mas confiar na
observação não é evidência: `test/cte-issuance-infrastructure/dacte-barcode.contract.ts` decodifica
o símbolo com uma tabela ISO/IEC 15417 de 107 padrões escrita à mão — referência externa, não
derivada do gerador. Quem confere a tabela é o próprio caso numérico: uma entrada errada faria a
chave de 44 dígitos decodificar em lixo e o dígito verificador `(start + Σ i·valor_i) % 103` não
fecharia.

| Chave                                          | Code Set         | Round-trip |
| ---------------------------------------------- | ---------------- | ---------- |
| `35260700000000000191570010000000011000000010` | `C` só           | idêntica   |
| `35260812ABC34501DE35570010000000011000000017` | alterna `C`↔`B` | idêntica   |

O `bcid` virou `ACCESS_KEY_SYMBOLOGY` exportado, para o contrato decodificar exatamente a
simbologia que a produção desenha, e não uma constante paralela. O comentário desatualizado
("Code128C, como o MOC exige") foi substituído pela regra da NT.

### O nome do arquivo

`sanitizeFileName` recusava toda chave com letra (`/^[0-9]{44}\.xml$/`) e caía para
`${accessKey}.xml`. Como o repositório monta o nome exatamente assim
(`drizzle-nfe-document.repository.ts:213`), a queda devolve a mesma string e **o defeito não aparece
na resposta HTTP** — está registrado no contrato que a guarda é estrutural por esse motivo, em vez
de fingir um caso vermelho que não existe. O comportamento que o contrato guarda de verdade é o
outro: nome fora do padrão (`../../etc/passwd`) continua sendo trocado pela chave.

### Contratos

| Suíte                                        | Caso                                                                                                                                                            |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cte-issuance-domain/dacte-layout`           | CNPJ alfanumérico pontuado; numérico e CPF intactos; três letras nunca sob máscara de CPF; chave alfanumérica agrupada de quatro em quatro sem perder caractere |
| `cte-issuance-infrastructure/cte-xml-mapper` | chave alfanumérica lida do `infCte Id`; letra fora das doze posições do CNPJ e chave minúscula recusadas                                                        |
| `cte-issuance-infrastructure/dacte-barcode`  | Code Set por chave, round-trip e dígito verificador; PNG das duas chaves                                                                                        |
| `billing-domain/invoice-layout`              | CNPJ alfanumérico da transportadora e do tomador; rótulo `CPF`/`CNPJ` por conjunto; coluna do destinatário normalizando antes de mascarar                       |
| `nfe-http/download-and-reprocess`            | nome fora do padrão trocado pela chave; guarda estrutural do `CHAVE_PATTERN`                                                                                    |

Vermelho antes da implementação: `formatDacteDocumentNumber` com dois casos falhando,
`cte-issuance-infrastructure` sem subir (`ACCESS_KEY_SYMBOLOGY` inexistente), fatura com a letra
minúscula chegando ao papel, rota ainda com o literal só de dígito. Verde depois:
`196 pass / 0 fail` nas quatro suítes.

Suíte da api: `2467 pass / 14 skip / 1 fail` (era `2451`; os 16 a mais são estes contratos). A falha
segue sendo a de `deploy/service-naming.contract.ts`, alheia a esta spec.

`bun run lint`, `bun run typecheck` e `prettier --check .` limpos na raiz, nas quatro apps.

### Varredura das guardas de comprimento que ficaram

`cte-payload.builder.ts:67-69`, `mdfe-payload.builder.ts:189,332,336` e
`cte-receiver-ie.policy.ts:34` continuam decidindo CNPJ/CPF por comprimento — mas sobre o documento
**já normalizado**, sem filtrar não-dígito antes. Um CNPJ alfanumérico tem catorze caracteres nessa
forma, então o ramo escolhido é o certo; não são o defeito desta task e não foram tocados. O
`nfe-distribution-item.mapper.ts` do worker é T019/T020.

## T019 — a chave alfanumérica do resumo de distribuição ✅

Contrato acrescentado a `apps/worker-transportada/test/nfe-distribution/document-classification.contract.ts`
(a suíte já está registrada no entrypoint `test/nfe-distribution.contract.test.ts`, que já está na
lista literal do `package.json` — nenhum arquivo novo a registrar).

### O defeito, medido

`resolveSummaryAccessKey` tem duas guardas, e as duas são só de dígito
(`nfe-distribution-item.mapper.ts:19,23`): `ACCESS_KEY_PATTERN = /^[0-9]{44}$/` sobre o `chaveNfe`
que o pacote fiscal entrega, e `SUMMARY_ACCESS_KEY_ELEMENT` sobre o `<chNFe>` do próprio XML. Uma
chave de emitente com CNPJ alfanumérico falha nas duas e volta `undefined`.

O que acontece depois não é descarte do item — é pior. O resumo **é** gravado: vai para o bucket sob
`nsu-<nsu>` (`nfe-distribution-persistence.adapter.ts:239`) e a linha entra sem `access_key`
(`buildDistributionSummary` omite a chave ausente). Ele conta como aceito, não aparece em
`skippedCount` nem em `invalidCount`, e não sai em log nenhum.

Duas consequências, ambas medidas no contrato:

1. A coluna fica nula, e a nota nunca se liga ao documento completo que chegar depois.
2. A chave não entra em `findStoredAccessKeys` — `storedLookups` volta `[]`. Sem participar da
   deduplicação, **a mesma nota é reimportada em toda janela da distribuição**, para sempre.

### Sobre "hoje é silencioso"

A frase da task não vale para o pulo. `resolveSkip` + `logSkip`
(`nfe-distribution-persistence.adapter.ts:296-330`) já emitem `nfe_distribution_item_skipped` com
`reason`, `nsu`, `schema` e `errorCode` para os dois motivos que existem (`unsupported_document` e
`already_stored`), e dois contratos anteriores já guardam isso. Silencioso é o caso acima: o resumo
gravado **sem chave**, que passa por sucesso. O contrato exige um log próprio para ele,
`nfe_distribution_summary_access_key_missing` — mensagem separada porque nada foi pulado.

### Mudança de fixture

`assertAccessKeyConstraint` dizia espelhar `nfe_import_items_access_key_check` e ainda testava
`/^[0-9]{44}$/`. O CHECK foi alargado no T014 para `^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$`; o espelho foi
atualizado junto. Mantê-lo velho faria o caso alfanumérico ficar vermelho pelo motivo errado — por
uma restrição que o banco já não tem.

### Vermelho

`bun test ./test/nfe-distribution.contract.test.ts` → `43 pass / 4 fail`, cada um pelo seu motivo:

| Caso                                                    | Esperado                           | Hoje        |
| ------------------------------------------------------- | ---------------------------------- | ----------- |
| chave alfanumérica em `chaveNfe`                        | gravada e guardada no bucket       | `undefined` |
| chave alfanumérica só no `<chNFe>`, com prefixo de _ns_ | lida do XML                        | `undefined` |
| chave alfanumérica na deduplicação                      | `storedLookups` com ela; duplicado | `[]`        |
| resumo gravado sem chave                                | um `warn` com `nsu` e `schema`     | log nenhum  |

## T020 — o worker deixa de perder a chave e compara documento canonicalizado ✅

### O pacote, antes do resto

O worker estava em `@adatechnology/fiscal-provider` **0.3.0-rc.6**, que não exporta as primitivas —
`dist/index.d.ts` de rc.6 não tem `CHAVE_PATTERN`, `CNPJ_PATTERN` nem `normalizeTaxId`; rc.7 tem, na
linha 13. Sem o bump não havia como fazer a guarda vir do pacote, e reescrever o padrão no worker
seria a cópia que envelhece. `apps/worker-transportada/package.json` foi para `0.3.0-rc.7` (a mesma
versão que a api já usa desde o T016) e os **dois** contratos que fixam a versão auditada foram
atualizados junto: `test/environment.contract.ts` e `test/nfe-distribution/gateway.contract.ts`. O
cron não depende do pacote fiscal.

### Seam

`apps/worker-transportada/src/shared/tax-id.service.ts`, mesmo molde do da api: reexporta
`CHAVE_PATTERN`, `CNPJ_PATTERN` e `normalizeTaxId`. Os três sítios importam dele, não do pacote.

### Os quatro pontos

| Sítio                                                             | Antes                                        | Depois                                                       |
| ----------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ |
| `nfe-distribution-item.mapper.ts` — `chaveNfe` do pacote          | `ACCESS_KEY_PATTERN = /^[0-9]{44}$/`         | `CHAVE_PATTERN`, constante local apagada                     |
| `nfe-distribution-item.mapper.ts` — `<chNFe>` do XML              | captura `([0-9]{44})`                        | captura `([A-Za-z0-9]{44})` e **valida** com `CHAVE_PATTERN` |
| `nfe-import-consumer.service.ts:330` — evento é da empresa?       | `accessKey.slice(6,20) === companyCnpj`      | os dois lados por `normalizeTaxId`, `relatedCnpjs` inclusive |
| `drizzle-nfe-distribution-profile.repository.ts:86` — certificado | `certificate.validatedCnpj !== profile.cnpj` | os dois lados por `normalizeTaxId`                           |

A captura ficou frouxa **e** a validação estrita de propósito: uma chave minúscula é recusada em vez
de ser subida de caixa em silêncio — inventar caixa num documento fiscal é inventar dado. Ela cai no
log novo, e por isso é investigável.

E o log novo, `nfe_distribution_summary_access_key_missing`, emitido em `prepareItemOrSkip` com
`companyId`, `importId`, `nsu` e `schema` — mensagem separada de `nfe_distribution_item_skipped`
porque nada foi pulado: é aceite degradado, não descarte.

### Verde

- `bun run --cwd apps/worker-transportada test` → **449 pass / 0 fail** (era 445; os 4 são o T019).
- `make worker-integration` → **39 pass / 0 fail** em 10 arquivos, com Postgres, RabbitMQ e MinIO de
  pé — inclui `nfe-distribution-profile.integration.test.ts`, que exercita o repositório de perfil
  contra o banco de verdade.
- `bun run lint` e `bun run typecheck` limpos nas quatro apps; `prettier --check` limpo no worker.

### Varredura

`grep -E '\[0-9\]\{(14|44)\}|\\d\{(14|44)\}|replace\(/\\D/g|slice\(6, ?20\)'` em
`apps/worker-transportada/src` e `apps/cron-transportada/src` devolve **um único acerto**: a linha
330 já corrigida. Não restou guarda de documento só de dígito nas duas apps.

## T021 — as cópias por valor depois da Fase C ✅

### O que a Fase C podia ter quebrado, e não quebrou

A migration `20260814191354_tax_id_alphanumeric/migration.sql` tem 17 linhas e **todas** são
`ALTER TABLE … DROP CONSTRAINT … ADD CONSTRAINT …`: nenhuma coluna mudou de tipo, de tamanho ou de
nome. A Fase C alargou CHECK, e só isso.

E CHECK não existe nas cópias:

```
grep -rE "check\(|\[0-9\]\{|\\d\{|A-Z0-9" \
  apps/worker-transportada/src/database apps/cron-transportada/src/database
→ (vazio)
```

As cópias declaram coluna, não constraint — quem gera migration é a API. Logo a Fase C **não tem
contraparte a atualizar** no worker nem no cron. Isso é a resposta da task; o resto abaixo é a
conferência que a task pede de qualquer jeito.

### Conferência coluna a coluna, não por leitura

Comparação automatizada: para cada `pgTable` das duas apps, o objeto de colunas foi extraído e
confrontado com a definição da mesma tabela na API (corte por vírgula em profundidade zero, para
pegar declaração multilinha com `.references()` encadeado). Resultado:

- **Nenhuma coluna fantasma.** Toda coluna declarada numa cópia existe na API, com o mesmo nome de
  coluna física. Uma cópia com coluna a mais seria escrita contra tabela que não a tem.
- 63 tabelas divergem em **texto**, e a divergência cai em três classes que a cópia omite de
  propósito: `.references(…)` (a FK é da API, que é quem gera migration), `.default*()` (o default
  é do banco, não do cliente) e o estreitamento `$type<…>` (nome de tipo local).
- Fora dessas três classes sobraram **5**, e 4 são cosméticas: `moneyColumn(name)` na API é
  literalmente `numeric(name, { precision: 19, scale: 4 })`, o mesmo que as cópias escrevem à mão
  (2 casos); e `text()` vs `text('status')`, que resolvem para a mesma coluna (2 casos).

### A única divergência real — corrigida

|                                         | API                          | cópia do cron                |
| --------------------------------------- | ---------------------------- | ---------------------------- |
| `nfse_issuance_attempts.attempt_number` | `bigint({ mode: 'bigint' })` | `bigint({ mode: 'number' })` |

`mode` não muda a coluna, muda o que o Drizzle materializa em JS. Hoje é inerte porque o cron só usa
a coluna em `orderBy(desc(…))` (`drizzle-nfse-reconciliation.repository.ts:443`), que nunca traz o
valor para o JS — mas a primeira leitura devolveria `number` de um lado e `bigint` do outro, e é
exatamente o tipo de divergência que só aparece quando já está em produção. Alinhada para `bigint`.

### As quatro cópias do trilho de NFS-e

Elas são reduções, não espelhos — o cron só consulta situação e baixa documento. O que importava
conferir:

- **Documento fiscal:** `grep -E "taxId|cnpj|\[0-9\]\{14\}|replace(/\D/g"` nos quatro pares
  devolve **dois acertos, ambos no worker**: `taxId: z.string().min(1)` e
  `TomadorCnpjCpf: input.taker.taxId` em `nfse-fiscal-gateway.ts`. Nenhuma das cópias do cron toca
  em CNPJ, então a Fase C não tem o que atualizar ali — e o schema do worker já aceita letra, por
  não ser padrão de dígito.
- **AAD do envelope:** idêntico nos dois lados, `transportada:nfse-credential:v1:${companyId}:${credentialId}`.

### Inventário — `CLAUDE.md` está desatualizado

O `CLAUDE.md` cita duas cópias no worker e cinco no cron. Existem mais:

- worker `src/database/`: `cte-issuance-execution`, `identity`, `invitation-delivery`,
  `mdfe-issuance-execution`, `nfe`, `nfse-issuance-execution`, `password-reset-delivery`,
  `processing` — **8**, não 2.
- cron `src/database/`: `billing`, `company-distribution-settings`, `digital-certificate`,
  `distribution-cursor`, `identity`, `nfe`, `nfse-reconciliation`, `processing` — **8**, não 1.

Todas entraram na conferência acima. A correção do texto fica para o T025.

### Verde

- `bun run --cwd apps/cron-transportada test` → **151 pass / 0 fail** (7 arquivos), inclui
  `nfe-distribution-pull` e `nfse-status-pull`, os dois contratos de paridade do cron.
- `bun run --cwd apps/worker-transportada test` → **449 pass / 0 fail**.
- `bun test apps/api-transportada/test/companies.contract.test.ts` → **71 pass / 0 fail**, que é
  onde vive `scheduled-distribution-parity.contract.ts`.
- `typecheck` limpo no worker e no cron.

### Vermelho que não é desta feature

`bun run typecheck` da API está vermelho em dois arquivos de teste de frota
(`VEHICLE_COLORS` importado de `fleet.schema.ts`, que não o exporta). É trabalho de frota **não
commitado** em voo na árvore — nenhum arquivo de frota foi tocado pela 037, e todo erro de tipo da
API está em caminho `fleet`. Registrado para não passar por verde nosso.

## T022 — o contrato do frontend, vermelho ✅

`apps/frontend-transportada/test/shared/alphanumeric-tax-id.contract.ts`, registrado em
`test/shared.contract.test.ts` (a lista de arquivos de teste do `package.json` já aponta para esse
entrypoint — suíte nova ali dentro roda sem tocar no manifesto).

### O que o contrato prende

- **O seam que ainda não existe.** `src/modules/shared/taxId.service.ts` com `CNPJ_LENGTH`,
  `CNPJ_PATTERN`, `hasValidCnpjCharacterSet` e `normalizeTaxId`. O frontend não importa
  `@adatechnology/fiscal-provider` — a regra é reescrita, e é o contrato que garante que ela diz a
  mesma coisa que a do backend. O import é dinâmico por variável, para o módulo ausente reprovar o
  teste sem reprovar o `tsc`.
- **"Sem mover o cursor" como propriedade conferível.** Subir a caixa é mapa de um caractere para um
  caractere: o contrato percorre todo prefixo de `12abc34501de35` e exige comprimento preservado.
  Sem DOM na app, é assim que a promessa vira asserção em vez de inspeção manual.
- **O conjunto conferido posição a posição.** `12ABC` pela metade é conjunto válido (erro de
  comprimento); `12ABC34501DEX5`, com letra no dígito verificador, é conjunto inválido. Sem isso o
  campo pela metade acusaria os dois erros ao mesmo tempo.
- **O erro de conjunto separado do de comprimento.** Razão `characterSet` própria, com
  `validationCharacterSet` nos dois locales — hoje `digitLengthError` tira as letras com `\D` e
  acusa "faltam dígitos" para quem digitou o documento certo.
- **A máscara com letra.** `12ABC34501DE35` → `12.ABC.345/01DE-35`, e as expectativas numéricas de
  hoje (`123456` → `12.345.6`, excedente cru) continuam valendo como regressão.
- **`maxLength` segue 14** nos três campos, e `inputMode="numeric"` sai deles. O teclado numérico do
  celular não tem letra: mantê-lo trancaria o usuário fora do próprio documento. O campo de CPF do
  motorista continua numérico — o contrato guarda os dois lados.

### Vermelho

- `bun test test/shared.contract.test.ts` → **44 fail / 45 pass** (89 testes).
- `bun run test` (frontend inteiro) → **44 fail / 1175 pass** (18 arquivos): todo o vermelho é do
  contrato novo, nenhuma suíte existente quebrou.
- Os 45 verdes da suíte são as quatro suítes que já viviam ali mais as linhas de regressão que já
  valem hoje (máscara numérica, campo obrigatório vazio, CPF/e-mail/chave aleatória do Pix, o CPF do
  motorista com teclado numérico, e a credencial de NFS-e recusando letra no dígito verificador).
- `prettier --check` e `eslint` limpos. `typecheck` do frontend sem nenhum erro do arquivo novo —
  segue vermelho só em `test/design-system/select.contract.ts`, que é o trabalho de frota não
  commitado já registrado no T021.

### Correção de caminho para o T023

`nfseCredentialForm.service.ts` está em `src/modules/nfse-invoice/shared/`, não em
`company-settings/shared/` como o `tasks.md` dizia. Texto corrigido na própria task.

## T023 — a implementação que deixa o contrato verde ✅

### O seam

`apps/frontend-transportada/src/modules/shared/taxId.service.ts` — `CNPJ_LENGTH`, `CNPJ_PATTERN`
(`/^[A-Z0-9]{12}[0-9]{2}$/u`), `normalizeTaxId` (tira `[./\-\s]` e sobe a caixa) e
`hasValidCnpjCharacterSet` (posição a posição: base alfanumérica, dois dígitos verificadores
numéricos). O bundle do frontend não carrega `@adatechnology/fiscal-provider`, então a regra é
reescrita aqui e quem garante a paridade com o backend é `test/shared/alphanumeric-tax-id.contract.ts`.

### Onde entrou

| Arquivo                                                                                           | Mudança                                                                                                      |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `company-settings/shared/companySettingsMask.service.ts`                                          | `formatCnpj` fatia por posição (`0-2 . 2-5 . 5-8 / 8-12 - 12-14`) em vez de agrupar `\d`                     |
| `company-settings/shared/companySettingsFormValidation.service.ts`                                | razão `characterSet` separada de `digitLength`                                                               |
| `company-settings/locales/companySettings{,.en}.locale.json`                                      | `validationCharacterSet`                                                                                     |
| `company-settings/shared/pixKeyType.service.ts`                                                   | detecção e normalização do CNPJ pela forma canônica                                                          |
| `nfse-invoice/shared/nfseCredentialForm.service.ts`                                               | `TAX_ID_PATTERN = /^\d{14}$/` virou `CNPJ_PATTERN` sobre o valor canônico                                    |
| `fleet/shared/fleetForm.service.ts`                                                               | `owner.taxId` e `linkedTaxId` por `normalizeTaxId`; CPF, CNH, telefone e RENAVAM seguem em `normalizeDigits` |
| `company-settings/components/CompanySettingsForm.component.tsx`, `hooks/useCompanyWizard.hook.ts` | consulta de CNPJ com o valor canônico                                                                        |

### O teclado numérico era um defeito

`inputMode="numeric"` num campo de CNPJ tranca o usuário para fora do próprio documento depois da
IN: o teclado do celular não tem letra. Saiu de seis campos — `DriverForm` (só o
`driverLinkedTaxId`; o `driverTaxId`, que é CPF, mantém), `VehicleOwnerFields`,
`CteProfileMatcherFields`, `CompanyProfileFields`, `NfseCredentialPanel` e `NfseInvoiceFilters`. Nos
seis o `onChange` passou a canonicalizar, para a letra aparecer maiúscula enquanto se digita.

Dois deles o `tasks.md` não listava: `NfseCredentialPanel:150` é o CNPJ da credencial da prefeitura,
e `NfseInvoiceFilters:49` alimenta `takerTaxIdEq`, que compara com o valor canônico gravado — sem
`normalizeTaxId` o filtro não acharia uma nota de tomador alfanumérico digitado em minúscula.

Em compensação, `BillingDefaultsFields:42` **não** é CNPJ: os dois usos de `digitsOnly` ali são
código e agência de banco. Ficou como estava.

`CompanyProfileFields` precisou de mais que uma deleção. O `inputMode === 'numeric'` acumulava três
papéis — teclado, normalização e `maxLength={undefined}` — e o CNPJ precisa dos dois últimos sem o
primeiro; tirar só o `inputMode` devolveria `maxLength=14` sobre uma exibição mascarada de 18
caracteres, cortando o documento em silêncio. A definição do campo ganhou
`normalize: 'digits' | 'taxId'`, e é dela que saem a normalização e o `maxLength`.

### Verde

```
bun run --cwd apps/frontend-transportada test
  1219 pass · 0 fail · 6338 expect() · 18 arquivos
bun run lint          → limpo nas quatro apps
bun run --cwd apps/frontend-transportada typecheck → limpo
```

`bunx prettier --check .` acusa só `apps/api-transportada/drizzle/.../snapshot.json` e
`apps/frontend-transportada/src/styles/index.css`, ambos do WIP de frota que já estava na árvore.

## T024 — Ponta a ponta com emitente alfanumérico

`apps/api-transportada/test/integration/alphanumeric-cnpj-end-to-end.integration.ts`, registrado no
`test:integration` do `package.json` da API. Uma NF-e de terceiro cujo emitente é o CNPJ
alfanumérico da IN (`12.ABC.345/01DE-35` → `12ABC34501DE35`) atravessa banco → lote → frete →
payload do CT-e → DACTE → fatura, num Postgres descartável migrado do zero, com a transportadora
(nós) num CNPJ numérico — é assim que a operação real é: a letra vem do cliente.

A chave da nota carrega o documento nas posições 7 a 20
(`352608` + `12ABC34501DE35` + `550010000000181000000018`), o que exercita o CHECK relaxado
`^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$` de `nfe_documents` na escrita — a primeira corrida reprovou ali,
por uma chave de 43 caracteres, e foi o próprio CHECK que acusou.

O que cada etapa provou:

- `findCteIssuancePayloadSource` devolve `invoices[0].sender.taxId === '12ABC34501DE35'` e a chave
  inteira — a leitura não normaliza nem trunca.
- `assembleCteIssuancePayload` põe o remetente como **`cnpj`**, e o teste afirma a ausência de
  `cpf` no mesmo objeto: é a discriminação por comprimento de `toParticipante` (14 → CNPJ) sendo
  verificada com letras dentro, que é onde ela poderia ter escorregado para a máscara de CPF.
- O registro resultante entra em `cte_issuance_payloads` — `taker_tax_id` alfanumérico aceito.
- O DACTE monta a partir de um XML autorizado sintético com o documento em `<rem>`, e a impressão
  sai pontuada como `12.ABC.345/01DE-35` (guarda de conjunto, não de comprimento).
- A fatura: `listEligible` → `preview` → `create` → `get` agrupam e persistem
  `customer_document = '12ABC34501DE35'`; o filtro por documento em minúscula devolve vazio, que é
  o comportamento correto de comparação com o valor canônico gravado.

### Verde

```
bun test ./test/integration/alphanumeric-cnpj-end-to-end.integration.ts
  1 pass · 0 fail · 21 expect()
bun run --cwd apps/api-transportada test:integration
  93 pass · 3 skip · 0 fail · 970 expect() · 20 arquivos
bun run --cwd apps/api-transportada typecheck → limpo
bun run lint → limpo nas quatro apps
```

### Nenhum documento em claro no log

A saída completa da corrida foi capturada em arquivo e varrida:

```
12ABC34501DE35        → 0 ocorrências
12.ABC.345/01DE-35    → 0 ocorrências
35260812ABC34501DE35  → 0 ocorrências
```

O documento não aparece nem nos nomes dos testes, justamente para a varredura significar alguma
coisa. Vale o registro do porquê de o resultado ser zero por construção: **nenhum dos seams desta
cadeia recebe logger** — `findCteIssuancePayloadSource`, `assembleCteIssuancePayload`,
`buildDacteLayout` e o caso de uso de faturamento são todos puros ou só de banco. O log de request
que existiria em produção fica em `http/request-handler.service.ts`, e ele registra
`correlationId`, método e rota — nunca o corpo.

Um achado ao lado, que não é vazamento de log mas merece ficar escrito:
`CtePayloadInvalidTaxIdError` embute o documento na mensagem
(`The tax id ${taxId} is neither a CPF nor a CNPJ.`). Conferido em `http/response.service.ts`: a
mensagem de `ApiError` vai para o **corpo da resposta** do mesmo chamador autenticado e
**não** passa por `safeLogError` — só erro desconhecido é logado, e por `describeErrorForLog`.

### O que esta corrida não prova

Assinatura e transmissão. O XML do CT-e nasce no worker, via `SefazCteProvider` do
`@adatechnology/fiscal-provider`, que exige certificado e rede; a API só importa tipos e
validadores do pacote, e uma app não importa código-fonte de outra. O DACTE aqui parte de um XML
autorizado sintético. **Aceitação pela SEFAZ de um CT-e com tomador alfanumérico continua sem
evidência** — depende de ambiente de homologação com certificado, e fica como verificação de
campo no primeiro documento real.

## T025 — A regra no `CLAUDE.md`

Seção nova **"Documento fiscal: o CNPJ tem letra"**, antes de "Convenções", porque a regra atravessa
as quatro apps e não cabia dentro de nenhuma delas. Ela diz três coisas, que é o que a task pedia:

1. **O padrão** — `[A-Z0-9]{12}[0-9]{2}`, letra só na base, DV numérico, CPF intacto; e a chave de
   acesso como `^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$`, com a lista dos schemas que carregam esse CHECK.
2. **Onde a canonicalização acontece** — `shared/tax-id.service.ts` na API (o único ponto que
   importa o padrão do pacote fiscal) e `shared/tax-id.schema.ts` com a ordem
   `transform` → `refine`, que é a parte fácil de errar; o reexport do worker; e o frontend, onde a
   regra é reescrita por o bundle não carregar o pacote fiscal, com o contrato que amarra as duas.
3. **O que continua sendo por comprimento** — `toParticipante` escolhendo `cnpj` em 14 e `cpf` em
   11, que sobrevive à IN porque o CNPJ alfanumérico continua tendo 14; contra
   `formatDacteDocumentNumber`, que **precisou** virar guarda de conjunto, porque filtrar por dígito
   deixava onze num CNPJ de três letras e imprimia sob a máscara de CPF.

De quebra, corrigido o aviso de cópia de schema do worker, que listava dois arquivos: são **oito**
em `apps/worker-transportada/src/database/` e outros oito no cron (conferido por `ls`).

### Verde

```
bun run lint       → limpo nas quatro apps
bun run typecheck  → limpo nas quatro apps
bun run build      → limpo (API, worker, cron, frontend + PWA)
bun run --cwd apps/api-transportada test:integration
  93 pass · 3 skip · 0 fail
```

### `make check` não fecha, e não é desta spec

O gate para em dois pontos, ambos de WIP alheio que já estava na árvore (326 arquivos sujos no
momento desta corrida):

- `format:check` acusa `apps/api-transportada/drizzle/20260814211033_fleet_vehicle_color_list/snapshot.json`,
  `apps/frontend-transportada/src/styles/index.css` (frota) e
  `specs/038-custo-por-quilometro-derivado/plan.md`. Nenhum é desta spec, e nenhum foi tocado aqui —
  `prettier --check` passa nos dois arquivos que esta task mexeu.
- `bun run test` fecha em **2470 pass · 14 skip · 1 fail**, e a única falha é
  `test/deploy/service-naming.contract.ts`: o workflow deploya `cron-notifications`, que a tabela de
  build do compose ainda não declara. É do trabalho de notificações, não toca em documento fiscal.

Consertar qualquer um dos dois seria mexer em trabalho de outra feature no meio da árvore.
