# 071 — O documento preenche a ficha

## O que se pede

Que o pré-cadastro do agregado comece pelos documentos, e que o que estiver escrito neles preencha
o formulário — para quem se candidata digitar o mínimo.

Hoje isso existe pela metade: o CCMEI é lido no navegador e preenche o bloco Empresa (spec 066), e
desde a 070 o arquivo também é enviado para o operador conferir. Os outros documentos não são
pedidos, e o formulário que eles preencheriam continua todo digitado.

## O que já é verdade, e não muda

**O preenchimento é local e instantâneo; o envio é prova.** A leitura roda no navegador de quem
anexa — sem rede, sem nada gravado — e é ela que preenche. O upload existe para o operador abrir o
documento e conferir contra o que foi digitado (ADR-0053). Os dois propósitos são independentes, e
trocar um pelo outro degrada os dois: preenchimento pelo servidor faria a pessoa esperar um
round-trip antes do primeiro campo, e leitura de cliente anônimo aceita como prova deixaria um
atacante escolher o que o operador vê.

**Documento não identificado não preenche campo nenhum**, mesmo trazendo dado legível. Ler com o
mapa errado produz campo inventado, e campo inventado vira divergência falsa contra a ficha.

**O que o documento diz nunca sobrescreve o que a pessoa digitou.** Ele entra no vazio, e a
divergência é avisada, não corrigida — quem decide é o operador.

## O princípio que atravessa todos os itens

**Todo dado que o documento entregar preenche o campo dele, mesmo em outro bloco do formulário.** A
leitura não é "o CRLV preenche o Veículo" — é "o CRLV preenche tudo que ele diz, onde quer que esse
campo esteja na ficha".

O caso que torna isso concreto: o CRLV traz **nome e CPF do proprietário** e **município/UF**. Eles
não são dados do veículo — são "Nome completo", "CPF ou CNPJ" e a cidade do bloco Endereço. Parar no
bloco Veículo seria jogar fora metade da leitura por causa de onde o campo mora na tela.

O mapa completo do que cada documento entrega, e para onde vai:

| Documento                            | O que se lê                                                                   | Campos que preenche                    |
| ------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------- |
| **CRLV** (camada de texto, ao vivo)  | placa, RENAVAM, marca/modelo, ano-modelo, cor, combustível, carroceria, eixos | bloco Veículo                          |
|                                      | nome e CPF/CNPJ do proprietário                                               | Nome completo · CPF ou CNPJ            |
|                                      | município / UF                                                                | Cidade · UF                            |
| **CCMEI** (camada de texto, ao vivo) | razão social, nome fantasia, situação, abertura                               | bloco Empresa                          |
|                                      | logradouro, número, bairro, cidade, UF, CEP                                   | bloco Endereço                         |
|                                      | CNPJ                                                                          | CPF ou CNPJ                            |
| **CNH** (OCR, no worker)             | número de registro, categoria, nome                                           | ficha do operador — nunca o formulário |
| **Comprovante de endereço**          | —                                                                             | nenhum, por decisão (item 5)           |
| **Contrato social / cartão CNPJ**    | —                                                                             | nenhum, por decisão (item 4)           |

Três guardas que **não** afrouxam por causa deste princípio:

1. **Só campo vazio.** Nada sobrescreve o que a pessoa digitou.
2. **Divergência avisa, não corrige.** Vale especialmente para o proprietário do CRLV: agregado que
   roda com veículo no nome de terceiro é caso normal, e ali o nome lido **diverge de propósito** do
   nome de quem se candidata. O aviso é para o operador, não é erro do candidato.
3. **Documento não identificado não preenche nada**, mesmo trazendo dado legível.

## Os cinco itens

### 1. O CRLV preenche o que ele diz

O parser **já existe e está em produção** no painel do operador: `readVehicleDocument` +
`crlvVehicle.service.ts` leem placa, RENAVAM, marca/modelo, ano-modelo, cor, combustível,
carroceria, eixos, município/UF e o nome e documento do proprietário. É o bloco "Veículo" do
pré-cadastro inteiro — e, pelo princípio acima, também o nome, o documento e a cidade.

⚠️ **Ele mora no `frontend-transportada`, e a landing não pode importá-lo** — nenhuma app importa
código-fonte de outra. Duas saídas, e a escolha é a decisão mais cara desta spec:

