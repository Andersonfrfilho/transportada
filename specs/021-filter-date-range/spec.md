# Feature 021 — Range de data nos filtros

## Problema e resultado

O workspace de notas já tem um seletor de período próprio: `DateRangePicker`, um calendário que abre
sobre o gatilho, marca o intervalo clicando em dois dias, mostra `01/07/2026 – 30/07/2026` no gatilho
e tem botão de limpar. É o que o operador aprendeu a usar na tabela de Notas.

Os outros filtros do produto não usam esse componente. Eles caíram no `<input type="date">` nativo, em
pares soltos (`Criado de` + `Criado até`, `Emitido de` + `Emitido até`). Isso custa três coisas:

1. **Aparência.** O `input type="date"` do Chrome tem altura, tipografia e ícone próprios — ele não
   respeita `--field-height`, `--field-padding` nem `--field-font-size`, então destoa de todo campo ao
   lado dele.
2. **Uso.** Dois campos independentes não sabem que formam um intervalo: dá para digitar um fim antes
   do começo, e não há um único lugar para limpar o período.
3. **Duplicação.** O `DateRangePicker` mora dentro de `src/modules/nfe-workspace/components/` e tira
   estilo de `nfeWorkspace.module.css`. Qualquer outro módulo que quisesse usá-lo teria que importar
   componente e CSS de um módulo vizinho — que é exatamente o acoplamento que a regra "nenhuma app
   importa código-fonte de outra" existe para evitar, aqui na escala de módulo.

**Resultado esperado:** o seletor de período vira primitivo do design system
(`src/components/ui/date-range-picker.tsx`) e todo filtro que hoje tem um par `de` / `até` de data
passa a usá-lo. Nada muda no formato do valor: continua ISO `YYYY-MM-DD`, continuam dois campos no
estado do filtro (`createdFrom`/`createdTo`, `issuedFrom`/`issuedTo`) e continua a mesma query.

## Fora de escopo

- Campos de data **de formulário**, que não são filtro e não são intervalo: `dueDate` do faturamento
  (`BillingWorkspace.page.tsx`) e as datas de vigência dos perfis de CT-e
  (`CteProfileComponentRows`, `CteProfileChargeFields`). São data única, não período.
- A condição de data com operador diferente de `between` no construtor avançado do nfe-workspace —
  ali o valor é uma data só, e o `DateRangePicker` já cobre o caso `between`.
- Qualquer mudança de comportamento do calendário: navegação de mês, clique em dois dias, troca
  automática quando o fim vem antes do começo e botão de limpar continuam exatamente como estão.
- Mudar o formato do valor, o contrato de query da API ou o estado dos hooks de tabela.

## Decisões tomadas

| Questão                                         | Decisão                                                                                | Consequência                                                                                                                                          |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onde vive o seletor de período                  | `src/components/ui/date-range-picker.tsx` + `date-range-picker.module.css`             | Mesma regra que levou `Tabs` para o design system na 021 anterior: UI paralela ao design system exige ADR. Módulo nenhum importa componente de outro. |
| API do componente                               | Preservada — `from`, `to`, `onChange(from, to)` e os rótulos por prop                  | Os dois usos atuais no nfe-workspace continuam compilando sem mudança de chamada; só o caminho do `import` muda.                                      |
| Rótulos de cromo (limpar, mês anterior/próximo) | Continuam vindo por prop, do locale de cada módulo                                     | Nenhum componente de `src/components/ui/` fala com o i18n hoje. Manter assim evita acoplar o design system ao `i18n.service.ts`.                      |
| Estilo do calendário                            | Copiado para `date-range-picker.module.css`; as regras que só ele usava saem do módulo | `.iconAction` e `.actionIcon` permanecem em `nfeWorkspace.module.css` — outros componentes do módulo ainda usam.                                      |
| Como o par vira um campo só                     | Um `DateRangePicker` chamando `setTextFilter` duas vezes no `onChange`                 | O estado do filtro não muda de formato; a query e os testes de tabela existentes continuam válidos.                                                   |
| Quais filtros entram                            | Todo par `de`/`até` de data em painel de filtro: cte-batch (lotes e CT-es) e mdfe      | É o que a proibição do contrato consegue provar. Data única de formulário fica fora, e o contrato só olha `*Filters.component.tsx`.                   |

## Critérios de aceite

- Existe exatamente um seletor de período no código, em `src/components/ui/date-range-picker.tsx`.
  Nenhum arquivo em `src/modules/**` declara um calendário de intervalo próprio.
- Nenhum `*Filters.component.tsx` em `src/modules/**` contém `type="date"`.
- `CteBatchFilters` renderiza um `DateRangePicker` ligado a `createdFrom`/`createdTo`; o `onChange`
  grava os dois campos.
- `CteItemFilters` renderiza um `DateRangePicker` ligado a `issuedFrom`/`issuedTo`.
- `MdfeManifestFilters` renderiza um `DateRangePicker` ligado a `createdFrom`/`createdTo`.
- Os locales `cteBatch` e `mdfeManifest`, em pt e en, expõem o grupo `dateRange` com
  `placeholder`, `clear`, `previousMonth` e `nextMonth`.
- `date-range-picker.module.css` usa só tokens de `:root` — nenhum hexadecimal.
- Os dois usos do nfe-workspace passam a importar de `@/components/ui/date-range-picker` e continuam
  funcionando na tela real.
