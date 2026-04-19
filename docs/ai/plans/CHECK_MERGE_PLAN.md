# 🗺️ Plano de Refatoração e Expansão: JellyCC CLI

Este documento define as etapas para refatorar a ferramenta de um script único para uma arquitetura modular de múltiplos comandos, e detalha a implementação do novo recurso de **Remuxing Customizado** (`merge`).

## 🏗️ 1. Nova Estrutura de Diretórios

A primeira etapa é reorganizar o repositório para suportar múltiplos comandos. A raiz deve ficar limpa, movendo a lógica para uma pasta `src/`.

```text
jellycc-cli/
├── src/
│   ├── commands/
│   │   ├── check.ts     # Lógica atual de análise de 1 arquivo
│   │   └── merge.ts     # Nova lógica de junção de 2 arquivos
│   ├── utils/
│   │   ├── ffprobe.ts   # Funções para extrair metadados (Quick Scan e extração JSON)
│   │   ├── ffmpeg.ts    # Funções de execução (Deep Scan e Conversão)
│   │   └── ui.ts        # Helpers do Clack (sanitizePath, onCancel, formatações)
│   └── index.ts         # Entrypoint: Roteador principal da CLI
├── prebuild.ts          # Script que converte YAML para JSON
├── install.sh           # Script de compilação e instalação global do Bun
├── fallback_rules.yaml  # Fonte da verdade das regras
└── jellyfin-codec-support.yaml # Matriz de suporte
```

## 🛠️ 2. Fase 1: Modularização e "DRY" (Don't Repeat Yourself)

Antes de criar o `merge`, precisamos garantir que o código atual seja componentizado. Ambos os comandos (`check` e `merge`) usarão o `ffprobe` e as regras de fallback.

- [ ] **Criar Roteador (`src/index.ts`):** Implementar um _parser_ simples de argumentos (`process.argv`) que identifique se o usuário chamou `check` ou `merge` e delegue para o arquivo correspondente na pasta `commands/`.
- [ ] **Extrair Helpers:** Mover funções como `sanitizePath`, formatação de strings do terminal (Picocolors) e o validador de saída manual (`onCancel`) para `src/utils/ui.ts`.
- [ ] **Isolar o FFMPEG/FFPROBE:** Criar funções genéricas em `src/utils/ffprobe.ts` (ex: `getMediaInfo(path)`) que retornam o objeto JSON limpo para qualquer comando que solicitar.
- [ ] **Migrar o `check.ts`:** Copiar o núcleo do código antigo para dentro deste novo comando, importando as funções utilitárias da pasta `src/utils/`. Testar para garantir que o comportamento original se mantém intacto.

## 🧬 3. Fase 2: Desenvolvimento do Comando \`merge\`

Com a casa arrumada, iniciamos o desenvolvimento do remuxing inteligente de mídia.

- [ ] **Coleta de Caminhos:** Atualizar a UI para solicitar o _Caminho do Arquivo A (Base/Referência)_ e o _Caminho do Arquivo B (Alvo da mesclagem)_.
- [ ] **Análise Dupla:** Disparar o helper do `ffprobe` simultaneamente para ambos os arquivos e extrair todos os streams (Vídeo, Áudio, Legendas).
- [ ] **O "Juiz" de Qualidade Visual:** Criar a lógica que compara as faixas de vídeo do Arquivo A e B (analisando resolução, codec e bitrate) para sugerir qual deve ser a imagem base.
- [ ] **Interface Multiselect (Clack):** Construir o menu interativo listando todas as faixas disponíveis com checkboxes. Deve indicar a origem de cada faixa (Ex: \`[ ] Áudio PT-BR (Arquivo A)\`, \`[x] Áudio EN (Arquivo B)\`).
- [ ] **Mapeamento Cirúrgico:** Traduzir a seleção do usuário para a sintaxe avançada do FFmpeg (\`-map 0:v:0\`, \`-map 1:a:1\`, etc.).
- [ ] **Injeção de Regras (Fallback):** Passar cada faixa selecionada pelo `fallback_rules.yaml`. Se a seleção final contiver um vídeo HEVC e um áudio DTS, aplicar as flags de transcode corretas para H.264 8-bit e EAC3 em seus respectivos mapeamentos.
- [ ] **Execução:** Renderizar o comando final para o usuário validar e rodar o `spawn`/`execSync`.

## 📦 4. Fase 3: Ajustes no Build

- [ ] Modificar o `install.sh` e o `prebuild.ts` para refletirem o novo ponto de entrada (`src/index.ts`) durante a compilação do binário do Bun.
