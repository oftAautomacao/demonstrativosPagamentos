import {
  areAmountsEqual,
  type AsaOutputRow,
  type Demonstrative,
  type ValidationIssue,
  ValidationSeverity,
  ValidationStatus,
} from '@asa/domain';

import { sumAsaRowValues } from './generator';

function detectDuplicateGuides(rows: AsaOutputRow[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const row of rows) {
    const key = [row.Guia, row.TUSS, row.Valor, row.Data, row.Nome].join('|');
    if (seen.has(key)) {
      duplicates.add(row.Guia);
    } else {
      seen.add(key);
    }
  }

  return [...duplicates];
}

export function validateDemonstrative(
  demonstrative: Demonstrative,
  rows: AsaOutputRow[],
): Demonstrative['validation'] {
  const issues: ValidationIssue[] = [];
  const duplicateGuides = detectDuplicateGuides(rows);
  const asaAmountCents = sumAsaRowValues(rows);
  const missingTussMappings = demonstrative.guides.flatMap((guide) =>
    guide.procedures
      .filter((procedure) => procedure.transformations.some((transformation) => !transformation.matched))
      .map((procedure) => procedure.codigoOriginal),
  );

  if (duplicateGuides.length > 0) {
    issues.push({
      code: 'DUPLICATE_GUIDE',
      severity: ValidationSeverity.ERROR,
      message: `Duplicidades encontradas nas guias: ${duplicateGuides.join(', ')}`,
    });
  }

  if (missingTussMappings.length > 0) {
    issues.push({
      code: 'MISSING_TUSS_MAPPING',
      severity: ValidationSeverity.ERROR,
      message: `Codigos TUSS sem mapeamento: ${missingTussMappings.join(', ')}`,
    });
  }

  if (
    demonstrative.portalAmountCents !== null &&
    !areAmountsEqual(demonstrative.portalAmountCents, asaAmountCents)
  ) {
    issues.push({
      code: 'PORTAL_ASA_MISMATCH',
      severity: ValidationSeverity.ERROR,
      message: 'Valor do portal diverge do total gerado para ASA.',
    });
  }

  if (!areAmountsEqual(demonstrative.demonstrativeAmountCents, asaAmountCents)) {
    issues.push({
      code: 'DEMONSTRATIVE_ASA_MISMATCH',
      severity: ValidationSeverity.ERROR,
      message: 'Valor do demonstrativo diverge do total gerado para ASA.',
    });
  }

  for (const row of rows) {
    if (!row.Guia || !row.TUSS || !row.Nome || !row.Data) {
      issues.push({
        code: 'REQUIRED_FIELD_MISSING',
        severity: ValidationSeverity.ERROR,
        message: 'Uma ou mais linhas do arquivo ASA possuem campos obrigatorios vazios.',
      });
      break;
    }
  }

  return {
    status: issues.some((issue) => issue.severity === ValidationSeverity.ERROR)
      ? ValidationStatus.DIVERGENT
      : ValidationStatus.VALIDATED,
    portalAmountCents: demonstrative.portalAmountCents,
    demonstrativeAmountCents: demonstrative.demonstrativeAmountCents,
    asaAmountCents,
    guideCount: demonstrative.guideCount,
    duplicateGuides,
    missingTussMappings,
    issues,
  };
}
