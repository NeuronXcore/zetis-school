#!/usr/bin/env python3
"""Benchmark vitesse + qualité : Ollama vs MLX sur les VRAIS prompts ZETIS (ADR-0008).

Objectif (décidé avec Papa) : comparer, sur les tâches réelles de l'app (ELI5, diagnostic,
capsule), la VITESSE (tokens/s, latence) ET la QUALITÉ (JSON valide + échantillons lisibles)
de plusieurs couples (moteur, modèle), pour décider sur des chiffres — et non à l'aveugle.

Le script est AUTONOME (hors runtime backend) : il importe seulement les prompts et schémas
depuis `apps/backend/app`, et parle en HTTP à :
  - Ollama  : POST {ollama_url}/api/generate           (compteurs eval_count/eval_duration)
  - MLX     : POST {mlx_url}/v1/chat/completions        (OpenAI-compatible, usage.completion_tokens)

Rien n'est écrit en base ; aucune dépendance `mlx`. Les modèles indisponibles sont ignorés
proprement (marqués « injoignable »).

Usage :
    python scripts/bench_llm.py
    python scripts/bench_llm.py --repeats 3 --out scratchpad/bench.md
    python scripts/bench_llm.py --ollama-models qwen2.5:14b qwen2.5:32b \
        --mlx-models mlx-community/Qwen2.5-14B-Instruct-4bit

Prérequis :
    - Ollama lancé (défaut :11434) avec les modèles à tester (`ollama pull ...`).
    - `mlx_lm.server --model <m> --port 8080` pour chaque modèle MLX (un serveur à la fois :
      relancez-le en changeant --model, ou testez modèle par modèle).
"""

from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import httpx
from pydantic import BaseModel, ConfigDict, Field

# --- Import des prompts/schémas ZETIS (source de vérité, pas de duplication) ---
REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND = REPO_ROOT / "apps" / "backend"
sys.path.insert(0, str(BACKEND))

from app.prompts import capsule as capsule_prompt  # noqa: E402
from app.prompts import diagnostic as diag_prompt  # noqa: E402
from app.prompts import eli5 as eli5_prompt  # noqa: E402


# ---------------------------------------------------------------------------
# Tâches représentatives (mêmes system/prompt/format que le backend en prod).
# ---------------------------------------------------------------------------
@dataclass
class Task:
    name: str
    system: str
    prompt: str
    # None → mode JSON simple ; dict → JSON Schema guidé (capsule).
    fmt: object | None
    validate: object  # callable(text) -> (ok: bool, detail: str)


def _validate_keys(required: list[str]):
    def _v(text: str) -> tuple[bool, str]:
        try:
            data = json.loads(text)
        except json.JSONDecodeError as exc:
            return False, f"JSON invalide: {exc}"
        missing = [k for k in required if k not in data]
        return (not missing), ("ok" if not missing else f"clés manquantes: {missing}")

    return _v


def _validate_capsule(text: str) -> tuple[bool, str]:
    from app.modules.capsules.schemas import CapsuleSpec  # import tardif (dépend de pydantic)

    try:
        CapsuleSpec.model_validate_json(text)
        return True, "CapsuleSpec valide"
    except Exception as exc:  # ValidationError ou JSON invalide
        return False, f"CapsuleSpec invalide: {str(exc)[:120]}"


def _validate_diagnostic(text: str) -> tuple[bool, str]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        return False, f"JSON invalide: {exc}"
    qs = data.get("questions")
    if not isinstance(qs, list) or not qs:
        return False, "champ 'questions' absent ou vide"
    for q in qs:
        if not all(k in q for k in ("prompt", "choices", "correct_index")):
            return False, "question incomplète (prompt/choices/correct_index)"
    return True, f"{len(qs)} questions valides"


