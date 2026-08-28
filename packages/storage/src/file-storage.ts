import { createHash } from 'node:crypto';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { createEntityId, type AsaFileReference, type OriginalFileRecord } from '@asa/domain';

type ArtifactKind = 'ORIGINAL' | 'PROCESSED' | 'ASA';

type SaveArtifactInput = {
  convenioCode: string;
  paymentDate: string;
  demonstrativeId: string;
  fileName: string;
  contents: Buffer | string;
  kind: ArtifactKind;
};

const DIRECTORY_BY_KIND: Record<ArtifactKind, string> = {
  ORIGINAL: 'originais',
  PROCESSED: 'processados',
  ASA: 'asa',
};

export class FileStorageService {
  public constructor(private readonly rootDirectory: string) {}

  public async ensureBaseDirectories(): Promise<void> {
    await Promise.all([
      mkdir(path.join(this.rootDirectory, 'originais'), { recursive: true }),
      mkdir(path.join(this.rootDirectory, 'processados'), { recursive: true }),
      mkdir(path.join(this.rootDirectory, 'asa'), { recursive: true }),
      mkdir(path.join(this.rootDirectory, 'screenshots'), { recursive: true }),
      mkdir(path.join(this.rootDirectory, 'runtime'), { recursive: true }),
    ]);
  }

  public async saveArtifact(input: SaveArtifactInput): Promise<OriginalFileRecord> {
    const relativePath = this.buildRelativePath(
      input.kind,
      input.convenioCode,
      input.paymentDate,
      input.demonstrativeId,
      input.fileName,
    );
    const absolutePath = path.join(this.rootDirectory, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, input.contents);

    const hash = createHash('sha256');
    hash.update(input.contents);
    const stats = await stat(absolutePath);

    return {
      id: createEntityId('FILE'),
      fileName: input.fileName,
      relativePath,
      sha256: hash.digest('hex'),
      sizeBytes: stats.size,
      kind: input.kind,
      createdAt: new Date().toISOString(),
    };
  }

  public createAsaReference(record: OriginalFileRecord): AsaFileReference {
    return {
      fileName: record.fileName,
      relativePath: record.relativePath,
      createdAt: record.createdAt,
    };
  }

  public resolveAbsolutePath(relativePath: string): string {
    return path.join(this.rootDirectory, relativePath);
  }

  private buildRelativePath(
    kind: ArtifactKind,
    convenioCode: string,
    paymentDate: string,
    demonstrativeId: string,
    fileName: string,
  ): string {
    const [year, month] = paymentDate.split('-');
    return path.join(
      DIRECTORY_BY_KIND[kind],
      convenioCode.toLowerCase(),
      year ?? 'unknown',
      month ?? 'unknown',
      demonstrativeId,
      fileName,
    );
  }
}
