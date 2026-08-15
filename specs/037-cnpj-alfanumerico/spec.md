# 037 — CNPJ alfanumérico

> Não é preparação: o formato entrou em produção em **01/07/2026** e hoje é 14/08/2026. O que segue
> é correção de um sistema que já pode receber, hoje, um documento que ele destrói em silêncio.

## Problema

A IN RFB 2229/2024 mudou a forma do CNPJ para `[A-Z0-9]{12}[0-9]{2}` — doze posições
alfanuméricas maiúsculas (raiz de 8 + ordem de estabelecimento de 4) e dois dígitos verificadores
que continuam numéricos. O dígito verificador segue módulo 11, com o valor de cada caractere
dado por `charCodeAt(0) - 48` (`'0'`→0 … `'9'`→9, `'A'`→17 … `'Z'`→42) — por construção, um CNPJ
puramente numérico calcula exatamente igual ao de antes. **O CPF não muda.** A chave de acesso de
44 posições passa a ser `[0-9]{6}[A-Z0-9]{12}[0-9]{26}`: os 12 caracteres do CNPJ do emitente
ficam alfanuméricos, e o DV da chave passa a ser calculado sobre valores, não sobre dígitos.

Inscrições que já existem continuam numéricas. Só inscrições novas recebem letra. Isso poderia
soar como um problema distante — não é, por um motivo específico deste produto: **nós recebemos
NF-e de terceiro pela Distribuição DFe**. O emitente é o cliente da transportadora, não nós. A
primeira letra chega sem aviso, num XML que ninguém pediu.

O defeito é um só, em três formas:

1. **Normalização que apaga a letra em silêncio** — `replace(/\D/g, '')`.
2. **Padrão que rejeita** — regex e Zod com `[0-9]{14}` / `\d{44}`.
3. **CHECK do Postgres que rejeita** — `~ '^[0-9]{14}$'`.

A forma (1) é a grave, porque não falha. Executado sobre `SefazChave.ts` do `fiscal-provider`,
com o CNPJ `12ABC34501DE35`:

```
cnpj entrada : 12ABC34501DE35
chave gerada : 35260800000123450135550010000000011521914221  (44 caracteres)
cnpj na chave: 00000123450135        <-- deveria ser 12ABC34501DE35
isChaveDvValid(chave alfanumérica real): false
```

A linha `params.cnpj.replace(/\D/g, '').padStart(14, '0')` remove as letras, o `padStart` recompõe
o comprimento com zeros à esquerda, e o DV é calculado **corretamente sobre o CNPJ errado**. O
resultado é uma chave estruturalmente perfeita apontando para outro contribuinte. Nada quebra: o
XML é aceito localmente, o documento é assinado, e o erro só aparece na rejeição da SEFAZ — ou,
pior, não aparece.

### Inventário (quatro repositórios)

| Alvo                    | O que quebra                                                                                                                                                    | Ordem |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| `fiscal-provider`       | 3 cópias do módulo 11, 3 `replace(/\D/g,'').padStart(14,'0')`, 6 sítios de validação de chave, ~18 pontos de montagem de XML que tiram a letra, `LogObfuscator` | 1ª    |
| `logger`                | `redact.ts` — os três padrões de redação deixam de casar: CNPJ e chave de acesso passam a vazar em texto puro no log estruturado                                | 1ª    |
| `api-transportada`      | ~12 regex Zod, 11 CHECK de CNPJ, 5 CHECK de chave de acesso, 2 máscaras de impressão, 3 comparações `!==`                                                       | 2ª    |
| `frontend-transportada` | máscara e validação de comprimento de CNPJ, 6 cópias de `replace(/\D/g,'')`, `maxLength={14}` fixado em contrato                                                | 3ª    |
| `worker-transportada`   | mapper da distribuição descarta item cujo `chNFe` não case `^[0-9]{44}$`; conferência posicional `accessKey.slice(6,20)`                                        | 2ª    |
| `cron-transportada`     | trilho de NFS-e (cópia por valor do worker)                                                                                                                     | 2ª    |

