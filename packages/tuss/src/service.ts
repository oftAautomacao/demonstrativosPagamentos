import type { TussConversionRecord } from '@asa/domain';

import type { TussMappingMatch, TussMappingRepository } from './types';

export class TussService {
  public constructor(private readonly repository: TussMappingRepository) {}

  public async applyMapping(
    convenioCode: string,
    codigoOriginal: string,
  ): Promise<TussMappingMatch & { record: TussConversionRecord }> {
    const mapping = await this.repository.find(convenioCode, codigoOriginal);

    if (!mapping) {
      return {
        originalCode: codigoOriginal,
        asaCode: null,
        matched: false,
        mappingSource: 'UNMAPPED',
        record: {
          originalCode: codigoOriginal,
          asaCode: null,
          matched: false,
          mappingSource: 'UNMAPPED',
        },
      };
    }

    return {
      originalCode: codigoOriginal,
      asaCode: mapping.codigoASA,
      matched: true,
      mappingSource: mapping.source,
      record: {
        originalCode: codigoOriginal,
        asaCode: mapping.codigoASA,
        matched: true,
        mappingSource: mapping.source,
      },
    };
  }
}