def build_tasks() -> list[Task]:
    from app.modules.capsules.schemas import generation_schema

    eli5_p = eli5_prompt.ELI5_EXPLAIN_PROMPT_V1.format(
        level="4e",
        subject="Mathématiques",
        skill="Nombres relatifs",
        question="Pourquoi -5 est plus petit que -2 ?",
        context="",
    )
    diag_p = diag_prompt.DIAGNOSTIC_GEN_PROMPT_V1.format(
        n=2, subject="Mathématiques", skill="Fractions", level="6e"
    )
    caps_system, caps_p = capsule_prompt.build_prompt(
        instruction="Explique le théorème de Pythagore avec la figure.",
        subject="Mathématiques",
        level="4e",
        skill="Théorème de Pythagore",
        difficulty="moyen",
        duration="moyenne",
    )
    return [
        Task("eli5_explain", eli5_prompt.ELI5_SYSTEM, eli5_p, None,
             _validate_keys(["title", "simple_explanation", "analogy", "example",
                             "common_mistake", "check_question", "next_action"])),
        Task("diagnostic_generate", diag_prompt.DIAGNOSTIC_SYSTEM, diag_p, None,
             _validate_diagnostic),
        Task("capsule_generate", caps_system, caps_p, generation_schema(), _validate_capsule),
    ]


# ---------------------------------------------------------------------------
# T4 « curriculum » — connaissance factuelle du programme scolaire (BO).
#
# But (ADR-0009 §7) : mesurer la capacité des modèles à restituer le programme officiel
# français — capacité DISTINCTE de la richesse pédagogique (T1-T3). Départage local / cloud /
# hybride pour la génération de référentiel (addendum à figer sur l'ADR-0009).
#
# ⚠️ OUTIL DE MESURE JETABLE : le schéma ci-dessous n'est PAS le schéma de production (celui-là
# sera défini au Lot 1 de l'ADR-0009 dans `app/prompts/curriculum.py` + `app/modules/`). On ne
# touche donc rien sous `app/` ici ; ces prompts sont génériques et ne contiennent AUCUNE donnée
# de Massimo (niveau + matière ne sont pas des données personnelles → usage cloud yardstick OK).
# ---------------------------------------------------------------------------
class ChapterItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str
    themes: list[str]
    # None ou libellé libre (ex. « 4e » ou « indicatif ») — l'incertitude est une réponse valable.
    suggested_class: str | None = None


class CurriculumChapters(BaseModel):
    model_config = ConfigDict(extra="forbid")
    subject: str
    cycle: str
    program_version: str
    chapters: list[ChapterItem] = Field(min_length=3, max_length=15)


def _validate_curriculum(text: str) -> tuple[bool, str]:
    try:
        obj = CurriculumChapters.model_validate_json(text)
    except Exception as exc:  # ValidationError ou JSON invalide
        return False, f"CurriculumChapters invalide: {str(exc)[:140]}"
    return True, f"{len(obj.chapters)} chapitres (v{obj.program_version})"


# Consigne commune : JSON strict conforme au schéma, pas d'invention, ne pas mélanger les versions.
CURRICULUM_SYSTEM = (
    "Tu es un expert du programme scolaire officiel français (Bulletin officiel de l'Éducation "
    "nationale). Tu réponds UNIQUEMENT par un objet JSON valide, sans aucun texte ni balise de "
    "code autour, strictement conforme au schéma demandé (subject, cycle, program_version, et "
    "chapters[] avec title, themes, suggested_class). Règles : n'invente aucun intitulé ; si tu "
    "n'es pas certain de la répartition d'un chapitre par classe, écris-le explicitement dans "
    "suggested_class (ex. \"indicatif\") plutôt que d'affirmer une année ; ne mélange jamais des "
    "versions successives du programme (2016 / 2020 / 2026)."
)

# T4a — matière AVEC repères annuels officiels (maths cycle 4, répartition attendue).
CURRICULUM_PROMPT_MATH = (
    "Liste les chapitres de mathématiques du cycle 4 (programme officiel français, BO du "
    "30 juillet 2020), en indiquant pour chacun les thèmes couverts et la classe suggérée "
    "(5e / 4e / 3e) selon les repères annuels de progression de 2019. "
    "Renseigne subject=\"Mathématiques\", cycle=\"cycle 4\", program_version=\"2020\"."
)

