import io
import wave

import app.db.models as m
from app.main import app
from app.modules.stt import get_stt
from app.modules.stt.provider import SttUnavailable


def _wav_bytes(seconds: float = 1.0, rate: int = 16000) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * int(seconds * rate))
    return buf.getvalue()


def test_transcribe_returns_text_and_traces(client_db) -> None:
    client, Session = client_db
    resp = client.post(
        "/api/ai/eli5/transcribe",
        files={"file": ("dictee.wav", _wav_bytes(), "audio/wav")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"transcript", "duration_seconds"}
    assert body["transcript"]  # transcription non vide (FakeSttProvider)

    # Trace IA obligatoire (CLAUDE.md) : un ai_jobs eli5_transcribe succeeded.
    db = Session()
    try:
        assert (
            db.query(m.AIJob).filter_by(job_type="eli5_transcribe", status="succeeded").count()
            == 1
        )
        # L'audio brut n'est PAS conservé : input_json ne porte que des métadonnées.
        job = db.query(m.AIJob).filter_by(job_type="eli5_transcribe").first()
        assert set(job.input_json) == {"content_type", "bytes"}
    finally:
        db.close()


def test_transcribe_empty_audio_is_400(client_db) -> None:
    client, _ = client_db
    resp = client.post(
        "/api/ai/eli5/transcribe", files={"file": ("dictee.wav", b"", "audio/wav")}
    )
    assert resp.status_code == 400


def test_transcribe_unavailable_is_503(client_db) -> None:
    """Sans moteur STT (dépendance absente) → 503 (dégradation propre), pas 500/502."""
    client, _ = client_db

    class _Down:
        def transcribe(self, request):  # noqa: ANN001
            raise SttUnavailable("faster-whisper absent")

    app.dependency_overrides[get_stt] = lambda: _Down()
    resp = client.post(
        "/api/ai/eli5/transcribe",
        files={"file": ("dictee.wav", _wav_bytes(), "audio/wav")},
    )
    assert resp.status_code == 503
