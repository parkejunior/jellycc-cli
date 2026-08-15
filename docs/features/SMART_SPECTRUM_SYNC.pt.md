# 🎶 Smart Spectrum Sync

O Smart Spectrum Sync é um recurso que sincroniza automaticamente faixas de áudio de arquivos diferentes, alinhando trilhas de áudio quando você junta mídias com pontos de início diferentes.

## ✏️ Exemplo Prático

Imagine que você quer unir faixas dos seguintes arquivos:

* **Arquivo A (Vídeo Principal):** Release 4K WEB-DL com excelente imagem e áudio original em inglês.
* **Arquivo B (Fonte da Dublagem):** Release DVD-Rip de menor qualidade, porém contendo a dublagem em português.

### O Problema

O Arquivo B tem 3,5 segundos a mais de introdução/silêncio no início em comparação ao Arquivo A. Se a faixa dublada do Arquivo B for extraída e combinada diretamente com o vídeo A, o áudio ficará totalmente dessincronizado.

### A Solução com Spectrum Sync

1. Você indica um ponto de referência próximo ao início de um efeito sonoro marcante (ex: `00:01:15` onde uma porta bate).
2. O Smart Spectrum Sync extrai e compara a assinatura sonora das duas mídias nesse intervalo.
3. O algoritmo calcula que a faixa dublada precisa de uma compensação de **+3500 ms** (3,5 segundos).
4. O JellyCC aplica a compensação de tempo na junção final. O resultado é uma faixa dublada que começa exatamente onde o vídeo começa, sem nenhum atraso ou adiantamento.

## ⚙️ Como funciona

O alinhamento acontece em três etapas:

1. **Extração de áudio**
   O FFmpeg extrai um trecho de cada arquivo: do Arquivo A, 10 segundos a partir do ponto informado pelo usuário; do Arquivo B, uma janela de 30 segundos que começa 10 segundos antes desse ponto.
   Os trechos saem em mono, 1000 Hz, float de 32 bits (f32le), o que dá uma amostra por milissegundo.

2. **Cálculo da correlação**
   O analisador compara os dois trechos pelo [Coeficiente de Correlação de Pearson (PCC)](https://en.wikipedia.org/wiki/Pearson_correlation_coefficient), deslizando a amostra do Arquivo A sobre a janela do Arquivo B até achar o ponto de maior correlação absoluta.

3. **Compensação de tempo**
   A diferença entre esse ponto e a margem inicial do Arquivo B dá o atraso exato. O sistema arredonda o valor em milissegundos e aplica na junção final.

## 💡 Recomendações de Uso

> [!TIP]
> **Escolha cenas com efeitos sonoros nítidos ou música:** Tiros, explosões, vinhetas, batidas de porta ou acordes de instrumentos isolados oferecem assinaturas de onda únicas e alta precisão de correlação.

> [!WARNING]
> **Evite trechos exclusivamente baseados em fala/diálogos:** Dublagens em idiomas diferentes alteram a forma de onda sonora da voz e os tempos de articulação, o que pode reduzir a precisão do cálculo de correlação.