# T4b — matière SANS repères annuels officiels (SVT cycle 4, cas dur : incertitude à signaler).
CURRICULUM_PROMPT_SVT = (
    "Liste les chapitres de SVT (sciences de la vie et de la Terre) du cycle 4 (programme "
    "officiel français, BO du 30 juillet 2020), en indiquant pour chacun les thèmes couverts. "
    "Il n'existe PAS de repères annuels officiels pour cette matière : signale explicitement que "
    "la répartition par classe est indicative (par ex. suggested_class=\"indicatif (pas de "
    "repères officiels)\") et n'affirme aucune répartition officielle 5e/4e/3e. "
    "Renseigne subject=\"SVT\", cycle=\"cycle 4\", program_version=\"2020\"."
)


def build_curriculum_tasks() -> list[Task]:
    """Tâches T4 : sortie structurée via `fmt` = JSON Schema du modèle jetable ci-dessus,
    comme les tâches existantes. Validation Pydantic → on compte les échecs (pas de réparation
    supplémentaire : le harnais `_unfence` normalise déjà les balises markdown éventuelles)."""
    fmt = CurriculumChapters.model_json_schema()
    return [
        Task("curriculum_math", CURRICULUM_SYSTEM, CURRICULUM_PROMPT_MATH, fmt, _validate_curriculum),
        Task("curriculum_svt", CURRICULUM_SYSTEM, CURRICULUM_PROMPT_SVT, fmt, _validate_curriculum),
    ]


# ---------------------------------------------------------------------------
# Appels moteurs (HTTP direct, compteurs de tokens natifs quand dispo).
# ---------------------------------------------------------------------------
@dataclass
class RunResult:
    ok: bool
    elapsed_s: float
    completion_tokens: int
    text: str
    detail: str = ""


def call_ollama(url: str, model: str, task: Task, timeout: float,
                no_think: bool = False) -> RunResult:
    payload: dict = {
        "model": model,
        "prompt": task.prompt,
        "system": task.system,
        "stream": False,
        "options": {"temperature": 0.2},
        "format": task.fmt if task.fmt is not None else "json",
    }
    # Modèles Qwen3 « thinking » : sans ceci, le JSON part dans le champ `thinking` et
    # `response` est vide → sortie invalide. `think:false` renvoie le JSON directement.
    if no_think:
        payload["think"] = False
    start = time.monotonic()
    r = httpx.post(f"{url.rstrip('/')}/api/generate", json=payload, timeout=timeout)
    r.raise_for_status()
    elapsed = time.monotonic() - start
    data = r.json()
    return RunResult(True, elapsed, int(data.get("eval_count", 0)), data.get("response", ""))


def call_mlx(url: str, model: str, task: Task, timeout: float) -> RunResult:
    messages = [{"role": "system", "content": task.system},
                {"role": "user", "content": task.prompt}]
    # max_tokens : mlx_lm.server plafonne à 512 par défaut → tronque la capsule (~600 tok).
    payload: dict = {"model": model, "messages": messages, "temperature": 0.2,
                     "max_tokens": 4096, "stream": False}
    if isinstance(task.fmt, dict):
        payload["response_format"] = {"type": "json_schema",
                                      "json_schema": {"name": "output", "schema": task.fmt}}
    else:
        payload["response_format"] = {"type": "json_object"}
    start = time.monotonic()
    r = httpx.post(f"{url.rstrip('/')}/v1/chat/completions", json=payload, timeout=timeout)
    r.raise_for_status()
    elapsed = time.monotonic() - start
    data = r.json()
    text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    toks = int(data.get("usage", {}).get("completion_tokens", 0))
    return RunResult(True, elapsed, toks, text)


