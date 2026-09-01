# ADR-0054 — O parser do documento vira biblioteca, e ela devolve o que o documento diz

- Status: aceita
- Data: 2026-09-01
- Contexto: spec 071, sucessora da 070

## O problema

A spec 071 põe a landing lendo **CRLV** no navegador de quem se candidata, e o worker lendo **CNH**
por OCR. Os dois leitores já existem — e os dois moram na app errada para quem passa a precisar
deles:

- `readCrlvVehicle` (`frontend-transportada/src/modules/document-intake/shared/crlvVehicle.service.ts`,
  249 linhas) é do painel do operador. A landing precisa dele.
- `extractCnhFields` e o cliente do `tesseract-server`
  (`api-transportada/src/fleet/{domain/aggregate-document-ocr.policy.ts,infrastructure/http-aggregate-document-ocr.gateway.ts}`)
  são da API. O consumidor de `aggregate-attachment.v1`, no worker, precisa dos dois.

**Nenhuma app importa código-fonte de outra** (`AGENTS.md`). Então ou o código sobe para um pacote
versionado, ou ele é copiado por valor com contrato de paridade, como `FUEL_TYPES` e `VEHICLE_TYPES`.

## A decisão

**Os dois sobem para `@adatechnology/document-intake`**, onde `readCcmei`, `identifyDocumentKind` e
os dígitos verificadores já vivem. Não é cópia por valor.

O critério é o tamanho e a natureza do código. `FUEL_TYPES` é uma lista de cinco produtos que se
confere de olho, e um contrato de paridade que a percorre item a item é barato e completo. Um parser
de documento não é: são tabelas de tradução, um casamento geométrico com dois limites medidos em
pontos e três validações de dígito verificador. **Cópia desse porte diverge calada** — o painel
corrige um bug de leitura, a landing fica com ele, e nada fica vermelho porque as duas cópias
continuam internamente coerentes. É exatamente o modo de falha que o contrato de paridade não pega:
ele compara texto, e o texto foi corrigido de um lado só de propósito.

## O que o pacote devolve: os campos do documento, não a ficha do app

`readVehicleDocument` devolve hoje `Partial<FleetVehicleFormState>` — tipo do painel, com
`MdfeBodyType` (`'02'`), `FuelProduct` (`'etanol-hidratado'`) e `VehicleColor` dentro. Subir isso
levaria o catálogo de uma app para dentro de uma biblioteca que outras três consomem.

**O pacote devolve o que está impresso, canonicalizado.** `readCrlv` entrega `bodyType: 'FURGAO'`,
`fuel: 'ALCOOL/GASOLINA'`, `color: 'BRANCA'` — o texto do Detran, normalizado —, e cada app mapeia
para a ficha dela.

A linha que separa as duas metades é **de quem é o conhecimento**:

| Fica no pacote                                           | Fica no app                                       |
| -------------------------------------------------------- | ------------------------------------------------- |
| O mapa de rótulos do CRLV                                | A tradução para o catálogo do app                 |
| A geometria rótulo → valor                               | `MdfeBodyType`, `FuelProduct`, `VehicleColor`     |
| `*` do Detran é campo vazio, nunca `0`                   | O padrão do diesel (S10) e o aviso de ambiguidade |
| `MARCA / MODELO / VERSÃO` parte no primeiro `/`          | `capacityKilograms`, que o CRLV não imprime       |
| `MUNICÍPIO / UF` parte na última, e a UF é fechada em 27 | Onde cada campo cai no formulário                 |
| Placa, RENAVAM, CPF e CNPJ conferidos pelo dígito        |                                                   |

Isso não é divisão estética: é o que decide quem quebra quando o Detran mudar o layout (o pacote) e
quem quebra quando o nosso catálogo mudar (o app). Hoje os dois quebram juntos.

Consequência aceita: `crlvVehicle.service.ts` **não some do painel** — ele encolhe para o mapeador
de catálogo, com as tabelas de combustível, carroceria e cor que só o painel usa. A landing não
ganha cópia delas porque a ficha da landing não tem esses campos: ela lê placa, marca, modelo, ano,
nome, documento e cidade, e mais nada.

## `remarks` também se divide

`CrlvRemarkReason` tinha cinco motivos. Três são do documento e sobem: `checkDigitFailed`,
`notInformed`, `notPrinted`. Dois são do catálogo e ficam: `notInCatalog` e `ambiguousDiesel` — o
pacote não sabe que existe um catálogo, e não deve saber.

## Alternativas descartadas

- **Cópia por valor com contrato de paridade.** Barata hoje. Cria a terceira cópia de um parser e
  aposta que ninguém corrigirá um lado só — aposta que a §16 do `code-standart.md` já mandou não
  fazer com string repetida duas vezes, quanto mais com 249 linhas.
- **Subir `FleetVehicleFormState` junto.** Resolve a landing em uma tarde e põe o catálogo do painel
  na biblioteca. A próxima app que consumir o pacote herda `MdfeBodyType` sem ter MDF-e.
- **A landing chamar a API para ler.** É a ADR-0053 ao contrário: leitura de cliente anônimo aceita
  como prova deixa um atacante escolher o que o operador vê, e preenchimento pelo servidor faz a
  pessoa esperar um round-trip antes do primeiro campo.

## Consequência aceita

**Esta spec depende de um release do `adatechnology-packages`.** A fase 1 não fecha antes de a
versão nova estar publicada e instalada. Mudança de parser passa a ser mudança em dois repositórios
com um `changeset` no meio — mais lenta de propósito, porque é código que quatro apps leem.
