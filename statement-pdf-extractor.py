import base64
import sys

try:
    import fitz
except ImportError:
    print(
        "A leitura de PDF exige PyMuPDF. Execute: python -m pip install -r requirements.txt",
        file=sys.stderr,
    )
    raise SystemExit(2)


def main():
    encoded = sys.stdin.read().strip()
    if not encoded:
        raise ValueError("O PDF enviado está vazio.")
    document = fitz.open(stream=base64.b64decode(encoded), filetype="pdf")
    try:
        text = "\n".join(page.get_text("text") for page in document)
    finally:
        document.close()
    sys.stdout.write(text)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Não foi possível extrair o texto do PDF: {error}", file=sys.stderr)
        raise SystemExit(1)
