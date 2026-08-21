# 048 — O documento preenche a ficha

> ⚠️ **Esta spec tem `[NEEDS CLARIFICATION]` aberto** (§ Pendências). Nada da Fase CNH e da Fase ANTT
> se implementa até as amostras chegarem. A Fase CRLV está medida e pode andar.

## Problema e resultado

Cadastrar um veículo hoje é digitar dezesseis campos lendo um PDF na outra janela: placa, RENAVAM,
chassi, marca, modelo, ano, cor, combustível, carroceria, espécie, eixos, PBT, mais nome, CPF/CNPJ,
UF e RNTRC do proprietário. Motorista é a mesma coisa com a CNH na mão. É digitação de dado que já
está estruturado no documento — e cada dígito digitado é um dígito que pode sair errado num MDF-e.

**Resultado:** o operador solta o PDF na tela, o produto **reconhece que documento é aquele**, extrai
o que sabe ler, **confere o que dá para conferir sozinho** e devolve o formulário pré-preenchido com
cada campo marcado como _vindo do documento_. Quem grava continua sendo o operador.

## O que já está medido (não é hipótese)

Medições feitas em 19–20/08/2026 sobre dois CRLV-e reais (`GCQ8E47`, `FFV2D95`) com `pdfjs-dist`:

| Fato                                        | Evidência                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| CRLV-e tem camada de texto                  | `/Font` presente, `DCTDecode` ausente, 93 operadores de texto                                                       |
| pdf.js lê sem `eval`                        | `isEvalSupported: false` extraiu os 101 fragmentos → compatível com `script-src 'self'`                             |
| A CSP **não muda**                          | `worker-src 'self'` já está publicado; a API `File` não toca a rede — nada entra em `connect-src`                   |
| 16 de 16 campos extraídos nos dois veículos | rótulo → valor por geometria (`transform[4]`/`[5]`), valor até 26pt abaixo do rótulo e a menos de 6pt na horizontal |
| A placa do CRLV já casa com a nossa         | `GCQ8E47` e `FFV2D95` batem em `^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$` sem normalizar                                     |
| PDF digitalizado existe de verdade          | `Documento Escaneado.pdf` devolveu **0 caractere** — é imagem, cai na fase de OCR                                   |

**Ordem de leitura não serve.** O CRLV é formulário: lido em sequência, `PLACA` vem seguido de
`EXERCÍCIO`, não do valor da placa. O casamento é geométrico ou não é.

## A identificação é pelo título, nunca pela palavra solta

Medido: o CRLV **contém a palavra "CNH"** — no rodapé promocional da Carteira Digital de Trânsito
(_"você tem acesso ao CRLV, à CNH e ainda ganha desconto de 40% nas infrações"_). Um classificador
"contém CNH → é CNH" chama todo CRLV de habilitação, e o operador só descobre quando o formulário
de motorista abre com dado de veículo.

Quem identifica é o **título oficial no topo da página**, na posição dele:

- `CERTIFICADO DE REGISTRO E LICENCIAMENTO DE VEÍCULO` → CRLV-e
- CNH → `[NEEDS CLARIFICATION: título e posição, sem amostra]`
- ANTT → `[NEEDS CLARIFICATION: título e posição, sem amostra]`
- nada casou → **desconhecido**, e o produto diz isso em vez de adivinhar

Documento desconhecido não é erro: é o formulário em branco como sempre foi, com um aviso.

## A análise é o que dá para conferir sem pedir nada a ninguém

Tudo offline, no navegador, sem consultar Detran, ANTT ou Receita — não temos convênio com nenhum
dos três, e inventar consulta paga é justamente o que a pergunta excluiu.

1. **Dígito verificador** — CPF, CNPJ (o alfanumérico da IN 2229/2024 inclusive) e RENAVAM. Dígito
   que não fecha é erro de leitura ou documento adulterado; nos dois casos o campo não se
   pré-preenche sozinho.
2. **Formato fechado** — placa no padrão Mercosul/antigo, chassi com 17 caracteres, UF entre as 27.
3. **Validade** — documento vencido (exercício do CRLV, validade da CNH, validade do RNTRC) entra
   como **aviso**, não como bloqueio: cadastrar veículo com licenciamento vencido é operação
   legítima, esconder que ele está vencido não é.
4. **Coerência com o que já está cadastrado** — placa que já existe na frota vira "isto é o veículo
   X, quer atualizar?" em vez de um cadastro duplicado que a constraint recusa no fim do formulário.
