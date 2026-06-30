"""Découpage simple d'un document en chunks pour le RAG.

Stratégie minimale et lisible (CLAUDE.md : préférer simple) : on regroupe les
paragraphes (séparés par une ligne vide) sans dépasser `max_chars`, et on coupe
les paragraphes trop longs sur la longueur cible.
"""


def chunk_text(text: str, *, max_chars: int = 800) -> list[str]:
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks: list[str] = []
    buffer = ""

    def flush() -> None:
        nonlocal buffer
        if buffer.strip():
            chunks.append(buffer.strip())
        buffer = ""

    for para in paragraphs:
        # Paragraphe plus long que la cible : on le coupe en tranches.
        while len(para) > max_chars:
            flush()
            chunks.append(para[:max_chars].strip())
            para = para[max_chars:]
        if not buffer:
            buffer = para
        elif len(buffer) + len(para) + 2 <= max_chars:
            buffer = f"{buffer}\n\n{para}"
        else:
            flush()
            buffer = para
    flush()
    return chunks