def call_openai(url: str, model: str, task: Task, timeout: float, api_key: str | None) -> RunResult:
    """Réf. qualité cloud OpenAI (benchmark uniquement — jamais en prod ZETIS, cf. ADR-0008).

    Prompts génériques seulement (aucune donnée réelle de Massimo). `json_object` force du JSON
    valide ; la structure fine est portée par le prompt (comme pour ollama)."""
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY absente (export la clé pour la comparaison cloud)")
    messages = [{"role": "system", "content": task.system},
                {"role": "user", "content": task.prompt}]
    payload: dict = {"model": model, "messages": messages, "temperature": 0.2,
                     "max_tokens": 4096, "response_format": {"type": "json_object"}}
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    start = time.monotonic()
    r = httpx.post(f"{url.rstrip('/')}/v1/chat/completions", json=payload,
                   headers=headers, timeout=timeout)
    r.raise_for_status()
    elapsed = time.monotonic() - start
    data = r.json()
    text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
    toks = int(data.get("usage", {}).get("completion_tokens", 0))
    return RunResult(True, elapsed, toks, text)


def call_anthropic(url: str, model: str, task: Task, timeout: float, api_key: str | None) -> RunResult:
    """Réf. qualité cloud Anthropic/Claude (benchmark uniquement — jamais en prod ZETIS).

    Messages API : `system` séparé, pas de mode JSON natif → on s'appuie sur le prompt
    (« réponds UNIQUEMENT en JSON ») et on mesure le taux de validité."""
    if not api_key:
        raise RuntimeError("ANTHROPIC_API_KEY absente (export la clé pour la comparaison cloud)")
    # NB : `temperature` est déprécié sur les modèles Claude récents (Sonnet 5) → on ne l'envoie
    # pas (400 sinon). Défaut du modèle utilisé.
    payload: dict = {"model": model, "system": task.system, "max_tokens": 4096,
                     "messages": [{"role": "user", "content": task.prompt}]}
    headers = {"x-api-key": api_key, "anthropic-version": "2023-06-01",
               "content-type": "application/json"}
    start = time.monotonic()
    r = httpx.post(f"{url.rstrip('/')}/v1/messages", json=payload, headers=headers, timeout=timeout)
    r.raise_for_status()
    elapsed = time.monotonic() - start
    data = r.json()
    # Sonnet 5 a le raisonnement étendu activé : content[0] peut être un bloc `thinking`.
    # On concatène uniquement les blocs de type `text`.
    parts = data.get("content", [])
    text = "".join(b.get("text", "") for b in parts if b.get("type") == "text")
    toks = int(data.get("usage", {}).get("output_tokens", 0))
    return RunResult(True, elapsed, toks, text)


# ---------------------------------------------------------------------------
# Orchestration.
# ---------------------------------------------------------------------------
@dataclass
class Cell:
    engine: str
    model: str
    task: str
    latencies: list[float] = field(default_factory=list)
    toks_per_s: list[float] = field(default_factory=list)
    valid: int = 0
    total: int = 0
    error: str = ""
    sample: str = ""
    # Sortie de CHAQUE répétition (T4 en a besoin : le jugement Papa se fait run par run).
    samples: list[str] = field(default_factory=list)


def run_matrix(args, tasks: list[Task] | None = None) -> list[Cell]:
    if tasks is None:
        tasks = build_tasks()
    cells: list[Cell] = []
    engines: list[tuple[str, str, object]] = []
    oa_key = os.environ.get("OPENAI_API_KEY")
    an_key = os.environ.get("ANTHROPIC_API_KEY")
    for m in args.ollama_models:
        # Auto : désactive le raisonnement pour les modèles Qwen3 (sinon JSON vide).
        nt = "qwen3" in m.lower()
        engines.append(("ollama", m, lambda t, mm=m, n=nt: call_ollama(args.ollama_url, mm, t, args.timeout, no_think=n)))
    for m in args.mlx_models:
        engines.append(("mlx", m, lambda t, mm=m: call_mlx(args.mlx_url, mm, t, args.timeout)))
    # Cloud = référence qualité seulement ; si la clé manque, la cellule sera marquée en erreur.
    for m in args.openai_models:
        engines.append(("openai", m, lambda t, mm=m: call_openai(args.openai_url, mm, t, args.timeout, oa_key)))
    for m in args.anthropic_models:
        engines.append(("anthropic", m, lambda t, mm=m: call_anthropic(args.anthropic_url, mm, t, args.timeout, an_key)))

    for engine, model, fn in engines:
        for task in tasks:
            cell = Cell(engine=engine, model=model, task=task.name)
            for i in range(args.repeats):
                try:
                    res = fn(task)
                except Exception as exc:  # injoignable, timeout, 4xx/5xx
                    cell.error = f"{type(exc).__name__}: {str(exc)[:100]}"
                    break
                res.text = _unfence(res.text)  # normalise (retire balises markdown éventuelles)
                cell.total += 1
                cell.latencies.append(res.elapsed_s)
                if res.completion_tokens and res.elapsed_s > 0:
                    cell.toks_per_s.append(res.completion_tokens / res.elapsed_s)
                ok, detail = task.validate(res.text)
                cell.valid += int(ok)
                cell.samples.append(res.text)
                if i == 0:
                    cell.sample = res.text
                print(f"  [{engine}/{model}] {task.name} #{i+1}: "
                      f"{res.elapsed_s:.1f}s, {res.completion_tokens} tok, {detail}")
            cells.append(cell)
    return cells