Duas ausências notáveis, ambas verificadas: **não existe nenhuma função de dígito verificador em
`apps/api-transportada`** — a validação lá é comprimento e conjunto de caracteres, nada mais; e o
**`bwip-js` já codifica letra em Code128** (troca de subconjunto automática), então o código de
barras do DACTE não muda — só o comentário de `dacte-barcode.gateway.ts:21`, que afirma Code128C,
está desatualizado.

## Objetivo

Que um CNPJ alfanumérico atravesse o produto inteiro — recepção de NF-e de terceiro, cadastro da
empresa, emissão de CT-e e MDF-e, faturamento, impressão, log — **sem perder um caractere e sem
ser rejeitado**, mantendo todo CNPJ numérico existente funcionando byte a byte como hoje.

## Decisões

### A primitiva

1. **Uma única primitiva, no `fiscal-provider`, exportada.** Hoje o módulo 11 está triplicado
   (`SefazChave.ts:56`, `CteXmlBuilder.ts:11-21`, `MdfeXmlBuilder.ts:29-39`) e o
   `replace(/\D/g,'').padStart(14,'0')` está em três lugares. Corrigir três cópias é garantir que
   uma delas fique para trás. As três passam a chamar a mesma função.

2. **O valor do caractere é `charCodeAt(0) - 48`.** Não é tabela, não é `switch`: é a regra da
   norma, e é ela que dá a compatibilidade retroativa de graça — `'7'.charCodeAt(0) - 48 === 7`.

3. **Superfície da primitiva:** `charValue`, `normalizeTaxId`, `calcularDvCnpj`, `calcularDvChave`,
   `CNPJ_PATTERN = /^[A-Z0-9]{12}[0-9]{2}$/`, `CHAVE_PATTERN = /^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$/`.
   Precedente de estilo no repositório: `apps/api-transportada/src/shared/rntrc.service.ts`, que já
   centraliza o RNTRC exatamente assim.

4. **`normalizeTaxId` tira só pontuação de máscara (`.`, `/`, `-`, espaço) e sobe para maiúscula.**
   Nunca `\D`. Um caractere fora de `[A-Z0-9]` depois disso é entrada inválida, e é rejeitada — não
   é silenciosamente removida.

5. **A canonicalização em maiúscula não é cosmética.** Toda comparação de CNPJ no backend é
   `!==` byte a byte (`update-company-settings.use-case.ts:118-120`,
   `digital-certificate-rotation.service.ts:34`, `replace-digital-certificate.use-case.ts:128`) e
   os índices UNIQUE do Postgres são sensíveis a caixa. Sem canonicalizar na fronteira,
   `12abc3…` e `12ABC3…` viram duas empresas distintas, com dois certificados e duas séries de
   numeração. É o risco mais caro desta spec.

### O que atravessa

| Campo                                                                                            | Entra? | Por quê                                                                                                        |
| ------------------------------------------------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------- |
| CNPJ de empresa, emitente, tomador, remetente, destinatário, seguradora, proprietário de veículo | ✅     | É o documento que mudou                                                                                        |
| Raiz de CNPJ (8) em perfis de emissão e casamento de perfil                                      | ✅     | `emission-profile-resolution.policy.ts` fatia `slice(0,8)` — a fatia continua válida, o padrão não             |
| Chave de acesso de NF-e, CT-e, MDF-e (44)                                                        | ✅     | 12 posições dela são o CNPJ do emitente                                                                        |
| Redação de log (`logger/redact.ts`)                                                              | ✅     | Sem isso, CNPJ e chave passam a vazar em texto puro — regressão de LGPD                                        |
| Máscara de impressão (DACTE, relatório de fatura)                                                | ✅     | `formatDacteDocumentNumber` e `formatDocument` fatiam por posição sem guarda de conjunto                       |
| Discriminação CPF × CNPJ                                                                         | ❌     | É feita por **comprimento** (`length === 14`) em todo o código; o CNPJ alfanumérico continua com 14 caracteres |
| CHECK e validação de CPF (motorista, condutor de MDF-e, chave PIX CPF)                           | ❌     | CPF não mudou                                                                                                  |
| Código de barras do DACTE (`bwip-js`)                                                            | ❌     | Verificado: já codifica letra em Code128 com troca de subconjunto                                              |
| Inscrição estadual, RNTRC, CEP, número de nota                                                   | ❌     | Fora da norma                                                                                                  |
| Migração de dado existente                                                                       | ❌     | Nenhum CNPJ gravado hoje tem letra; a mudança é só relaxar o que é aceito daqui para frente                    |