- **Subir o parser para `@adatechnology/document-intake`**, o pacote versionado que as duas apps já
  consomem e onde `readCcmei` e `identifyDocumentKind` já vivem. É o que a regra de código
  partilhado manda, e é trabalho no repositório `adatechnology-packages`, **fora deste**.
- **Copiar por valor**, com contrato de paridade, como `FUEL_TYPES` e `VEHICLE_TYPES`. Barato hoje,
  e cria uma terceira cópia de um parser de ~200 linhas com tabelas de tradução de combustível e
  carroceria — o tipo de duplicação que diverge calada.

A recomendação é a primeira. O `FleetVehicleFormState` que o parser devolve é tipo do painel; o
pacote precisa expor uma forma neutra, e cada app mapeia para a ficha dela.

### 2. Os documentos abrem o formulário — decidido

Hoje o campo de arquivo está no meio da página, dentro do bloco Empresa — e o bloco Empresa só
existe depois de um CNPJ completo digitado. Quem chega não descobre que podia ter anexado antes de
já ter preenchido tudo à mão.

**A etapa de documentos passa a ser a primeira**, antes de "Dados pessoais": ter os dados antes de
preencher é o ponto inteiro. Cada tipo com seu campo, todos opcionais, e a ficha abaixo já preenchida
com o que foi lido.

Consequência que isso obriga: **o campo do documento da empresa deixa de depender do CNPJ digitado**.
No topo não há CNPJ ainda, então o campo existe sempre, e o bloco Empresa passa a aparecer pelo CNPJ
**lido do documento ou digitado** — o que vier primeiro.

### 3. A CNH anexa, e o OCR preenche a ficha do operador — decidido

⚠️ **Correção de uma afirmação anterior desta spec:** o extrator de CNH **existe**. `extractCnhFields`
(`fleet/domain/aggregate-document-ocr.policy.ts`) lê número de registro, categoria e nome, ancorado em
**rótulo**, nunca em formato — CPF e RENAVAM também têm onze dígitos, e na CNH-e o CPF vem impresso
antes do registro.

O que não existe é caminho para ele preencher o formulário ao vivo: a CNH-e é imagem embrulhada em PDF
pelo invólucro do Serpro, sem camada de texto útil (medido: ~400 caracteres de texto legal e nenhum
campo). Ler exige OCR, que é servidor, que é assíncrono — e assíncrono não preenche formulário aberto.

**A decisão é ligar o OCR no trilho de leitura do anexo, com o resultado indo para a revisão do
operador — não para o formulário de quem se candidata.** O candidato anexa e segue digitando; quando
o operador abre a candidatura, os campos lidos já estão lá para conferir contra o que foi declarado.
O ganho é do operador, e é honesto: nada é prometido ao candidato e não entregue.

⚠️ **Isto amplia o trilho da spec 070.** Hoje o consumidor lê só camada de texto, só CCMEI. Passa a
precisar de: escolher entre camada de texto e OCR pelo tipo e pela assinatura do arquivo (a mesma
regra que `aggregate-document-text.gateway.ts` já resolve na API), e alcançar o `tesseract-server`.
Os dois vivem no `api-transportada`, e o worker não importa código de outra app — mesma escolha de
pacote versus cópia do item 1, e de preferência resolvida junto com ela.

### 4. Um campo só para o documento da empresa, qualquer tipo — decidido

**A consulta de CNPJ já preenche a empresa inteira, para qualquer porte.** A landing chama
`GET /public/cnpj-info` ao sair do campo, e a Receita devolve razão social, nome fantasia, situação,
data de abertura, natureza jurídica, porte, Simples, CNAE e o endereço. Isso vale para MEI, ME, EPP e
LTDA: **o documento não é o caminho para os dados da empresa; o CNPJ é.** O CCMEI existe para
preencher o que a consulta não prova.

Então o campo é **um só — "documento da empresa" — e aceita o que a pessoa tiver**: CCMEI, contrato
social, cartão CNPJ. O CCMEI segue preenchendo o que a consulta não prova; os outros anexam para
conferência e não preenchem nada. Ninguém fica sem campo por não ser MEI, e nenhum parser novo entra.

