import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

import fitz
import openpyxl

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from tuss_processor import apply_corrections, apply_corrections_for_root, apply_corrections_from_output_folder, build_analysis


class TussProcessorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name) / "DemonstPagProjeto"
        self.plan = self.root / "Plano Teste"
        self.month = self.plan / "AGOSTO_2026"
        self.demo_folder = self.month / "Demonstrativo XLSX"
        self.demo_folder.mkdir(parents=True)
        self.report = self.month / "relatorio_teste.txt"
        self.report.write_text("RELATORIO DE DEMONSTRATIVOS DE PAGAMENTO", encoding="utf-8")

    def tearDown(self):
        self.temporary.cleanup()

    def create_mapping(self):
        workbook = openpyxl.Workbook()
        worksheet = workbook.active
        worksheet.title = "TUSS"
        worksheet.append(["Código atual", "Novo Código"])
        worksheet.append(["XXX", 64617270])
        workbook.save(self.plan / "Ajuste Codigo TUSS.xlsx")
        workbook.close()

    def create_mapping_with_values(self):
        workbook = openpyxl.Workbook()
        worksheet = workbook.active
        worksheet.title = "TUSS"
        worksheet.append(["Valor Atual", "Novo Codigo", "Valor"])
        worksheet.append(["XXX", "11111111", "R$ 10,00"])
        worksheet.append(["XXX", "22222222", 20])
        worksheet.append(["YYY", "33333333", None])
        workbook.save(self.plan / "Ajuste Codigo TUSS.xlsx")
        workbook.close()

    def test_xlsx_replaces_every_tuss_column_and_preserves_original(self):
        self.create_mapping()
        source = self.demo_folder / "demonstrativo.xlsx"
        workbook = openpyxl.Workbook()
        worksheet = workbook.active
        worksheet.title = "Dados"
        worksheet.append(["Guia", "TUSS", "Valor", "TUSS"])
        worksheet.append(["A", "XXX", 10, "XXX"])
        worksheet.append(["B", "64617270", 20, "XXX"])
        workbook.save(source)
        workbook.close()
        original_hash = hashlib.sha256(source.read_bytes()).hexdigest()

        analysis = build_analysis(self.root, self.report)
        self.assertTrue(analysis["ready"])
        self.assertEqual(analysis["totalMatches"], 3)
        self.assertEqual(analysis["totalPendingFiles"], 1)
        self.assertEqual(analysis["files"][0]["correctionStatus"], "pending")

        result = apply_corrections(self.root, self.report)
        self.assertTrue(result["applied"])
        self.assertEqual(result["totalReplacements"], 3)
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), original_hash)

        corrected = self.month / result["outputs"][0]["output"]
        self.assertEqual(corrected.name, source.name)
        corrected_book = openpyxl.load_workbook(corrected, read_only=False)
        corrected_sheet = corrected_book["Dados"]
        self.assertEqual(corrected_sheet["B2"].value, "64617270")
        self.assertEqual(corrected_sheet["D2"].value, "64617270")
        self.assertEqual(corrected_sheet["D3"].value, "64617270")
        corrected_book.close()
        self.assertEqual(list((self.month / "TUSS Corrigidos").glob("*.json")), [])

        updated_analysis = build_analysis(self.root, self.report)
        self.assertEqual(updated_analysis["totalPendingFiles"], 0)
        self.assertTrue(updated_analysis["allCorrected"])
        self.assertEqual(updated_analysis["files"][0]["correctionStatus"], "corrected")

    def test_external_runner_uses_its_output_folder_as_context(self):
        self.create_mapping()
        source = self.demo_folder / "externo.xlsx"
        workbook = openpyxl.Workbook()
        worksheet = workbook.active
        worksheet.append(["TUSS"])
        worksheet.append(["XXX"])
        workbook.save(source)
        workbook.close()
        output_folder = self.month / "TUSS Corrigidos"
        output_folder.mkdir()

        result = apply_corrections_from_output_folder(output_folder)

        self.assertTrue(result["applied"])
        self.assertTrue((output_folder / source.name).is_file())

    def test_xlsx_uses_mapping_value_against_informed_or_released_value(self):
        self.create_mapping_with_values()
        source = self.demo_folder / "demonstrativo_com_valores.xlsx"
        workbook = openpyxl.Workbook()
        worksheet = workbook.active
        worksheet.title = "Dados"
        worksheet.append(["TUSS", "Valor Informado", "Valor Liberado"])
        worksheet.append(["XXX", 10, 999])
        worksheet.append(["XXX", 999, "R$ 20,00"])
        worksheet.append(["XXX", 30, 40])
        worksheet.append(["YYY", 30, 40])
        workbook.save(source)
        workbook.close()

        analysis = build_analysis(self.root, self.report)
        self.assertEqual(analysis["mapping"]["totalRules"], 3)
        self.assertEqual(analysis["totalMatches"], 3)

        result = apply_corrections(self.root, self.report)
        corrected = self.month / result["outputs"][0]["output"]
        corrected_book = openpyxl.load_workbook(corrected, read_only=False)
        corrected_sheet = corrected_book["Dados"]
        self.assertEqual(corrected_sheet["A2"].value, "11111111")
        self.assertEqual(corrected_sheet["A3"].value, "22222222")
        self.assertEqual(corrected_sheet["A4"].value, "XXX")
        self.assertEqual(corrected_sheet["A5"].value, "33333333")
        corrected_book.close()

    def test_missing_mapping_is_reported_without_writing(self):
        analysis = build_analysis(self.root, self.report)
        self.assertFalse(analysis["ready"])
        self.assertFalse(analysis["mapping"]["found"])
        self.assertFalse((self.month / "TUSS Corrigidos").exists())
        result = apply_corrections(self.root, self.report)
        self.assertTrue(result["skipped"])
        self.assertFalse((self.month / "TUSS Corrigidos").exists())

    def test_accepts_mapping_with_established_xslx_extension(self):
        self.create_mapping()
        mapping = self.plan / "Ajuste Codigo TUSS.xlsx"
        mapping.rename(self.plan / "Ajuste Codigo Tuss.xslx")
        source = self.demo_folder / "extensao_xslx.xlsx"
        workbook = openpyxl.Workbook()
        worksheet = workbook.active
        worksheet.append(["TUSS"])
        worksheet.append(["XXX"])
        workbook.save(source)
        workbook.close()

        analysis = build_analysis(self.root, self.report)
        self.assertTrue(analysis["mapping"]["found"])
        self.assertTrue(analysis["ready"])
        self.assertEqual(analysis["totalMatches"], 1)

        result = apply_corrections(self.root, self.report)
        self.assertTrue(result["applied"])
        corrected = self.month / result["outputs"][0]["output"]
        corrected_book = openpyxl.load_workbook(corrected)
        self.assertEqual(corrected_book.active["A2"].value, "64617270")
        corrected_book.close()

    def test_root_runner_processes_plans_with_mapping_and_ignores_the_others(self):
        self.create_mapping()
        source = self.demo_folder / "geral.xlsx"
        workbook = openpyxl.Workbook()
        workbook.active.append(["TUSS"])
        workbook.active.append(["XXX"])
        workbook.save(source)
        workbook.close()

        ignored_plan = self.root / "Plano Sem Tabela"
        ignored_source_folder = ignored_plan / "AGOSTO_2026" / "Demonstrativo XLSX"
        ignored_source_folder.mkdir(parents=True)
        ignored_book = openpyxl.Workbook()
        ignored_book.active.append(["TUSS"])
        ignored_book.active.append(["XXX"])
        ignored_book.save(ignored_source_folder / "ignorado.xlsx")
        ignored_book.close()
        utility_folder = self.root / "Regras Claude"
        utility_folder.mkdir()
        (utility_folder / "instrucoes.txt").write_text("regras", encoding="utf-8")

        result = apply_corrections_for_root(self.root)

        self.assertTrue(result["applied"])
        self.assertEqual(result["processedPlans"], 1)
        self.assertEqual(result["processedPeriods"], 1)
        self.assertIn("Plano Sem Tabela", result["skippedPlans"])
        self.assertNotIn("Regras Claude", result["skippedPlans"])
        self.assertEqual(len(result["skippedPlans"]), 1)
        self.assertTrue((self.month / "TUSS Corrigidos" / source.name).is_file())
        self.assertFalse((ignored_plan / "AGOSTO_2026" / "TUSS Corrigidos").exists())

    def test_accepts_xslx_folder_and_report_value_column(self):
        self.create_mapping_with_values()
        xslx_folder = self.month / "Demonstrativo XSLX"
        self.demo_folder.rename(xslx_folder)
        source = xslx_folder / "estrutura_real.xlsx"
        workbook = openpyxl.Workbook()
        worksheet = workbook.active
        worksheet.append(["TUSS", "Valor"])
        worksheet.append(["XXX", 10])
        worksheet.append(["XXX", 30])
        worksheet.append(["YYY", 999])
        workbook.save(source)
        workbook.close()

        misleading_pdf_folder = self.month / "Demonstrativo PDF"
        misleading_pdf_folder.mkdir()
        duplicate = openpyxl.Workbook()
        duplicate.active.append(["TUSS", "Valor"])
        duplicate.active.append(["XXX", 10])
        duplicate.save(misleading_pdf_folder / source.name)
        duplicate.close()

        analysis = build_analysis(self.root, self.report)
        self.assertEqual(analysis["totalFiles"], 1)
        self.assertEqual(analysis["totalMatches"], 2)

        result = apply_corrections(self.root, self.report)
        corrected = self.month / result["outputs"][0]["output"]
        corrected_book = openpyxl.load_workbook(corrected)
        corrected_sheet = corrected_book.active
        self.assertEqual(corrected_sheet["A2"].value, "11111111")
        self.assertEqual(corrected_sheet["A3"].value, "XXX")
        self.assertEqual(corrected_sheet["A4"].value, "33333333")
        corrected_book.close()

    def test_pdf_replaces_only_values_aligned_with_tuss_column(self):
        self.create_mapping()
        pdf_folder = self.month / "Demonstrativo PDF"
        pdf_folder.mkdir()
        source = pdf_folder / "demonstrativo.pdf"
        document = fitz.open()
        page = document.new_page()
        page.insert_text((80, 80), "TUSS", fontsize=10)
        page.insert_text((80, 105), "XXX", fontsize=10)
        page.insert_text((260, 105), "XXX", fontsize=10)
        document.save(source)
        document.close()
        original_hash = hashlib.sha256(source.read_bytes()).hexdigest()

        analysis = build_analysis(self.root, self.report)
        pdf_analysis = next(item for item in analysis["files"] if item["format"] == "PDF")
        self.assertEqual(pdf_analysis["totalMatches"], 1)

        result = apply_corrections(self.root, self.report)
        pdf_output = next(item for item in result["outputs"] if item["format"] == "PDF")
        corrected = self.month / pdf_output["output"]
        corrected_document = fitz.open(corrected)
        text = "\n".join(page.get_text() for page in corrected_document)
        corrected_document.close()
        self.assertIn("64617270", text)
        self.assertIn("XXX", text)
        self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), original_hash)

    def test_pdf_uses_mapping_value_against_report_value(self):
        workbook = openpyxl.Workbook()
        worksheet = workbook.active
        worksheet.append(["Valor Atual", "Novo Codigo", "Valor"])
        worksheet.append(["ABC", "99999999", "10,00"])
        workbook.save(self.plan / "Ajuste Codigo TUSS.xlsx")
        workbook.close()

        pdf_folder = self.month / "Demonstrativo PDF"
        pdf_folder.mkdir()
        source = pdf_folder / "demonstrativo_com_valores.pdf"
        document = fitz.open()
        page = document.new_page()
        page.insert_text((80, 80), "TUSS", fontsize=10)
        page.insert_text((180, 80), "Valor Informado", fontsize=10)
        page.insert_text((80, 105), "ABC", fontsize=10)
        page.insert_text((200, 105), "10,00", fontsize=10)
        page.insert_text((80, 130), "ABC", fontsize=10)
        page.insert_text((200, 130), "20,00", fontsize=10)
        document.save(source)
        document.close()

        analysis = build_analysis(self.root, self.report)
        pdf_analysis = next(item for item in analysis["files"] if item["format"] == "PDF")
        self.assertEqual(pdf_analysis["totalMatches"], 1)

        result = apply_corrections(self.root, self.report)
        corrected = self.month / result["outputs"][0]["output"]
        corrected_document = fitz.open(corrected)
        text = "\n".join(page.get_text() for page in corrected_document)
        corrected_document.close()
        self.assertIn("99999999", text)
        self.assertEqual(text.count("ABC"), 1)


if __name__ == "__main__":
    unittest.main()
