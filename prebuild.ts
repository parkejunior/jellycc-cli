import fs from 'fs';
import YAML from 'yaml';
import pc from 'picocolors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const matrixPath = path.join(__dirname, 'jellyfin-codec-support.yaml');
const rulesPath = path.join(__dirname, 'fallback_rules.yaml');

try {
  const matrix = YAML.parse(fs.readFileSync(matrixPath, 'utf8'));
  const rules = YAML.parse(fs.readFileSync(rulesPath, 'utf8'));

  if (!fs.existsSync('./dist')) {
    fs.mkdirSync('./dist', { recursive: true });
  }

  fs.writeFileSync('./dist/matrix.json', JSON.stringify(matrix));
  fs.writeFileSync('./dist/rules.json', JSON.stringify(rules));

  console.log(pc.green('✔ YAMLs convertidos para JSON com sucesso!'));
} catch (error) {
  console.error(pc.red('✖ Erro ao converter YAML para JSON. Verifique se os arquivos existem.'));
  console.error(error);
  process.exit(1);
}