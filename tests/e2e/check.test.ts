import fs from 'fs';
import { describe, expect, test, afterEach, beforeAll } from 'bun:test';
import { tmpdir } from 'os';
import path from 'path';
import { CliTester, Keys } from '../helpers/cli-tester.ts';

describe('E2E: JellyCC Check Menu', () => {
  let cli: CliTester;
  const fakeHome = path.join(tmpdir(), 'jellycc-test-home-check');
  const fixturePath = (name: string) => path.join(process.cwd(), 'tests', 'fixtures', name);

  beforeAll(() => {
    fs.rmSync(fakeHome, { recursive: true, force: true });

    const configDir = path.join(fakeHome, '.config', 'jellycc');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ lang: 'en-US' }, null, 2)
    );

    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome;
    process.env.LANG = 'en_US.UTF-8';
    process.env.LC_ALL = 'en_US.UTF-8';
  });

  afterEach(() => {
    if (cli) cli.kill();
  });

  const acceptInitialTagEditing = async (downCount: number = 2) => {
    await cli.waitForText('One or more tracks with unknown language (UND) detected.');
    cli.write(Keys.Enter);

    await cli.waitForText('Select the track you want to edit:');
    cli.press(Keys.Down, downCount);
    cli.write(Keys.Enter);
  };

  const openExecutionMenu = async () => {
    await cli.waitForText('What do you want to do?');
  };

  // Entrance
  test('Should show warn if provided file path does not exist', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'check', 'invalid-file.mkv'], process.cwd());

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(1);
    expect(finalOutput).toContain('The file passed as an argument was not found on disk!');
  });

  test('Should prompt for video path if executed without arguments', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'check'], process.cwd());

    await cli.waitForText('What is the video file path?');

    expect(cli.getOutput()).toContain('What is the video file path?');
  });

  test('Should throw ValidationError if the file is corrupted (Quick Scan fails)', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'check', fixturePath('corrupted.mkv')], process.cwd());

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(1);
    expect(finalOutput).toContain('Corrupted media. Aborting analysis to prevent server crashes.');
  });

  // Analyzer
  test('Should show "Perfect" message and exit immediately if file perfectly matches rules', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'check', fixturePath('perfect.mkv')], process.cwd());

    await acceptInitialTagEditing();

    await cli.waitForText('Ready to use');
    await openExecutionMenu();
    cli.write(Keys.Up);
    cli.write(Keys.Enter);

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(0);
    expect(finalOutput).toContain('Ready to use');
    expect(finalOutput).toContain('Operation finished.');
  });

  test('Should show "Remux Only" message and suggest cleanup command if video/audio are compatible but container is wrong', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'check', fixturePath('with_garbage.mkv')], process.cwd());

    await cli.waitForText('Embedded garbage detected');
    cli.write(Keys.Enter);

    await acceptInitialTagEditing(3);

    await cli.waitForText('Suggested Cleanup Command');
    await openExecutionMenu();
    cli.write(Keys.Up);
    cli.write(Keys.Enter);

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(0);
    expect(finalOutput).toContain('The file only requires cleanup (Remux). You discarded 1 stream(s).');
    expect(finalOutput).toContain('Suggested Cleanup Command');
    expect(finalOutput).toContain('Operation finished. 🚀');
  });

  test('Should show Transcode action plan if video codec is incompatible', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'check', fixturePath('needs_transcode.mkv')], process.cwd());

    await acceptInitialTagEditing();

    await cli.waitForText('Suggested FFmpeg Command (Transcode + Cleanup)');
    await openExecutionMenu();
    cli.write(Keys.Up);
    cli.write(Keys.Enter);

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(0);
    expect(finalOutput).toContain('Suggested FFmpeg Command (Transcode + Cleanup)');
    expect(finalOutput).toContain('hevc_10bit');
    expect(finalOutput).toContain('Operation finished. 🚀');
  });

  // // Edge Cases
  test('Should prompt to remove embedded garbage if cover art or PGS subtitles are detected', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'check', fixturePath('with_garbage.mkv')], process.cwd());

    await cli.waitForText('Embedded garbage detected');

    expect(cli.getOutput()).toContain('Embedded garbage detected');
  });

  test('Should open stream selection menu, drop a track, and update action plan to Remux', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'check', fixturePath('perfect.mkv')], process.cwd());

    await acceptInitialTagEditing();

    await openExecutionMenu();
    cli.write(Keys.Down);
    cli.write(Keys.Enter);

    await cli.waitForText('Select the streams you want to keep in the final file:');
    cli.write(Keys.Down);
    cli.write(Keys.Space);
    cli.write(Keys.Enter);
    
    await acceptInitialTagEditing(3);

    await cli.waitForText('You discarded 1 stream(s).');
    await openExecutionMenu();
    cli.write(Keys.Up);
    cli.write(Keys.Enter);

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(0);
    expect(finalOutput).toContain('The file only requires cleanup (Remux). You discarded 1 stream(s).');
    expect(finalOutput).toContain('Suggested Cleanup Command');
    expect(finalOutput).toContain('Operation finished. 🚀');
  });

  test('Should open tags editor, change language, and update the suggested command', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'check', fixturePath('perfect.mkv')], process.cwd());

    await acceptInitialTagEditing();

    await openExecutionMenu();
    cli.write(Keys.Down);
    cli.write(Keys.Down);
    cli.write(Keys.Enter);

    await cli.waitForText('Select the track you want to edit:');
    cli.write(Keys.Down);
    cli.write(Keys.Enter);

    await cli.waitForText('Language (3-letter code. Ex: eng, jpn, und):');

    cli.press(Keys.Backspace, 3);
    cli.write('jpn');
    cli.write(Keys.Enter);

    await cli.waitForText('Track Title (Leave blank to clear original):');
    cli.clearOutput();
    cli.write(Keys.Enter);

    await cli.waitForText('Select the track you want to edit:');
    cli.press(Keys.Down, 2);
    cli.write(Keys.Enter);

    await cli.waitForText('language="jpn"');
    await openExecutionMenu();
    cli.write(Keys.Up);
    cli.write(Keys.Enter);

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(0);
    expect(finalOutput).toContain('language="jpn"');
    expect(finalOutput).toContain('The file only requires cleanup (Remux). You discarded 0 stream(s).');
    expect(finalOutput).toContain('Operation finished. 🚀');
  });

  test('Should exit gracefully and print the generated command when selecting Exit', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'check', fixturePath('needs_transcode.mkv')], process.cwd());

    await acceptInitialTagEditing();
    await openExecutionMenu();

    cli.write(Keys.Up);
    cli.write(Keys.Enter);

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(0);
    expect(finalOutput).toContain('Clean command generated:');
    expect(finalOutput).toContain('Operation finished. 🚀');
  });

  // Deep Scan
  test('Should handle --deep-scan flag and bypass scan options in the menu', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'check', fixturePath('perfect.mkv'), '--deep-scan'], process.cwd());

    await acceptInitialTagEditing();
    await openExecutionMenu();

    const currentOutput = cli.getOutput();
    
    expect(currentOutput).not.toContain('Deep Scan (All tracks');
    expect(currentOutput).not.toContain('Myopic Scan');
    
    cli.write(Keys.Up);
    cli.write(Keys.Enter);
    await cli.waitForExit();
  });

  test('Should execute Full Deep Scan from the interactive menu and return to menu', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'check', fixturePath('perfect.mkv')], process.cwd());

    await acceptInitialTagEditing();
    await openExecutionMenu();

    cli.press(Keys.Down, 3);
    cli.write(Keys.Enter);

    await cli.waitForText('Deep Scan perfect: No errors or glitches found in the file!');
    await openExecutionMenu();

    cli.write(Keys.Up);
    cli.write(Keys.Enter);
    const exitCode = await cli.waitForExit();

    expect(exitCode).toBe(0);
  });
});
