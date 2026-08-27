---
name: contrato-de-paridade
description: Quando algo existe num lugar e precisa estar declarado noutro, escrever o contrato que cobra os dois — sem ele a divergência é sempre silenciosa
triggers:
  - ao criar app, arquivo de teste, migration ou aba nova
  - ao acrescentar permissão, papel ou origem externa
  - ao copiar catálogo por valor entre apps
  - quando um defeito foi "esqueceram de declarar em X"
  - antes de confiar numa lista escrita à mão
---

# Contrato de paridade

Este repositório é feito de listas que precisam concordar com a realidade: apps declaradas no filtro
do pipeline, testes declarados no `package.json`, permissões espelhadas no frontend, catálogos
copiados por valor entre apps que não se importam.

**Toda divergência dessas é silenciosa.** Nada quebra até alguém precisar do que ficou de fora — e aí
o sintoma aparece longe da causa: a app que nunca publica, o teste que nunca roda, o papel novo que
entra com token válido numa tela quebrada.

O antídoto é sempre o mesmo: **um contrato que compare as duas pontas e falhe nomeando o que falta.**

## A regra que ninguém lembra: os dois sentidos

Contrato de paridade escrito pela metade cobra só "o que existe está declarado". O sentido inverso —
**"o que está declarado existe"** — é o que envelhece calado:

- caminho de teste declarado e apagado do disco é **ignorado sem aviso** pelo `bun test`;
- alvo declarado no filtro para app que não existe mais nunca falha;
- permissão na allowlist que a API não emite mais só é notada quando alguém a procura.

Escreva os dois. E, quando a lista for escrita à mão, cobre **duplicidade** também: entrada repetida
esconde remoção, porque tirar uma cópia deixa a outra dando falsa segurança.

## Esqueleto

```ts
describe('registro de <coisa>', () => {
  test('todo <item> no disco está declarado', async () => {
    const declared = new Set(declaredItems(await readConfig()))
    const undeclared = itemsOnDisk().filter((item) => !declared.has(item))

    // Lista, nunca booleano: a mensagem de falha tem de dizer QUAL falta.
    expect(undeclared).toEqual([])
  })

  test('todo <item> declarado existe', async () => {
    const missing = declaredItems(await readConfig()).filter((item) => !existsOnDisk(item))

    expect(missing).toEqual([])
  })
})
```

`expect(lista).toEqual([])` em vez de `expect(lista.length).toBe(0)`: o primeiro imprime o que
sobrou, o segundo imprime `1 !== 0` e manda você procurar.

## Armadilhas

- **Asserção de texto varre comentário.** `not.toContain('blob:')` reprova por causa da prosa que
  explica que `blob:` seria errado. Tire comentários antes de comparar.
- **Comentário mente, condição não.** Ao cobrar comportamento de workflow, parseie o `if:`; o
  comentário acima dele descreve a intenção, que pode divergir do que foi escrito.
- **`toEqual` em array é ordenado.** Espelho de lista (permissões, papéis) exige a **mesma ordem**;
  decida de propósito entre ordenar os dois lados ou exigir a ordem da origem.
- **O contrato precisa se declarar.** Contrato novo fora da lista de testes não roda — é o defeito
  que ele existe para pegar, aplicado a ele mesmo.
- **Falha local por arquivo não commitado não reproduz no CI.** Pasta `??` no `git status` não existe
  no checkout do runner. Não confunda com defeito real.
- **Cópia por valor precisa de contrato dos dois lados.** Nenhuma app importa código de outra, então
  um contrato só guarda uma metade. Ver `FUEL_TYPES` e `VEHICLE_TYPES` no `CLAUDE.md`.

## Onde já existe precedente nesta base

| Paridade | Contrato |
|---|---|
| arquivo de teste × `scripts.test` | `test/test-registry/declaration.contract.ts` |
| app em `apps/` × filtro do pipeline | `test/deploy/pipeline-change-filter.contract.ts` |
| app × `COPY` dos Dockerfiles | `test/deploy/dockerfile-workspace.contract.ts` |
| grafo de jobs do deploy | `test/deploy/pipeline-triggers.contract.ts` |
| permissões e papéis da API × painel | `frontend-transportada/test/frontend-contract.test.ts` |
| migration × lista estática | `test/database-migration/static-migration.contract.ts` |
| catálogo copiado entre apps | `test/fuel-catalog/catalog.contract.ts` e os pares dele |
| origem externa × `connect-src` da CSP | `test/shared/content-security-policy.contract.ts` |

Antes de escrever um novo, procure o análogo aqui: o formato de leitura da configuração
(`Bun.file`, `readdir`, regex sobre o YAML) provavelmente já está resolvido.

## Critério de sucesso

- A falha **nomeia** o item que falta, não só acusa que falta.
- Os dois sentidos estão cobertos, mais duplicidade quando a lista é manual.
- O contrato está declarado na lista de testes da app.
- Ele falha **antes** do conserto e passa depois — verificado nessa ordem, não presumido.
