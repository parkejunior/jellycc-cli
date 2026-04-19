# Melhoria na Seleção de Faixas do Merge

Este plano detalha as alterações necessárias no comando `merge` para atender à solicitação de agrupamento de faixas por tipo (vídeo, áudio, legendas) e exibição detalhada das informações de codec.

## Modificações Propostas

### 1. `src/commands/merge.ts`

- **Importações:** Importar `groupMultiselect` do pacote `@clack/prompts` (se disponível) ou preparar o fluxo para três `multiselect` sequenciais (um para Vídeo, um para Áudio e um para Legendas).
- **Formatação Detalhada das Faixas:** Atualizar a função `buildOptions` ou criar um helper específico para construir rótulos (labels) ricos em detalhes:
  - **Vídeo:** Exibir `Resolução`, `Framerate` (convertendo frações como `24000/1001` para decimais ex: `23.98 fps`), e `Bitrate` (convertido para kbps).
    - *Exemplo:* `[VIDEO] h264 | 1920x1080 | 23.98 fps | 5000 kbps - Arquivo A`
  - **Áudio:** Exibir `Canais` (ex: 2 para Stereo, 6 para 5.1), `Sample Rate` (em kHz) e `Bitrate`.
    - *Exemplo:* `[AUDIO] aac (PT-BR) | 5.1 Canais | 48 kHz | 384 kbps - Arquivo B`
  - **Legendas:** Exibir `Codec`, `Idioma` e `Título` (se existir).
    - *Exemplo:* `[SUB] subrip (ENG) | "English (Forced)" - Arquivo A`
- **Agrupamento Lógico:** Separar as opções do `allOptions` em categorias:
  - `Vídeo`
  - `Áudio`
  - `Legenda`
- **Seleção do Usuário:** Substituir o `multiselect` geral por `groupMultiselect` (ou por chamadas separadas) mantendo a pré-seleção inteligente da melhor faixa de vídeo.

## Plano de Verificação

- Executar `bun run start merge` com arquivos de teste contendo múltiplas faixas de áudio, vídeo e legendas.
- Validar visualmente se as faixas estão agrupadas.
- Verificar se as tags de bitrate, canais e framerate não aparecem como `undefined` ou `NaN` quando ausentes no `ffprobe`.
- Verificar se o comando final do `ffmpeg` mapeia perfeitamente as faixas selecionadas nos diferentes grupos.