### A ordem

6. **`fiscal-provider` e `logger` primeiro, e só depois o resto.** Os dois são publicados por
   GitHub Actions com changesets: a correção vira release, e só então este repositório sobe a
   versão. Relaxar os CHECK da API antes disso só faria o banco aceitar um dado que o pacote ainda
   destrói na saída — trocaria uma rejeição visível por uma corrupção silenciosa.

7. **Depois: `api` (migrations + Zod + máscaras) e `worker`/`cron` juntos**, porque o worker mantém
   **cópia por valor** do schema Drizzle e o cron mantém cópia do trilho de NFS-e. Por último o
   `frontend`, que só pode afrouxar a máscara quando o backend já aceita.

8. **Toda migration é aditiva: o CHECK é relaxado, nunca removido.** `~ '^[0-9]{14}$'` vira
   `~ '^[A-Z0-9]{12}[0-9]{2}$'`; `^[0-9]{44}$` vira `^[0-9]{6}[A-Z0-9]{12}[0-9]{26}$`. Cada uma com
   `rollback.sql` escrito à mão ao lado, e o diretório entrando na lista literal de
   `test/database-migration/static-migration.contract.ts`.

9. **A conferência posicional do worker continua posicional.**
   `nfe-import-consumer.service.ts:320` faz `accessKey.slice(6, 20) === companyCnpj` — a fatia
   segue correta; o que ela passa a exigir é que os dois lados estejam canonicalizados em
   maiúscula, o que a decisão 5 garante.

10. **O item da distribuição não pode ser descartado em silêncio.**
    `nfe-distribution-item.mapper.ts:130` hoje joga fora o item cujo `chNFe` não case
    `^[0-9]{44}$`. Com o padrão novo isso deixa de acontecer — mas o descarte silencioso continua
    sendo o comportamento errado para qualquer outro motivo, e passa a registrar log com a razão.

## Comportamento

- Um CNPJ alfanumérico digitado no cadastro da empresa é aceito, canonicalizado em maiúscula,
  persistido e devolvido no `GET` exatamente como foi gravado.
- Um CNPJ numérico existente continua produzindo, na emissão, **exatamente o mesmo XML de hoje** —
  byte a byte. É o critério que separa correção de regressão.
- Uma NF-e de terceiro com emitente alfanumérico, chegando pela Distribuição DFe, é importada com a
  chave íntegra e o CNPJ íntegro, e aparece na tela de notas como qualquer outra.
- Um documento com caractere fora de `[A-Z0-9]` depois da normalização é rejeitado na fronteira com
  erro de domínio — nunca corrigido por remoção.
- No log estruturado, um CNPJ alfanumérico e uma chave de acesso alfanumérica são redigidos como os
  numéricos já são.

## Fora de escopo

- **Migrar dado existente.** Nenhum CNPJ gravado hoje contém letra.
- **A tela inicial de avisos** — spec 036.
- **Emissão para os modelos que este produto não emite** (NFC-e, BP-e, NF3-e, NFCom). O
  `fiscal-provider` os cobre e a primitiva os alcança de graça, mas não há critério de aceite aqui
  para eles.
- **Trocar o gerador de código de barras.** Verificado que não é necessário.
- **Validação de DV de CNPJ no cadastro.** Hoje não existe e continua não existindo; introduzi-la é
  decisão de produto separada, e introduzi-la junto com esta mudança confundiria a causa de
  qualquer rejeição nova.

## Decisões em aberto

Nenhuma. O único ponto que exigia norma — a ponderação do módulo 11 da **chave de acesso** com
posições alfanuméricas — foi fechado pela T000: o Anexo II da NT 2025.001 confirma que os pesos
seguem 2→9 ciclando da direita para a esquerda sobre as 43 posições, e só o valor do caractere
muda. Evidência, fontes e as cinco correções que a leitura trouxe estão em `evidence.md`.