5. **Coerência interna** — ano de modelo antes do ano de fabricação, CPF do proprietário igual ao do
   motorista sendo cadastrado (que é o que decide `ownership: 'aggregate'`).

## O que o CRLV preenche, e o que ele _não_ preenche

Direto: `plate`, `renavam`, `brand`/`model` (partindo `MARCA / MODELO / VERSÃO` no primeiro `/`),
`modelYear`, `color` (`BRANCA` → `branca`), `fuelType` (`ALCOOL/GASOLINA` → flex, `DIESEL` → diesel),
`axleCount`, `bodyType` (`FURGAO` → tpCar `02`), `state`, `owner.name`, `owner.taxId`.

**`capacityKilograms` não sai do PBT.** O CRLV imprime `PESO BRUTO TOTAL` (1.76 e 3.5 toneladas nos
dois veículos medidos), que é tara + carga; a tara ele não imprime. Capacidade é PBT menos tara, e
faltando metade da conta o campo fica em branco — número errado de capacidade vira frete errado.

**`EIXOS` pode vir `*`.** Um dos dois veículos medidos traz asterisco onde estaria o número: o
Detran não informou. Asterisco vira campo vazio, nunca `0`.

`freightClass`, `ownership`, `fleetNumber` e todos os custos continuam sendo decisão do operador —
não estão no documento.

## Fora do escopo

- **OCR de print e foto.** O `Documento Escaneado.pdf` prova que o caso existe, e Tesseract.js é o
  caminho livre — mas o modelo tem de ser servido da nossa origem (a CSP proíbe CDN), pesa alguns MB
  no PWA e erra feio em documento plastificado com holograma. Fase própria, com o custo declarado.
- **Consulta a base oficial.** Sem convênio Detran/ANTT/Receita, não há o que consultar de graça.
- **Guardar o documento.** O arquivo é lido na memória do navegador e descartado. Nada de bucket,
  nada de coluna nova, nada que a ADR-0039 tenha de criptografar depois.

## Privacidade

O PDF **não sai da máquina do operador**: `File` → `ArrayBuffer` → pdf.js, tudo no navegador. Nenhuma
requisição, nenhuma origem nova na CSP, nenhum PII em log — nem em `debug`. É o oposto do que o
endereço do motorista faz hoje (§ `docs/SECURITY.md`), e de propósito: aqui não há terceiro
envolvido, então não há razão para envolver um.

## Pendências

- `[NEEDS CLARIFICATION]` **Amostra de CNH em PDF.** A CDT gera PDF, então o caminho provavelmente é
  o mesmo — mas isso é hipótese. Sem um arquivo não se escreve mapa de campo.
- `[NEEDS CLARIFICATION]` **Amostra de carteira ANTT/RNTRC em PDF.** É o documento que alimenta
  `owner.rntrc` e `owner.taxRegime` (tpProp `0` agregado / `1` independente / `2` outros), os dois
  campos que ninguém consegue conferir de cabeça. Layout não verificado.

## Histórias priorizadas

### P1 — O CRLV preenche a ficha do veículo

**Given** o operador no formulário de veículo
**When** ele solta o PDF do CRLV-e
**Then** os campos legíveis chegam preenchidos e marcados como vindos do documento, e o que o
documento não diz continua em branco.

### P1 — O produto diz que documento é aquele

**Given** um PDF qualquer
**When** ele é solto na tela
**Then** o produto nomeia o documento reconhecido, ou diz que não reconheceu — e nunca preenche
formulário de motorista com dado de veículo por causa de uma palavra no rodapé.

### P1 — O que não fecha não se preenche

**Given** um CPF cujo dígito verificador não fecha
**When** a extração termina
**Then** o campo fica vazio com o motivo à vista, em vez de entrar um documento inválido que só
falha no `POST`.

### P2 — Placa repetida é atualização, não cadastro novo

**Given** um CRLV de veículo já cadastrado
**When** o documento é lido
**Then** o produto oferece abrir a ficha existente em vez de deixar o operador preencher tudo para
ser recusado pela unicidade no fim.

### P3 — Print e foto

**Given** um CRLV digitalizado, sem camada de texto
**When** ele é solto
**Then** o produto diz que aquele arquivo é imagem e que a leitura de imagem ainda não existe — sem
travar o cadastro manual.
