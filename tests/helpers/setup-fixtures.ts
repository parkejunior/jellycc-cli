import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import pc from 'picocolors';

const FIXTURES_DIR = path.join(process.cwd(), 'tests', 'fixtures');

if (fs.existsSync(FIXTURES_DIR)) {
  fs.rmSync(FIXTURES_DIR, { recursive: true, force: true });
}
fs.mkdirSync(FIXTURES_DIR, { recursive: true });

console.log(pc.cyan('Generating fixtures...'));

const runFfmpeg = (name: string, args: string[]) => {
  console.log(pc.dim(`  ◌ ${name}...`));
  const result = spawnSync('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args]);
  
  if (result.error || result.status !== 0) {
    console.error(pc.red(`Erro ao gerar ${name}:`), result.stderr?.toString());
    process.exit(1);
  }
};

try {
  // Perfect (H264 + AAC in MKV)
  runFfmpeg('perfect.mkv', [
    '-f', 'lavfi', '-i', 'testsrc=duration=1:size=640x360:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1',
    '-c:v', 'libx264', '-c:a', 'aac',
    path.join(FIXTURES_DIR, 'perfect.mkv')
  ]);

  // Needs Transcode (HEVC 10-bit + FLAC)
  runFfmpeg('needs_transcode.mkv', [
    '-f', 'lavfi', '-i', 'testsrc=duration=1:size=640x360:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1',
    '-c:v', 'libx265', '-pix_fmt', 'yuv420p10le', '-c:a', 'flac',
    path.join(FIXTURES_DIR, 'needs_transcode.mkv')
  ]);

  // No Audio
  runFfmpeg('no_audio.mkv', [
    '-f', 'lavfi', '-i', 'testsrc=duration=2:size=640x360:rate=24',
    '-c:v', 'libx264',
    path.join(FIXTURES_DIR, 'no_audio.mkv')
  ]);

  // Silence Clean (3 seconds of noise)
  runFfmpeg('silence_clean.mkv', [
    '-f', 'lavfi', '-i', 'testsrc=duration=3:size=640x360:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=3',
    '-c:v', 'libx264', '-c:a', 'aac',
    path.join(FIXTURES_DIR, 'silence_clean.mkv')
  ]);

  // Garbage File (Video + Audio + Cover Art)
  const coverPath = path.join(FIXTURES_DIR, 'cover_temp.jpg');
  runFfmpeg('cover_temp.jpg', [
    '-f', 'lavfi', '-i', 'color=c=red:s=320x240:d=1',
    '-vframes', '1', coverPath
  ]);

  runFfmpeg('with_garbage.mkv', [
    '-f', 'lavfi', '-i', 'testsrc=duration=1:size=640x360:rate=24',
    '-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1',
    '-i', coverPath,
    '-map', '0:v', '-map', '1:a', '-map', '2:v',
    '-c:v:0', 'libx264', '-c:a', 'aac', '-c:v:1', 'copy',
    '-disposition:v:1', 'attached_pic',
    path.join(FIXTURES_DIR, 'with_garbage.mkv')
  ]);
  
  fs.rmSync(coverPath);

  // Corrupted File
  const corruptedPath = path.join(FIXTURES_DIR, 'corrupted.mkv');
  console.log(pc.dim('  ◌ corrupted.mkv...'));
  fs.writeFileSync(corruptedPath, 'This is not a valid MKV file');

  console.log(pc.green('✔ All fixtures generated successfully!'));

} catch (error) {
  console.error(pc.red('\n✖ Error generating fixtures:'), error);
  process.exit(1);
}