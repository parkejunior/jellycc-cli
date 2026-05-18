import { describe, expect, test, afterEach, beforeAll } from 'bun:test';
import { CliTester, Keys } from '../helpers/cli-tester.ts';
import { tmpdir } from 'os';
import path from 'path';

describe('E2E: JellyCC Config Menu', () => {
  let cli: CliTester;

  afterEach(() => {
    if (cli) cli.kill();
  });

  beforeAll(() => {
    const fakeHome = path.join(tmpdir(), 'jellycc-test-home');
    process.env.HOME = fakeHome;
    process.env.USERPROFILE = fakeHome; 
  });

  // Language
  test('Should change the language of the interface', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'config'], process.cwd());

    await cli.waitForText('What do you want to do?');

    cli.write(Keys.Enter);

    await cli.waitForText('Select your preferred language');

    cli.write(Keys.Down);
    cli.write(Keys.Enter);

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(0);
    expect(finalOutput).toContain('Language changed successfully!');
  });

  test('Should run the --lang flag directly without interactive menu', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'config', '--lang', 'en-US'], process.cwd());

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(0);
    expect(finalOutput).toContain('en-US'); 
  });

  test('Should fallback to interactive menu if invalid --lang flag is provided', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'config', '--lang', 'fr-FR'], process.cwd());

    await cli.waitForText('What do you want to do?');

    cli.write(Keys.Down);
    cli.write(Keys.Down);
    cli.write(Keys.Enter);

    const exitCode = await cli.waitForExit();
    expect(exitCode).toBe(0);
  });

  // Rules
  test('Should generate rules template file', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'config'], process.cwd());

    await cli.waitForText('What do you want to do?');

    cli.write(Keys.Down);
    cli.write(Keys.Enter);

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(0);
    expect(finalOutput).toContain('Template generated at:');
    expect(finalOutput).toContain('rules.example.json');
  });

  test('Should run the --init flag directly without interactive menu', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'config', '--init'], process.cwd());

    const exitCode = await cli.waitForExit();
    const finalOutput = cli.getOutput();

    expect(exitCode).toBe(0);
    expect(finalOutput).toContain('Template generated at:');
    expect(finalOutput).toContain('rules.example.json');
  });

  // Exit
  test('Should cancel the operation in interactive menu by pressing the option', async () => {
    cli = new CliTester(['bun', 'run', 'src/index.ts', 'config'], process.cwd());

    await cli.waitForText('What do you want to do?');

    cli.write(Keys.Down);
    cli.write(Keys.Down);
    cli.write(Keys.Enter);

    const exitCode = await cli.waitForExit();
    expect(exitCode).toBe(0);
  });
});