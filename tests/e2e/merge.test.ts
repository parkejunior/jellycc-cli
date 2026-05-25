import fs from 'fs';
import { spawnSync } from 'child_process';
import { describe, expect, test, afterEach, beforeAll, afterAll } from 'bun:test';
import { tmpdir } from 'os';
import path from 'path';
import { CliTester, Keys } from '../helpers/cli-tester.ts';

describe('E2E: JellyCC Merge Menu', () => {
  let cli: CliTester;
  const fakeHome = fs.mkdtempSync(path.join(tmpdir(), 'jellycc-test-home-merge-'));
  const fixturePath = (name: string) => path.join(process.cwd(), 'tests', 'fixtures', name);
  const longMergeFixture = path.join(fakeHome, 'merge-long.mkv');

  beforeAll(() => {
    const configDir = path.join(fakeHome, '.config', 'jellycc');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ lang: 'en-US' }, null, 2)
    );

    const generated = spawnSync('ffmpeg', [
      '-y',
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=3:size=640x360:rate=24',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=1000:duration=3',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      longMergeFixture
    ]);

    if (generated.error || generated.status !== 0) {
      throw new Error(`Failed to generate merge fixture: ${generated.stderr?.toString() || generated.error?.message || 'unknown error'}`);
    }

    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    process.env.LANG = 'en_US.UTF-8';
    process.env.LC_ALL = 'en_US.UTF-8';
  });

  afterEach(() => {
    if (cli) cli.kill();
  });

  afterAll(() => {
    fs.rmSync(fakeHome, { recursive: true, force: true });
  });

  const openMergePaths = async (pathA: string, pathB: string) => {
    await cli.waitForText('File A Path (Base/Reference):');
    cli.write(pathA);
    cli.write(Keys.Enter);

    await cli.waitForText('File B Path (Merge Target):');
    cli.write(pathB);
    cli.write(Keys.Enter);
  };

  const acceptDefaultStreamSelection = async () => {
    await cli.waitForText('Select the streams you want to keep');
    cli.write(Keys.Enter);
  };

  const selectAudioTrackFromInitialSelection = async () => {
    await cli.waitForText('Select the streams you want to keep');
    cli.press(Keys.Down, 4);
    cli.write(Keys.Space);
    cli.write(Keys.Enter);
  };

  const finishTagPromptWithoutChanges = async (downCount: number = 2) => {
    await cli.waitForText('One or more tracks with unknown language (UND) detected.');
    cli.write(Keys.Enter);

    await cli.waitForText('Select the track you want to edit:');
    cli.write(Keys.Up);
    cli.write(Keys.Enter);
  };

  const openExecutionMenu = async () => {
    await cli.waitForText('What do you want to do?');
  };

  const exitFromExecutionMenu = () => {
    cli.write(Keys.Up);
    cli.write(Keys.Enter);
  };

  // Entrance
  test('Should show error if provided file paths do not exist', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'merge'], process.cwd());

    await cli.waitForText('File A Path (Base/Reference):');
    cli.write(path.join(fakeHome, 'missing-a.mkv'));
    cli.write(Keys.Enter);

    await cli.waitForText('File not found on disk!');

    expect(cli.getOutput()).toContain('File not found on disk!');
  });

  // Core
  test('Should process two files, show comparison table, and exit gracefully', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'merge'], process.cwd());

    await openMergePaths(fixturePath('perfect.mkv'), fixturePath('needs_transcode.mkv'));
    await acceptDefaultStreamSelection();

    await cli.waitForText('Suggested FFmpeg Command (Merge)');
    await openExecutionMenu();
    exitFromExecutionMenu();

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(0);
    expect(finalOutput).toContain('Side-by-Side Comparison');
    expect(finalOutput).toContain('Suggested FFmpeg Command (Merge)');
    expect(finalOutput).toContain('Clean command generated:');
    expect(finalOutput).toContain('Operation finished. 🚀');
  });

  // Edge Cases
  test('Should allow dropping a stream from the merge list and update the command', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'merge'], process.cwd());

    await openMergePaths(fixturePath('perfect.mkv'), fixturePath('perfect.mkv'));
    await selectAudioTrackFromInitialSelection();
    await finishTagPromptWithoutChanges();

    await openExecutionMenu();
    cli.clearOutput();

    cli.press(Keys.Down, 3);
    cli.write(Keys.Enter);

    await cli.waitForText('Modify the streams you want to keep');
    cli.press(Keys.Down, 4);
    cli.write(Keys.Space);
    cli.write(Keys.Enter);

    // await finishTagPromptWithoutChanges();

    await cli.waitForText('Suggested FFmpeg Command (Merge)');
    await openExecutionMenu();
    exitFromExecutionMenu();

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(0);
    expect(finalOutput).toContain('Suggested FFmpeg Command (Merge)');
    expect(finalOutput).toContain('-map 0:0');
    expect(finalOutput.includes('-map 0:1')).toBe(false);
    expect(finalOutput).toContain('Clean command generated:');
    expect(finalOutput).toContain('Operation finished. 🚀');
  });

  test('Should allow manual sync adjustment and apply strict cut (-shortest)', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'merge'], process.cwd());

    await openMergePaths(fixturePath('perfect.mkv'), longMergeFixture);
    await acceptDefaultStreamSelection();

    await cli.waitForText('Duration Alert');
    await cli.waitForText('How do you want to adjust the sync for File B?');

    cli.press(Keys.Down, 1);
    cli.write(Keys.Enter);

    await cli.waitForText('Enter the delay for File B in milliseconds');
    cli.press(Keys.Backspace, 1);
    cli.write('2000');
    cli.write(Keys.Enter);

    await cli.waitForText('Do you want to use Strict Mode');
    cli.write(Keys.Enter);

    await cli.waitForText('Suggested FFmpeg Command (Merge)');
    await openExecutionMenu();
    exitFromExecutionMenu();

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(0);
    expect(finalOutput).toContain('Duration Alert');
    expect(finalOutput).toContain('Sync adjusted: 2000ms');
    expect(finalOutput).not.toContain('[Strict Cut]');
    expect(finalOutput).toContain('Clean command generated:');
    expect(finalOutput).toContain('Operation finished. 🚀');
  });

  test('Should allow editing track tags of merged streams', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'merge'], process.cwd());

    await openMergePaths(fixturePath('perfect.mkv'), fixturePath('perfect.mkv'));
    await acceptDefaultStreamSelection();

    await cli.waitForText('Suggested FFmpeg Command (Merge)');
    await openExecutionMenu();
    cli.clearOutput();

    cli.press(Keys.Down, 4);
    cli.write(Keys.Enter);

    await cli.waitForText('Select the track you want to edit:');
    cli.write(Keys.Enter);

    await cli.waitForText('Language (3-letter code. Ex: eng, jpn, und):');
    cli.press(Keys.Backspace, 3);
    cli.write('jpn');
    cli.write(Keys.Enter);

    await cli.waitForText('Track Title (Leave blank to clear original):');
    cli.write(Keys.Enter);

    await cli.waitForText('Select the track you want to edit:');
    cli.press(Keys.Down, 1);
    cli.write(Keys.Enter);

    await cli.waitForText('Suggested FFmpeg Command (Merge)');
    await openExecutionMenu();
    exitFromExecutionMenu();

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(0);
    expect(finalOutput).toContain('language="jpn"');
    expect(finalOutput).toContain('Suggested FFmpeg Command (Merge)');
    expect(finalOutput).toContain('Clean command generated:');
    expect(finalOutput).toContain('Operation finished. 🚀');
  });
});
