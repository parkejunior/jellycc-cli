# Exibição Comparativa Lado a Lado (Arquivos A e B)

Este plano detalha a implementação de um novo elemento visual no comando `merge` que exibirá um resumo comparativo lado a lado dos Arquivos A e B antes de solicitar a seleção de faixas. Isso permitirá que o usuário tome decisões mais informadas durante a mesclagem.

## User Review Required

> [!IMPORTANT]
> Aprovar se os detalhes incluídos no quadro comparativo (Duração, Tamanho, Codecs de Vídeo, Quantidade de faixas de Áudio e Legenda) são os ideais ou se existe algum outro metadado que deva ser destacado.

## Open Questions

> [!WARNING]
> Como você prefere a apresentação dessa tabela? Uma string simples no terminal ou dentro de um balão de `note` do Clack Prompts?

## Proposed Changes

### Comando Merge

#### [MODIFY] [merge.ts](file:///home/patrick/Dev/jellycc-cli/src/commands/merge.ts)
- **Extração de Metadados:** Modificar a etapa de Análise Dupla (`getMediaInfo`) para extrair e formatar informações essenciais de `infoA` e `infoB`:
  - `duration` (convertendo segundos para HH:MM:SS) e `size` (convertendo bytes para MB/GB) usando `info.format`.
  - Resumo de Vídeo: Principal codec e resolução.
  - Resumo de Áudio: Quantidade de faixas e os respectivos codecs (ex: `2 faixas (ac3, aac)`).
  - Resumo de Legendas: Quantidade de faixas.
- **Renderização Lado a Lado:** Criar uma string formatada usando `picocolors` para desenhar duas colunas, antes da chamada do `groupMultiselect`.

*Esboço do Layout de Saída (Lado a Lado):*
```text
| Info        | Arquivo A (Base)            | Arquivo B (Alvo)            |
| ----------- | --------------------------- | --------------------------- |
| Duração     | 02:15:30                    | 02:15:35                    |
| Tamanho     | 4.50 GB                     | 2.10 GB                     |
| Vídeo       | h264 (1920x1080)            | hevc (1920x800)             |
| Áudios      | 2 faixas (ac3, aac)         | 1 faixa (aac)               |
| Legendas    | 3 faixas                    | Nenhuma                     |
```

## Verification Plan

### Testes Manuais
- Executar `bun run ./src/index.ts merge` informando dois arquivos válidos de teste.
- Verificar se a tabela é exibida com os dados alinhados de forma consistente.
- Conferir a conversão correta de bytes para MB/GB e segundos para horas/minutos.
- Assegurar que arquivos sem áudio ou sem legenda não quebrem o layout (tratamento de null/undefined).
