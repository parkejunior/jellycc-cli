#!/bin/bash

echo "🔄 Convertendo arquivos YAML da fonte para JSON..."
bun run prebuild.ts

# Se o script de pré-build falhar, interrompe a instalação
if [ $? -ne 0 ]; then
  echo "✖ Falha na pré-compilação. Abortando."
  exit 1
fi

echo "🎬 Compilando o JellyCC..."
bun build ./src/index.ts --compile --outfile jellycc

echo "📦 Movendo binário para a pasta do sistema..."
mkdir -p ~/.local/bin
mv jellycc ~/.local/bin/

echo "🧹 Limpando arquivos JSON temporários..."
rm dist/matrix.json dist/rules.json

echo "✔ Instalado com sucesso!"
echo "Comando global 'jellycc' pronto para uso."