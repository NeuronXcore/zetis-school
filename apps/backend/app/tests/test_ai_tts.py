def test_tts_returns_wav(client_db) -> None:
    """La voix ZETIS (même moteur que les capsules) renvoie un WAV jouable."""
    client, _ = client_db
    resp = client.post("/api/ai/tts", json={"text": "Massimo, je prépare ton ELI5"})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/wav"
    assert len(resp.content) > 44  # en-tête WAV (44 o) + données


def test_tts_empty_is_400(client_db) -> None:
    client, _ = client_db
    assert client.post("/api/ai/tts", json={"text": "   "}).status_code == 400
