"""Extraction de texte des fichiers de cours uploadés par Papa.

Supporte Markdown / texte brut (décodage UTF-8) et PDF (pypdf). Le texte
extrait alimente ensuite le pipeline d'ingestion existant (chunking + embed).
Aucun fichier brut n'est conservé : seul le texte vectorisé est stocké (MVP)."""

import io

# Extensions supportées (minuscule, avec le point).
SUPPORTED_EXTENSIONS = (".md", ".txt", ".pdf")


def _extension(filename: str) -> str:
    name = filename.lower().strip()
    dot = name.rfind(".")
    return name[dot:] if dot != -1 else ""


def extract_text(filename: str, raw: bytes) -> str:
    """Texte brut d'un fichier de cours. Lève ValueError si format non supporté
    ou contenu vide/illisible."""
    ext = _extension(filename)
    if ext in (".md", ".txt"):
        text = raw.decode("utf-8", errors="replace")
    elif ext == ".pdf":
        text = _extract_pdf(raw)
    else:
        raise ValueError(
            f"Format non supporté : '{ext or filename}'. Formats acceptés : "
            + ", ".join(SUPPORTED_EXTENSIONS)
        )

    text = text.strip()
    if not text:
        raise ValueError("Aucun texte exploitable n'a pu être extrait du fichier.")
    return text


def _extract_pdf(raw: bytes) -> str:
    # Import local : pypdf n'est utile que pour les PDF (et garde les tests md/txt légers).
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(raw))
    except Exception as exc:  # pragma: no cover - dépend du binaire PDF
        raise ValueError(f"PDF illisible : {exc}") from exc
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n\n".join(pages)
