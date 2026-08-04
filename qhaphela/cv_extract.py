"""
CV text extraction for Qhaphela.

Privacy: extraction happens in the local scoring service running on the
user's own machine (127.0.0.1). The file is parsed in memory, used for a
single keyword comparison, and never written to disk, logged, or forwarded
anywhere. There is no storage path on this route at all.

Formats are supported only where extraction is genuinely reliable. Legacy
binary .doc is deliberately rejected with a clear message rather than
half-parsed into garbage that would silently produce a wrong match score.
"""

import io
import re
import zipfile
from xml.etree import ElementTree

SUPPORTED = (".txt", ".md", ".pdf", ".docx")

# WordprocessingML namespace -- paragraph and text nodes live here.
_W_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _clean(text: str) -> str:
    """Collapse the whitespace that PDF and DOCX extraction tends to leave."""
    text = text.replace("\xa0", " ")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _from_docx(data: bytes) -> str:
    """
    Extract text from a .docx using only the standard library.

    A .docx is a ZIP of XML; word/document.xml holds the body. Reading it
    directly avoids adding a dependency for what is a dozen lines of work.
    """
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        with z.open("word/document.xml") as f:
            tree = ElementTree.parse(f)
    paragraphs = []
    for para in tree.iter(f"{_W_NS}p"):
        # Join every text run inside the paragraph, then treat the paragraph
        # as one line -- otherwise every styled word becomes its own line.
        runs = [node.text or "" for node in para.iter(f"{_W_NS}t")]
        line = "".join(runs).strip()
        if line:
            paragraphs.append(line)
    return "\n".join(paragraphs)


def _from_pdf(data: bytes) -> str:
    import fitz  # PyMuPDF

    with fitz.open(stream=data, filetype="pdf") as doc:
        return "\n".join(page.get_text() for page in doc)


def extract(filename: str, data: bytes) -> str:
    """
    Return plain text from an uploaded CV.

    Raises ValueError with a message intended to be shown to the user.
    """
    name = (filename or "").lower()

    if name.endswith(".doc") and not name.endswith(".docx"):
        raise ValueError(
            "Old .doc files can't be read reliably. Please save your CV as .docx or PDF and try again."
        )

    if name.endswith((".txt", ".md")):
        text = data.decode("utf-8", errors="replace")
    elif name.endswith(".docx"):
        try:
            text = _from_docx(data)
        except (zipfile.BadZipFile, KeyError):
            raise ValueError("That file could not be read as a Word document. Try re-saving it as .docx or PDF.")
    elif name.endswith(".pdf"):
        try:
            text = _from_pdf(data)
        except Exception:
            raise ValueError("That PDF could not be read. If it is a scanned image, save a text-based copy and try again.")
    else:
        raise ValueError(f"Unsupported file type. Please upload one of: {', '.join(SUPPORTED)}")

    text = _clean(text)
    if len(text) < 40:
        raise ValueError(
            "Almost no text was found in that file. If your CV is a scanned image, "
            "a text-based PDF or Word file is needed to compare it."
        )
    return text