def _unfence(text: str) -> str:
    """Retire un éventuel bloc markdown ```json … ``` autour du JSON (certains modèles, dont
    Claude, en ajoutent malgré la consigne). Appliqué uniformément à tous les providers."""
    t = text.strip()
    if t.startswith("```"):
        t = t.split("\n", 1)[1] if "\n" in t else ""
        if t.rstrip().endswith("```"):
            t = t.rstrip()[:-3]
    return t.strip()


def _fmt(nums: list[float]) -> str:
    if not nums:
        return "—"
    return f"{statistics.median(nums):.1f}"


def render_markdown(cells: list[Cell], args) -> str:
    lines = ["# Benchmark LLM ZETIS — local + réf. cloud (ADR-0008)", ""]
    lines.append(f"Répétitions par cellule : {args.repeats}. Métriques = médiane.")
    lines.append("")
    lines.append("| Moteur | Modèle | Tâche | Latence méd. (s) | tok/s méd. | JSON valide | Note |")
    lines.append("|---|---|---|---|---|---|---|")
    for c in cells:
        if c.error:
            lines.append(f"| {c.engine} | {c.model} | {c.task} | — | — | — | ⚠️ {c.error} |")
            continue
        rate = f"{c.valid}/{c.total}"
        lines.append(
            f"| {c.engine} | {c.model} | {c.task} | {_fmt(c.latencies)} "
            f"| {_fmt(c.toks_per_s)} | {rate} | |"
        )
    lines.append("")
    lines.append("## Échantillons de sortie (jugement qualité humain — Papa)")
    lines.append("")
    for c in cells:
        if c.error or not c.sample:
            continue
        lines.append(f"### {c.engine} / {c.model} / {c.task}")
        lines.append("```json")
        lines.append(c.sample.strip()[:2000])
        lines.append("```")
        lines.append("")
    return "\n".join(lines)


def _pretty_json(text: str) -> str:
    """Indente le JSON pour une lecture humaine ; renvoie le texte brut si non parsable."""
    try:
        return json.dumps(json.loads(text), indent=2, ensure_ascii=False)
    except Exception:
        return text.strip()


def _scoring_grid(n_runs: int) -> list[str]:
    """Grille de scorage VIDE à remplir par Papa (BO ouvert à côté), une ligne par run."""
    rows = [
        "| Run | Intitulés de thèmes conformes au BO (0-2) | Découpage / granularité plausible (0-2) "
        "| Classe correcte (T4a) / incertitude signalée (T4b) (0-2) | Sans invention ni mélange de "
        "versions (0-2) | Total /8 | Verdict |",
        "|---|---|---|---|---|---|---|",
    ]
    for i in range(1, n_runs + 1):
        rows.append(f"| #{i} |  |  |  |  |  |  |")
    return rows


