import * as XLSX from 'xlsx';

import {
  addMoney,
  type AsaOutputRow,
  formatMoneyBRL,
  type Demonstrative,
  type MoneyCents,
} from '@asa/domain';

const ASA_HEADERS: Array<keyof AsaOutputRow> = [
  'CodConvenio',
  'Guia',
  'TUSS',
  'Valor',
  'Filme',
  'Qtde',
  'CodGlosa',
  'ValorAux1',
  'ValorAux2',
  'ValorAux3',
  'ValorInst',
  'Data',
  'Nome',
];

function centsToSpreadsheetValue(value: MoneyCents): string {
  return (value / 100).toFixed(2);
}

export function createAsaRows(demonstrative: Demonstrative): AsaOutputRow[] {
  return demonstrative.guides.flatMap((guide) =>
    guide.procedures.map((procedure) => ({
      CodConvenio: demonstrative.convenioCode,
      Guia: procedure.guideNumber,
      TUSS: procedure.codigoASA,
      Valor: centsToSpreadsheetValue(procedure.valorCents),
      Filme: procedure.filme,
      Qtde: String(procedure.quantidade || 1),
      CodGlosa: procedure.codGlosa,
      ValorAux1: centsToSpreadsheetValue(procedure.valorAuxiliaresCents[0]),
      ValorAux2: centsToSpreadsheetValue(procedure.valorAuxiliaresCents[1]),
      ValorAux3: centsToSpreadsheetValue(procedure.valorAuxiliaresCents[2]),
      ValorInst: centsToSpreadsheetValue(procedure.valorInstitucionalCents),
      Data: procedure.dataAtendimento,
      Nome: procedure.pacienteNome,
    })),
  );
}

export function sumAsaRowValues(rows: AsaOutputRow[]): MoneyCents {
  return addMoney(
    ...rows.map((row) => {
      const [integer, decimal = '00'] = row.Valor.split('.');
      return Number(integer) * 100 + Number(decimal.padEnd(2, '0').slice(0, 2));
    }),
  );
}

export function createAsaWorkbook(demonstrative: Demonstrative): {
  buffer: Buffer;
  rows: AsaOutputRow[];
  totalAmountCents: MoneyCents;
  humanTotal: string;
} {
  const rows = createAsaRows(demonstrative);
  const aoa: string[][] = [ASA_HEADERS, ...rows.map((row) => ASA_HEADERS.map((header) => row[header]))];
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);

  XLSX.utils.book_append_sheet(workbook, worksheet, 'ASA');

  const buffer = XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'buffer',
  }) as Buffer;

  const totalAmountCents = sumAsaRowValues(rows);

  return {
    buffer,
    rows,
    totalAmountCents,
    humanTotal: formatMoneyBRL(totalAmountCents),
  };
}
