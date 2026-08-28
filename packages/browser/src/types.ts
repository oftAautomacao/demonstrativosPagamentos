export type DownloadedFile = {
  fileName: string;
  content: Buffer;
};

export type BrowserAgent = {
  open(url: string): Promise<void>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  waitFor(selector: string): Promise<void>;
  textContent(selector: string): Promise<string | null>;
  currentUrl(): Promise<string>;
  screenshot(): Promise<Buffer>;
  download(trigger: () => Promise<void>): Promise<DownloadedFile>;
  close(): Promise<void>;
};
