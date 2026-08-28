import { InMemoryTussMappingRepository } from './in-memory-repository';
import { TussService } from './service';

describe('TussService', () => {
  it('applies mapping and records the source', async () => {
    const service = new TussService(
      new InMemoryTussMappingRepository([
        {
          convenioCode: 'DEMO',
          codigoOriginal: '041301234',
          codigoASA: '041301240',
          source: 'fixture',
        },
      ]),
    );

    const result = await service.applyMapping('DEMO', '041301234');

    expect(result.asaCode).toBe('041301240');
    expect(result.record.matched).toBe(true);
    expect(result.record.mappingSource).toBe('fixture');
  });

  it('flags unmatched codes', async () => {
    const service = new TussService(new InMemoryTussMappingRepository([]));
    const result = await service.applyMapping('DEMO', '999999999');

    expect(result.asaCode).toBeNull();
    expect(result.record.matched).toBe(false);
  });
});
