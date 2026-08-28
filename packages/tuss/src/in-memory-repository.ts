import type { TussMapping, TussMappingRepository } from './types';

export class InMemoryTussMappingRepository implements TussMappingRepository {
  public constructor(private readonly mappings: TussMapping[]) {}

  public async find(convenioCode: string, codigoOriginal: string): Promise<TussMapping | null> {
    return (
      this.mappings.find(
        (mapping) =>
          mapping.convenioCode === convenioCode && mapping.codigoOriginal === codigoOriginal,
      ) ?? null
    );
  }

  public async listByConvenio(convenioCode: string): Promise<TussMapping[]> {
    return this.mappings.filter((mapping) => mapping.convenioCode === convenioCode);
  }
}
