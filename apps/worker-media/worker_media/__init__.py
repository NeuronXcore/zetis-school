"""worker-media : rendu MP4 sandboxé et asynchrone des capsules (ADR-0007 §7).

Process séparé du backend : consomme la file RQ `media` (Redis), rend la composition
Remotion `CapsuleVideo` en MP4 (Chromium headless via un sous-processus Node), embarque les
pistes voix Piper, puis pousse le MP4 dans le stockage objet (MinIO / disque).
"""
