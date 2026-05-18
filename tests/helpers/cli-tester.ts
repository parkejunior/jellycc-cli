import { spawn, type Subprocess } from 'bun';

export const Keys = {
  Enter: '\r',
  Space: ' ',
  Down: '\x1B[B',
  Up: '\x1B[A',
};

export class CliTester {
  private proc: Subprocess;
  private outputBuffer: string = '';
  private isDead: boolean = false;

  constructor(args: string[], cwd: string) {
    this.proc = spawn(args, {
      cwd,
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...process.env,
        FORCE_COLOR: '0',
      },
    });

    this.consumeStream(this.proc.stdout as ReadableStream | null);
    this.consumeStream(this.proc.stderr as ReadableStream | null);
  }

  private async consumeStream(stream: ReadableStream | null) {
    if (!stream) return;
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (!this.isDead) {
        const { done, value } = await reader.read();
        if (done) break;
        this.outputBuffer += decoder.decode(value);
      }
    } catch (e) {
    } finally {
      reader.releaseLock();
    }
  }

  public async waitForText(text: string, timeoutMs: number = 2000): Promise<void> {
    const startTime = Date.now();
    return new Promise((resolve, reject) => {
      const check = setInterval(() => {
        if (this.outputBuffer.includes(text)) {
          clearInterval(check);
          resolve();
        } else if (Date.now() - startTime > timeoutMs) {
          clearInterval(check);
          reject(new Error(`Timeout: "${text}" not found.\nOutput:\n${this.outputBuffer}`));
        }
      }, 50);
    });
  }

  public write(input: string): void {
    if (this.proc.stdin && typeof this.proc.stdin !== 'number') {
      this.proc.stdin.write(input);
      this.proc.stdin.flush();
    }
  }

  public getOutput(): string {
    return this.outputBuffer;
  }

  public kill(): void {
    this.isDead = true;
    if (!this.proc.killed) {
      this.proc.kill();
    }
  }

  public async waitForExit(): Promise<number> {
    return this.proc.exited;
  }

  public clearOutput(): void {
    this.outputBuffer = '';
  }
}