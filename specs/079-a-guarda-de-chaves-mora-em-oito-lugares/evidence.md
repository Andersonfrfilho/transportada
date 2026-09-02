# Evidência — 079

## O inventário, medido antes de escrever a spec

⚠️ **A spec 078 dizia "doze cópias", e estava errado.** São **oito declarações** e doze arquivos que
a **usam** — a contagem de doze veio de `grep -l`, que conta quem importa junto com quem declara.

E a diferença que importava não era o número, e sim que havia **duas assinaturas incompatíveis**:

```
({ keys, value }) => boolean                          5×  company-settings/shared/
(value, keys)     => value is Record<string, unknown> 3×  nfse-invoice, mdfe-manifest, trip
```

Foi exatamente isso que fez a spec 078 falhar em partes quando tentou trocá-las: o padrão de busca
casava com uma forma e não com a outra, e quatro arquivos ficaram para trás.

## T001–T002 — O lugar, e a trava

`test/shared/object-keys-single-source.contract.ts` escrito primeiro, reprovando as oito por nome.
`modules/shared/objectKeys.service.ts` com `hasExactKeys` em _type predicate_ (D1) e `hasKeys`
junto (RF2).

## T003 — As três posicionais

`trip`, `mdfe-manifest` e `nfse-invoice` passaram a **reexportar** a compartilhada: outros arquivos
do mesmo módulo já importavam de lá, e trocar o import de cada um seria mexer em código que a spec
não precisa tocar.

## T004 — As cinco de `company-settings`

A troca aqui muda a **forma da chamada** (`{ keys, value }` → `(value, keys)`), e é onde a 078
falhou. Foram **quinze chamadas** em três formatações diferentes — uma linha com constante, uma
linha com `value` qualificado (`value.page`), e multilinha. As três precisaram de padrão próprio; o
typecheck apontou cada sobra.

O `isRecord` que precedia cada chamada **ficou**: com o predicate ele é redundante, mas removê-lo
seria reescrever validação, e a D3 diz que esta spec não toca semântica.

## T005 — Fecho

```
bun run test (frontend)   2291 pass · 0 fail
playwright (smoke)        45 passed
make check                EXIT=0
```

**CA3 conferido por `git diff --stat` sobre `test/`:** um arquivo tocado, uma linha — o `import` do
contrato novo. **Nenhum teste existente alterado para a extração passar**, que é o que separa
extração de mudança de comportamento.