Três delas alteram decisão desta spec:

- **Aceitar A–Z inteiro.** A exclusão de `I`, `O`, `U`, `Q` e `F` aparece na NT como pedido do
  ENCAT à RFB que "precisa ser confirmada" — não é norma. A expressão regular publicada tem as 26
  letras. Recusar uma letra que o autorizador aceitou seria inventar regra, e nós somos, antes de
  tudo, receptores de documento de terceiro.
- **A máscara a remover é exatamente `[./-]`** (Anexo I da NT). Espaço fica por conveniência de
  formulário, mas o conjunto normativo é esse.
- **`00000000000000` é inválido por definição** — e é exatamente o que o `padStart(14, '0')` de
  `SefazChave.ts:28` fabrica. A primitiva rejeita.

## Critérios de aceite

**Norma**

- [ ] Trecho normativo do cálculo do DV do CNPJ e do DV da chave colado em `evidence.md`, com fonte
      e data, e um par publicado conferindo pela nossa implementação.

**fiscal-provider**

- [ ] `charValue`, `normalizeTaxId`, `calcularDvCnpj`, `calcularDvChave`, `CNPJ_PATTERN` e
      `CHAVE_PATTERN` exportados, com teste cobrindo numérico e alfanumérico.
- [ ] As três cópias do módulo 11 eliminadas; um só ponto de cálculo.
- [ ] `buildChaveAcesso` com CNPJ alfanumérico devolve chave cujas posições 6–17 são o CNPJ de
      entrada, sem `padStart` sobre resíduo.
- [ ] `isChaveDvValid` aceita chave alfanumérica válida e rejeita a de DV trocado.
- [ ] Teste de não-regressão: para um conjunto de CNPJs numéricos, o XML gerado é idêntico ao de
      antes da mudança.
- [ ] `LogObfuscator` não deixa CNPJ alfanumérico passar em `rawResponse`.
- [ ] Release publicado pelo GitHub Actions com changeset — nunca `npm publish` local.

**logger**

- [ ] Os três padrões de `redact.ts` casam CNPJ alfanumérico, CNPJ mascarado e chave de acesso
      alfanumérica, sem passar a casar texto comum.
- [ ] Release publicado pelo mesmo caminho.

**api-transportada**

- [ ] Contrato escrito antes: os ~12 schemas Zod aceitam o padrão novo e rejeitam caractere fora
      dele.
- [ ] Migrations aditivas relaxando os 11 CHECK de CNPJ e os 5 de chave de acesso, cada uma com
      `rollback.sql` e o diretório na lista literal do contrato de migration.
- [ ] `make migration-test` e `db:check` sem drift.
- [ ] `fiscal-company-profile-lookup.gateway.ts` não usa mais `\D` — a busca de perfil por CNPJ
      alfanumérico encontra a empresa.
- [ ] `formatDacteDocumentNumber` e `formatDocument` imprimem CNPJ alfanumérico sem embaralhar
      posição.
- [ ] Contratos de tenant-safety continuam verdes.

**worker e cron**

- [ ] Cópias do schema Drizzle no worker conferidas contra a API após a migration.
- [ ] Item de distribuição com `chNFe` alfanumérico é importado, não descartado; descarte por
      qualquer outro motivo passa a registrar a razão em log.
- [ ] `accessKey.slice(6,20) === companyCnpj` continua verde com os dois lados canonicalizados.
- [ ] Trilho de NFS-e do cron acompanha as cópias por valor do worker.

**frontend-transportada**

- [ ] Máscara e validação aceitam letra; `maxLength` de 14 preservado e o contrato
      `test/fleet/presentation-boundaries.contract.ts` atualizado junto.
- [ ] As 6 cópias de `replace(/\D/g,'')` que tocam CNPJ passam pelo serviço central; as que tocam
      CPF, CEP ou telefone ficam como estão.
- [ ] Campo mostra o valor em maiúscula enquanto se digita, sem mover o cursor.

**Geral**

- [ ] Comentário desatualizado de `dacte-barcode.gateway.ts:21` (Code128C) corrigido.
- [ ] `CLAUDE.md` atualizado com a regra do documento canonicalizado.
- [ ] `make check` verde.
