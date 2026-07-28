# ADR-0014: Grupo `ICMS45` para CST 40/41/51 no CT-e 4.00

## Contexto

A ADR-0013 registrou como pendência o último defeito conhecido de `@adatechnology/fiscal-provider`:
`buildIcms`, em `CteXmlBuilder.ts`, emitia `<ICMS40>` para as situações tributárias 40 (isenção), 41
(não tributada) e 51 (diferimento), e também no ramo `default` para CST desconhecida.

A pendência ficou aberta porque o caminho exercitado até aqui não passa por ali: a transportadora
usada em homologação é CRT 1, e emitente do Simples Nacional cai antes no grupo `ICMSSN`. Ou seja,
nenhuma rejeição da SEFAZ apontou o problema — ele só apareceria no primeiro cliente de regime
normal com frete isento, não tributado ou diferido, que são casos comuns (transporte para órgão
público isento, prestação não tributada, ICMS diferido).

Isso não é hipotético: `CTE_ICMS_CSTS` em `src/database/cte-emission-profile.schema.ts` já aceita
`['00','20','40','41','51','60','90']`, com check constraint no banco. Um perfil de emissão com CST
40, 41 ou 51 é configurável hoje pela API; a única coisa que impede o defeito de aparecer é o CRT 1
da transportadora em uso, que desvia antes para `ICMSSN`.

Como não havia rejeição real para usar como prova, a task exigia verificação contra o schema antes de
mexer. `ICMS40` existe no schema da **NF-e** — daí a confusão — mas o CT-e tem um leiaute próprio.

## Decisão

Verificar contra o XSD oficial do CT-e 4.00 (`PL_CTe_400`) e corrigir o pacote.

`cteTiposBasico_v4.00.xsd`, `complexType TImp`, define a escolha do grupo de ICMS como exatamente:

```
ICMS00 | ICMS20 | ICMS45 | ICMS60 | ICMS90 | ICMSOutraUF | ICMSSN
```

A string `ICMS40` **não aparece nenhuma vez** no schema do CT-e. O grupo `ICMS45` documenta "ICMS
Isento, não Tributado ou diferido" e enumera `CST` em `40 | 41 | 51` — as três CST compartilham um
único grupo, e o nome do grupo não acompanha a CST.

Correção em `CteXmlBuilder.ts`: `<ICMS40>` → `<ICMS45>` nos dois pontos (o `case '40' | '41' | '51'`
e o `default`, que continua devolvendo CST 41). O `<ICMS40>` de `SefazXmlBuilder.ts` é da NF-e, onde
o grupo existe de verdade e carrega `orig`, e não foi tocado.

Prova: CT-e assinado, gerado pelo próprio `buildCteXml`, validado com `xmllint` contra
`cte_v4.00.xsd` e todos os XSD importados.

```
antes (CST 41):  Element 'ICMS40': This element is not expected. Expected is one of
                 ( ICMS00, ICMS20, ICMS45, ICMS60, ICMS90, ICMSOutraUF, ICMSSN ).
                 cte-41-antes.xml fails to validate

depois:          cte-40.xml validates
                 cte-41.xml validates
                 cte-51.xml validates
```

Testes de contrato escritos antes da implementação, em `test/contract/cte-sefaz-wire.contract.test.ts`:
um `test.each` sobre `['40','41','51']` afirmando `<ICMS><ICMS45><CST>xx</CST></ICMS45></ICMS>` e
ausência total da string `ICMS40`, mais um caso para o `default`.

## Consequências

- cliente de regime normal com frete isento, não tributado ou diferido passa a gerar CT-e válido
  contra o schema; antes tomaria rejeição de schema (cStat 215) na primeira emissão;
- a validação por XSD entra como técnica disponível para os grupos ainda não exercitados do CT-e —
  não é preciso esperar uma rejeição da SEFAZ para provar um erro de leiaute;
- `@adatechnology/fiscal-provider@0.3.0-rc.2` está publicado no npm sob o `dist-tag` `rc`, com a
  correção, e `api-transportada` e `worker-transportada` passaram a depender dessa versão. O release
  saiu pela pipeline `Publish packages` do repositório de pacotes, que roda `changeset version` e
  publica com o `NPM_TOKEN` do CI — o `package.json` versionado nunca é bumpado à mão;
- o repositório de pacotes segue em pre mode do `changesets`, então a publicação continua no
  `dist-tag` `rc`, como decidido na ADR-0013.

## Alternativas consideradas

1. **Deixar como pendência até a primeira rejeição real da SEFAZ.** Rejeitada: o custo de descobrir
   é uma emissão fiscal falhada em cliente, e a verificação por XSD é barata e conclusiva.
2. **Contornar em `api-transportada`, forçando CST que não passe pelo ramo defeituoso.** Rejeitada:
   esconde o defeito, distorce a apuração fiscal e o pacote continuaria errado para os outros
   consumidores.
3. **Aceitar a documentação de terceiros como prova.** Rejeitada: as fontes concordavam, mas o
   critério do projeto é verificar na fonte primária — o XSD publicado — e foi o que foi feito.
