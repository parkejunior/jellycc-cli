import { execSync } from 'child_process';
import { spinner, cancel } from '@clack/prompts';
import pc from 'picocolors';

export function runQuickScan(videoPath: string) {
  const qsSpinner = spinner();
  qsSpinner.start('Executando Quick Scan de integridade...');
  try {
    execSync(`ffprobe -v error -show_entries format -of default=noprint_wrappers=1 "${videoPath}"`, { stdio: 'pipe' });
    qsSpinner.stop(pc.green('✔ Quick Scan aprovado: Estrutura do container intacta.'));
  } catch (err) {
    qsSpinner.stop(pc.red('✖ Quick Scan reprovado: O arquivo está danificado ou ilegível.'));
    cancel('Mídia corrompida. Abortando análise para evitar falhas no servidor.');
    process.exit(1);
  }
}

export function getMediaInfo(videoPath: string) {
  const s = spinner();
  s.start('Analisando as entranhas do vídeo com ffprobe...');

  let probeData;
  try {
    const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`;
    const result = execSync(cmd, { encoding: 'utf-8' });
    probeData = JSON.parse(result);
  } catch (err) {
    s.stop(pc.red('Erro ao executar ffprobe JSON.'));
    process.exit(1);
  }
  s.stop('Análise de codec concluída!');
  return probeData;
}
