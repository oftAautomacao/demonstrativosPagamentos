export type TussMapping = {
  convenioCode: string;
  codigoOriginal: string;
  codigoASA: string;
  source: string;
};

export type TussMappingMatch = {
  originalCode: string;
  asaCode: string | null;
  matched: boolean;
  mappingSource: string;
};

export type TussMappingRepository = {
  find(convenioCode: string, codigoOriginal: string): Promise<TussMapping | null>;
  listByConvenio(convenioCode: string): Promise<TussMapping[]>;
};
