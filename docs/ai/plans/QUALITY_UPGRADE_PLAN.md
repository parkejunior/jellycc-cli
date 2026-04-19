# 🗺️ Plano de Atualização: Motor de Qualidade Dinâmica (Visually Lossless)

Este plano detalha a transição do CLI para abandonar o uso de parâmetros fixos (hardcoded) de encoder e adotar cálculos dinâmicos de taxa de bits e compressão, visando máxima qualidade visual e imersão de áudio.

## 🎯 Objetivos da Atualização

1. Preservar a regra de passthrough (`-c:v copy`) para arquivos já compatíveis.
2. Alterar o transcoding de vídeo para buscar qualidade "Visually Lossless" (CRF 18 / Preset Slow).
3. Calcular o bitrate do áudio proporcionalmente ao número de canais detectados pelo FFprobe, acabando com a compressão agressiva em faixas Surround (5.1/7.1).

## 🛠️ Fase 1: Helpers Dinâmicos

Criar as lógicas matemáticas no arquivo de utilitários de FFmpeg para que ambos os comandos (`check.ts` e `merge.ts`) possam consumir.

- [ ] **Criar a função `getDynamicVideoEncoder()` em `src/utils/ffmpeg.ts`:**
  - Em vez de ler `fallbackRules.video.encoder`, a função deve retornar: `-c:v libx264 -preset slow -crf 18 -pix_fmt yuv420p`.
  - _Nota:_ O preset `slow` garante que o arquivo não fique inchado, equilibrando o alto volume de dados gerado pelo CRF 18.

- [ ] **Criar a função `getDynamicAudioEncoder(stream, targetCodec)` em `src/utils/ffmpeg.ts`:**
  - A função deve ler `stream.channels` (com fallback para 2 caso undefined).
  - Se `targetCodec === 'flac'`, retornar apenas `-c:a flac` (bitrate é ignorado em lossless).
  - Se `targetCodec === 'eac3'`, calcular: `bitrate = Math.min(channels * 112, 768)`. Retornar `-c:a eac3 -b:a ${bitrate}k`.
  - Se `targetCodec === 'aac'`, calcular: `bitrate = channels * 112`. Retornar `-c:a aac -b:a ${bitrate}k`.

## 🧬 Fase 2: Refatoração do Comando `merge.ts`

Substituir o mapeamento de áudio genérico pela nova função dinâmica.

- [ ] **Atualizar o Loop de Áudio:** No bloco "5. Mapeamento Cirúrgico e Injeção de Regras", o script atual assume que todas as faixas de áudio recebem o mesmo encoder se uma delas precisar de conversão.
- [ ] **Implementar mapeamento por faixa:** Percorrer a matriz `selectedStreams`. Para cada áudio que precisar de transcode, aplicar a `getDynamicAudioEncoder` especificamente no seu index. (Ex: `-c:a:0 eac3 -b:a:0 640k -c:a:1 aac -b:a:1 224k`).
- [ ] **Manter Passthrough de Vídeo:** Garantir que se a escolha de vídeo for detectada como compatível (`h264_8bit`), a variável `vCodecArg` permaneça estritamente como `-c:v copy`.

## 🧬 Fase 3: Refatoração do Comando `check.ts`

Aplicar a mesma inteligência para conversões de arquivo único.

- [ ] Substituir `fallbackRules.video.encoder` por `getDynamicVideoEncoder()`.
- [ ] Substituir o encoder estático de áudio utilizando a `getDynamicAudioEncoder()` e o objeto `audioStream` extraído do FFprobe.

## 🧹 Fase 4: Limpeza do YAML

- [ ] Atualizar o `fallback_rules.yaml` para remover a chave `encoder` debaixo das propriedades de áudio e vídeo, deixando-o apenas como um dicionário de "Alvos" (targets e acceptables), já que a matemática do encoder agora vive no TypeScript.
