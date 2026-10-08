import ctypes
import sys
import traceback
from pathlib import Path

TITLE = "Ajuste TUSS"
MB_OK = 0x00000000
MB_ICONINFORMATION = 0x00000040
MB_ICONERROR = 0x00000010


def executable_folder():
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def requested_output_folder():
    try:
        index = sys.argv.index("--output-folder")
        return Path(sys.argv[index + 1]).resolve()
    except (ValueError, IndexError):
        return executable_folder()


def show_message(message, error=False):
    flags = MB_OK | (MB_ICONERROR if error else MB_ICONINFORMATION)
    ctypes.windll.user32.MessageBoxW(None, message, TITLE, flags)


def success_message(result):
    if result.get("scope") == "root":
        lines = [
            "Processamento geral concluído.",
            "",
            f"Planos processados: {result['processedPlans']}",
            f"Competências processadas: {result['processedPeriods']}",
            f"Arquivos gerados: {result['totalFiles']}",
            f"Códigos corrigidos: {result['totalReplacements']}",
        ]
        if result["skippedPlans"]:
            lines.append(f"Planos ignorados sem tabela TUSS: {', '.join(result['skippedPlans'])}")
        if result["errors"]:
            lines.extend(["", f"Atenção: {len(result['errors'])} competência(s) apresentou(aram) erro."])
            for item in result["errors"]:
                lines.append(f"- {item['planName']} / {item['periodName']}: {item['error']}")
        elif not result["applied"]:
            lines.extend(["", "Nenhuma correção pendente foi encontrada."])
        lines.extend(["", "Os arquivos originais foram preservados."])
        return "\n".join(lines)
    if not result["applied"]:
        return "Todos os arquivos já estão corrigidos. Nenhuma alteração foi necessária."
    file_count = len(result["outputs"])
    replacements = result["totalReplacements"]
    return (
        "Correção concluída com sucesso.\n\n"
        f"Arquivos gerados: {file_count}\n"
        f"Códigos corrigidos: {replacements}\n\n"
        "Os arquivos originais foram preservados."
    )


def main():
    silent = "--silent" in sys.argv
    try:
        from tuss_processor import apply_corrections_from_location

        result = apply_corrections_from_location(requested_output_folder())
        if not silent:
            show_message(success_message(result))
        return 0
    except Exception as error:
        if silent:
            try:
                (requested_output_folder() / "erro_ajuste_tuss.txt").write_text(traceback.format_exc(), encoding="utf-8")
            except Exception:
                pass
        else:
            show_message(f"Não foi possível concluir o ajuste TUSS.\n\n{error}", error=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
