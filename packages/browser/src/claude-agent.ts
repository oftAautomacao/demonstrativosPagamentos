import type { BrowserAgent, DownloadedFile } from './types';

function unsupported(): never {
  throw new Error('ClaudeBrowserAgent ainda nao foi implementado.');
}

export class ClaudeBrowserAgent implements BrowserAgent {
  public async open(_url: string): Promise<void> {
    unsupported();
  }

  public async click(_selector: string): Promise<void> {
    unsupported();
  }

  public async fill(_selector: string, _value: string): Promise<void> {
    unsupported();
  }

  public async waitFor(_selector: string): Promise<void> {
    unsupported();
  }

  public async textContent(_selector: string): Promise<string | null> {
    unsupported();
  }

  public async currentUrl(): Promise<string> {
    unsupported();
  }

  public async screenshot(): Promise<Buffer> {
    unsupported();
  }

  public async download(_trigger: () => Promise<void>): Promise<DownloadedFile> {
    unsupported();
  }

  public async close(): Promise<void> {
    unsupported();
  }
}
