# Evidências — Feature 015

## Diagnóstico que originou a feature (2026-07-29)

Medido com `make dev` no ar, por sonda Playwright autenticada contra a API real. Nenhuma linha de
código de produção foi alterada nesta etapa.

### Estado do servidor antes da medição

```
view_key                 | nfe-workspace.documents
columnVisibility         | {"series": false, "recipientLocation": false, demais true}
updated_at               | 2026-07-29 15:04:28+00
```

### Sessão nova, nenhum clique do usuário

```
878ms   request  GET /view-headers…/view-preferences
        response 200 — devolve o layout salvo (Série e Destino ocultos)
        tabela renderiza: Número | Série | Emissão | Emitente | Origem | Destinatário |
                          Destino | Valor | Status
1682ms  request  PUT /view-preferences
```

O layout do servidor **não** foi aplicado, e uma gravação partiu sem nenhuma ação do usuário.
Estado do banco logo depois:

```
updated_at       | 2026-07-29 15:05:41+00
columnVisibility | {"series": true, "recipientLocation": true, demais true}
```

O padrão sobrescreveu a preferência salva.

### Edição perdida quando a tela reinicia

Mesma sonda, agora ocultando "Destino" e recarregando em seguida:

```
 922ms  GET  /view-preferences   (mount)
1725ms  PUT  /view-preferences   ← gravação espúria do mount, 800ms depois do GET
3421ms  usuário oculta a coluna "Destino"
3588ms  GET  /view-preferences   (mount após o reload)
4391ms  PUT  /view-preferences   ← de novo a gravação de mount
```

Entre `3421ms` e `3588ms` não houve PUT: a edição não alcançou o servidor. O debounce é de 800ms
(`useTableViewPreferences.hook.ts:15`) e não há flush em unmount nem em `pagehide`.

### Mecanismo

`useNfeDocumentTable.hook.ts:696-723`

```ts
if (isSeedEffectRef.current) { isSeedEffectRef.current = false; return }
...
hasEditedRef.current = true
onChange(currentView)
```

`StrictMode` (`main.tsx:393`) invoca o efeito de mount duas vezes. A primeira consome
`isSeedEffectRef`; a segunda persiste o estado semente e marca `hasEditedRef`. O efeito de
hidratação logo abaixo desiste justamente quando `hasEditedRef` é verdadeiro — por isso o valor
remoto nunca é aplicado.

Mesmo sem `StrictMode`, o desenho faz o remoto vencer o cache local sem comparar recência: uma
gravação perdida também apaga a versão local na volta.

Arquivos de sonda removidos ao final (`test/columns-probe.spec.ts`, `playwright.probe.config.ts`,
`test-results/`). A sonda deixou a linha `view_preferences` local no padrão — ela já estava no
padrão antes da medição.