**Cartão CNPJ não ganha parser**, mesmo sendo viável (layout federal estável): ele leria o que a
consulta à Receita já devolve — trabalho para chegar ao mesmo dado por um caminho pior. **Contrato
social não é analisável**: cada advogado redige o seu, não há forma para ancorar.

### 5. O comprovante de endereço é anexo, e o endereço continua digitado

⚠️ **Na landing o CEP não é consultado.** `GET /postal-codes/{cep}` exige `addresses.read` e escopo
de empresa, e abri-la a anônimo entregaria a varredura da base de endereços oito dígitos por vez —
exatamente o que a ADR-0040 evitou. O bloco Endereço do pré-cadastro é digitado do começo ao fim, e
esta spec não muda isso.

Isso torna o comprovante o único caminho possível de autopreenchimento do endereço aqui — e
justamente o documento que **não tem layout**. Conta de luz, água, telefone e internet: dezenas de
concessionárias, cada uma com a sua diagramação, e nenhuma norma que as amarre. Um parser genérico
para isso é palpite com aparência de leitura, que é o que a regra do item anterior proíbe.

O comprovante entra como **anexo de conferência**, tipo próprio, sem extração. **Qualquer tipo e
qualquer data** — decidido: nada de o sistema afirmar validade de 90 dias. Conta de luz, água,
telefone, internet, contrato de aluguel, o que a pessoa tiver. O valor dele é o operador ver o
endereço declarado batendo com o documento, que é o motivo pelo qual se pede comprovante.

## Não escopo

- OCR de CNH ou de comprovante — decisão própria, com custo de serviço, ADR e spec.
- Consulta de CEP na landing — barrada pela ADR-0040, e reabri-la é decisão de segurança, não de
  conveniência de formulário.
- Extração no servidor para autopreenchimento — ADR-0053 fechou isso.
- Tornar qualquer documento obrigatório. Todos seguem opcionais: candidatura barrada por anexo é
  candidatura perdida, e quem decide é o operador.

## Decisões tomadas em 2026-09-01

|                               |                                                                   |
| ----------------------------- | ----------------------------------------------------------------- |
| Etapa de documentos           | **primeira**, antes de "Dados pessoais"                           |
| Documento da empresa          | **um campo, qualquer tipo**; só o CCMEI preenche                  |
| Comprovante de endereço       | **qualquer tipo, qualquer data**, anexo puro                      |
| CNH                           | anexa; o **OCR preenche a ficha do operador**, nunca o formulário |
| Cartão CNPJ e contrato social | sem parser, por decisão — ver item 4                              |

## Código partilhado entre apps: **pacote** — decidido em 2026-09-01

O parser do CRLV (item 1) e o par OCR + `extractCnhFields` (item 3) sobem para
`@adatechnology/document-intake`, no repositório `adatechnology-packages`. Não é cópia por valor.

O motivo é o tamanho e a natureza do código: ~200 linhas com tabelas de tradução de combustível e
carroceria e validação de dígito do RENAVAM. Cópia desse porte **diverge calada** — o painel corrige
um bug de leitura e a landing fica com ele, sem nada ficar vermelho.

Duas consequências que a implementação herda:

- **Esta spec depende de um release do `adatechnology-packages`.** A fase 1 não fecha antes de a
  versão nova estar publicada e instalada nas apps que a consomem.
- **O pacote expõe forma neutra, não tipo de app.** `readVehicleDocument` devolve hoje
  `Partial<FleetVehicleFormState>`, que é tipo do painel. O pacote devolve os campos do documento; a
  landing e o painel mapeiam cada um para a ficha deles.

Nenhuma pergunta em aberto. A `tasks.md` está liberada.

## Contratos que a implementação precisa afirmar

- Cada documento preenche **todos** os campos do mapa acima, atravessando bloco, e **só os vazios**.
- O nome do proprietário do CRLV divergindo do nome digitado **avisa**, não corrige nem bloqueia.
- Documento de tipo errado no campo errado (CRLV no campo de CNH) **não preenche nada** — quem manda
  é o documento, não o campo em que foi solto.
- CNH e comprovante anexam, sobem e **não escrevem campo nenhum**.
- Falha de upload não bloqueia o envio da candidatura (herdado da 070).
- Nenhum tipo novo quebra a fila de revisão do operador.
