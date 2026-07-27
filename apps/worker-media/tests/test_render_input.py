"""Tests de `build_render_input` (pur : sans Node, sans DB, sans réseau)."""

from worker_media.render import build_render_input


def test_rewrites_audiourl_and_stages_wavs() -> None:
    spec = {
        "title": "Fractions",
        "fps": 30,
        "scenes": [
            {"kind": "title", "audioUrl": "/api/capsules/5/audio/0", "durationInFrames": 60},
            {"kind": "bullet", "durationInFrames": 90},  # scène sans narration
            {"kind": "definition", "audioUrl": "/api/capsules/5/audio/2", "durationInFrames": 80},
        ],
    }
    wavs = {0: b"AAA", 2: b"CCC"}

    render_spec, staged = build_render_input(spec, lambda i: wavs.get(i))

    # audioUrl réécrit en nom nu, résolu par staticFile côté bundle.
    assert render_spec["scenes"][0]["audioUrl"] == "scene_0.wav"
    assert "audioUrl" not in render_spec["scenes"][1]
    assert render_spec["scenes"][2]["audioUrl"] == "scene_2.wav"
    # Les WAV correspondants sont collectés pour le publicDir.
    assert staged == [("scene_0.wav", b"AAA"), ("scene_2.wav", b"CCC")]
    # Champs racine préservés.
    assert render_spec["title"] == "Fractions" and render_spec["fps"] == 30


def test_missing_wav_drops_audio_instead_of_failing() -> None:
    spec = {"scenes": [{"kind": "title", "audioUrl": "/api/capsules/1/audio/0", "durationInFrames": 60}]}

    render_spec, staged = build_render_input(spec, lambda i: None)

    assert "audioUrl" not in render_spec["scenes"][0]  # rendue muette
    assert staged == []


def test_no_scenes_is_safe() -> None:
    render_spec, staged = build_render_input({"scenes": []}, lambda i: b"x")
    assert render_spec["scenes"] == []
    assert staged == []