def render_curriculum_markdown(cells: list[Cell], args) -> str:
    """Rapport T4 : tableau récap + sortie COMPLÈTE de chaque run + grille de scorage humain."""
    oa = bool(os.environ.get("OPENAI_API_KEY"))
    an = bool(os.environ.get("ANTHROPIC_API_KEY"))
    lines = ["# Benchmark T4 « curriculum » — connaissance du programme (ADR-0009 §7)", ""]
    lines.append(
        "Mesure la connaissance factuelle du programme scolaire français (BO) — capacité "
        "distincte de la richesse pédagogique (T1-T3). Sert à trancher le §7 de l'ADR-0009 "
        "(local / cloud / hybride) par un addendum."
    )
    lines.append("")
    lines.append(f"- Répétitions par cellule : **{args.repeats}**. Latence = médiane.")
    engines_ran = sorted({c.engine for c in cells})
    lines.append(f"- Moteurs exécutés : {', '.join(engines_ran) if engines_ran else '(aucun)'}.")
    if not oa and not an:
        lines.append(
            "- ⚠️ **Aucune clé cloud trouvée** (`.env` / `--env-file`) : seul le local a été exécuté. "
            "Le yardstick cloud (claude-sonnet-5 / gpt-4o) manque pour comparer."
        )
    else:
        lines.append(
            f"- Clés cloud (yardstick benchmark uniquement, jamais en prod) : "
            f"OpenAI {'présente' if oa else 'absente'}, Anthropic {'présente' if an else 'absente'}."
        )
    lines.append("")

    lines.append("## Récapitulatif (moteur, modèle, tâche)")
    lines.append("")
    lines.append("| Moteur | Modèle | Tâche | Latence méd. (s) | tok/s méd. | JSON valide |")
    lines.append("|---|---|---|---|---|---|")
    for c in cells:
        if c.error:
            lines.append(f"| {c.engine} | {c.model} | {c.task} | — | — | ⚠️ {c.error} |")
            continue
        lines.append(
            f"| {c.engine} | {c.model} | {c.task} | {_fmt(c.latencies)} "
            f"| {_fmt(c.toks_per_s)} | {c.valid}/{c.total} |"
        )
    lines.append("")
    lines.append(
        "> ⚠️ « JSON valide » mesure la CONFORMITÉ au schéma jetable (3-15 chapitres, `extra` "
        "interdit), pas la qualité du contenu. Un modèle peut échouer pour un motif de FORME — "
        "découpage plus fin que 15 chapitres, ou sortie tronquée au plafond `max_tokens` du "
        "harnais — sans que sa connaissance du BO soit en cause. Juger le contenu sur les sorties "
        "complètes ci-dessous, indépendamment de cette colonne."
    )
    lines.append("")

    lines.append("## Sorties complètes + grille de scorage (jugement humain — Papa, BO ouvert)")
    lines.append("")
    lines.append(
        "Barème par run : intitulés conformes au BO (0-2) · découpage plausible (0-2) · "
        "répartition par classe correcte / incertitude bien signalée (0-2) · sans invention ni "
        "mélange de versions (0-2). **Total /8** + verdict libre."
    )
    lines.append("")
    for c in cells:
        lines.append(f"### {c.engine} / {c.model} / {c.task}")
        if c.error:
            lines.append(f"> ⚠️ Injoignable / erreur : {c.error}")
            lines.append("")
            continue
        lines.extend(_scoring_grid(len(c.samples)))
        lines.append("")
        for i, sample in enumerate(c.samples, 1):
            lines.append(f"**Run #{i}**")
            lines.append("")
            lines.append("```json")
            lines.append(_pretty_json(sample))
            lines.append("```")
            lines.append("")
    return "\n".join(lines)


def load_env_file(path: Path) -> None:
    """Charge un fichier `.env` (KEY=VALUE) dans l'environnement, SANS écraser les variables
    déjà définies (un `export` shell reste prioritaire). Sert à fournir OPENAI_API_KEY /
    ANTHROPIC_API_KEY pour la comparaison cloud. Le fichier `.env` (racine) est git-ignoré :
    n'y committe JAMAIS de secret (cf. CLAUDE.md § sécurité)."""
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line.startswith("export "):
            line = line[len("export "):]
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, val = line.partition("=")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = val
    print(f"  (.env chargé : {path})")


def main() -> None:
    p = argparse.ArgumentParser(description="Benchmark Ollama vs MLX sur les prompts ZETIS.")
    p.add_argument("--ollama-url", default="http://localhost:11434")
    p.add_argument("--mlx-url", default="http://localhost:8080")
    p.add_argument("--openai-url", default="https://api.openai.com")
    p.add_argument("--anthropic-url", default="https://api.anthropic.com")
    # Défauts à None (sentinelle) → résolus plus bas selon le mode (défaut vs --curriculum).
    p.add_argument("--ollama-models", nargs="*", default=None)
    p.add_argument("--mlx-models", nargs="*", default=None)
    # Cloud = référence qualité (benchmark only) ; nécessite une clé API en env.
    p.add_argument("--openai-models", nargs="*", default=None)
    p.add_argument("--anthropic-models", nargs="*", default=None)
    p.add_argument("--repeats", type=int, default=None)
    p.add_argument("--timeout", type=float, default=300.0)
    p.add_argument("--out", default=None)
    # Tâches T4 « curriculum » (ADR-0009 §7) au lieu des tâches produit (T1-T3). En mode curriculum,
    # les défauts changent : local = qwen3.6:35b-a3b, cloud auto (si clé), --repeats 3, sortie dédiée.
    p.add_argument("--curriculum", action="store_true",
                   help="Lance la tâche T4 « curriculum » (programme scolaire) au lieu de T1-T3.")
    # Fichier .env (git-ignoré) d'où lire OPENAI_API_KEY / ANTHROPIC_API_KEY. Défaut = .env racine.
    p.add_argument("--env-file", default=str(REPO_ROOT / ".env"))
    args = p.parse_args()

    load_env_file(Path(args.env_file))  # AVANT de résoudre les défauts cloud (dépend des clés).
    has_oa = bool(os.environ.get("OPENAI_API_KEY"))
    has_an = bool(os.environ.get("ANTHROPIC_API_KEY"))

    if args.curriculum:
        # Cloud yardstick activé automatiquement UNIQUEMENT si la clé est présente (sinon local seul,
        # signalé dans le rapport — on ne bloque pas). Un --...-models explicite reste prioritaire.
        if args.ollama_models is None:
            args.ollama_models = ["qwen3.6:35b-a3b"]
        if args.mlx_models is None:
            args.mlx_models = []
        if args.openai_models is None:
            args.openai_models = ["gpt-4o"] if has_oa else []
        if args.anthropic_models is None:
            args.anthropic_models = ["claude-sonnet-5"] if has_an else []
        if args.repeats is None:
            args.repeats = 3
        if args.out is None:
            args.out = "scratchpad/bench_curriculum.md"
        tasks, renderer = build_curriculum_tasks(), render_curriculum_markdown
    else:
        # Comportement historique inchangé (T1-T3).
        if args.ollama_models is None:
            args.ollama_models = ["qwen2.5:14b", "qwen2.5:32b"]
        if args.mlx_models is None:
            args.mlx_models = ["mlx-community/Qwen2.5-32B-Instruct-4bit"]
        if args.openai_models is None:
            args.openai_models = []
        if args.anthropic_models is None:
            args.anthropic_models = []
        if args.repeats is None:
            args.repeats = 2
        if args.out is None:
            args.out = "scratchpad/bench_llm.md"
        tasks, renderer = build_tasks(), render_markdown

    print(f"Benchmark ZETIS — {'T4 curriculum' if args.curriculum else 'qualité T1-T3'} "
          "(local Ollama/MLX + réf. cloud OpenAI/Anthropic)")
    print(f"  Ollama    : {args.ollama_models}")
    print(f"  MLX       : {args.mlx_models}")
    print(f"  OpenAI    : {args.openai_models} (clé {'OK' if has_oa else 'absente'})")
    print(f"  Anthropic : {args.anthropic_models} (clé {'OK' if has_an else 'absente'})")
    cells = run_matrix(args, tasks)

    report = renderer(cells, args)
    out_path = Path(args.out)
    if not out_path.is_absolute():
        out_path = REPO_ROOT / out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(report, encoding="utf-8")
    print(f"\nRapport écrit : {out_path}")


if __name__ == "__main__":
    main()
