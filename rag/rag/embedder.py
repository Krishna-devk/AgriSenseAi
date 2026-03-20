"""
Embedder: Uses Gemini text-embedding-004 to embed all schemes at startup,
then does cosine similarity search at query time.
Falls back to TF-IDF if the API key is missing.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Any, Dict, List

import numpy as np

DATA_PATH = Path(__file__).parent.parent / "data.json"

_schemes: List[Dict[str, Any]] = []
_scheme_texts: List[str] = []
_embeddings: np.ndarray | None = None

# ── Load API key ─────────────────────────────────────────────────────────────
def _get_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        # Try loading from .env manually
        env_path = Path(__file__).parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("GEMINI_API_KEY"):
                    key = line.split("=", 1)[-1].strip().strip('"').strip("'")
                    os.environ["GEMINI_API_KEY"] = key
                    break
    return key


# ── Build google-genai client ─────────────────────────────────────────────────
def _get_client():
    """Return an authenticated google-genai Client, or None if no key."""
    from google import genai  # type: ignore

    api_key = _get_api_key()
    if not api_key:
        return None
    return genai.Client(api_key=api_key)


# ── Gemini embedding call ─────────────────────────────────────────────────────
def _gemini_embed_batch(texts: List[str], task_type: str = "RETRIEVAL_DOCUMENT") -> np.ndarray:
    """Call Gemini Embedding API for a list of texts. Returns an (N, D) float32 array."""
    from google.genai import types  # type: ignore

    client = _get_client()
    if client is None:
        raise ValueError("GEMINI_API_KEY is not set. Please add it to your .env file.")

    vectors = []
    BATCH = 50
    for i in range(0, len(texts), BATCH):
        batch = texts[i : i + BATCH]
        response = client.models.embed_content(
            model="gemini-embedding-001",
            contents=batch,
            config=types.EmbedContentConfig(task_type=task_type),
        )
        for emb in response.embeddings:
            vectors.append(emb.values)
        if i + BATCH < len(texts):
            time.sleep(0.3)  # gentle rate-limit buffer

    arr = np.array(vectors, dtype=np.float32)
    # L2-normalise
    norms = np.linalg.norm(arr, axis=1, keepdims=True) + 1e-10
    return arr / norms


def _gemini_embed_query(text: str) -> np.ndarray:
    from google.genai import types  # type: ignore

    client = _get_client()
    if client is None:
        raise ValueError("GEMINI_API_KEY is not set.")

    response = client.models.embed_content(
        model="gemini-embedding-001",
        contents=text,
        config=types.EmbedContentConfig(task_type="RETRIEVAL_QUERY"),
    )
    vec = np.array(response.embeddings[0].values, dtype=np.float32)
    norm = np.linalg.norm(vec) + 1e-10
    return vec / norm


# ── TF-IDF fallback ───────────────────────────────────────────────────────────
_tfidf_matrix: np.ndarray | None = None
_tfidf_vocab: Dict[str, int] = {}


def _build_tfidf_matrix(texts: List[str]):
    from math import log

    tokenised = [t.lower().split() for t in texts]
    df: Dict[str, int] = {}
    for tokens in tokenised:
        for tok in set(tokens):
            df[tok] = df.get(tok, 0) + 1

    N = len(texts)
    vocab = list(df.keys())
    vocab_idx = {w: i for i, w in enumerate(vocab)}

    matrix = np.zeros((N, len(vocab)), dtype=np.float32)
    for doc_i, words in enumerate(tokenised):
        tf: Dict[str, float] = {}
        for w in words:
            tf[w] = tf.get(w, 0) + 1
        for w, cnt in tf.items():
            if w in vocab_idx:
                idf = log(N / (df[w] + 1)) + 1
                matrix[doc_i, vocab_idx[w]] = (cnt / len(words)) * idf

    norms = np.linalg.norm(matrix, axis=1, keepdims=True) + 1e-10
    return matrix / norms, vocab_idx


def _tfidf_query_vec(query: str) -> np.ndarray:
    words = query.lower().split()
    vec = np.zeros(len(_tfidf_vocab), dtype=np.float32)
    for w in words:
        if w in _tfidf_vocab:
            vec[_tfidf_vocab[w]] += 1.0
    norm = np.linalg.norm(vec) + 1e-10
    return vec / norm


# ── Scheme text builder ───────────────────────────────────────────────────────
def _build_scheme_text(scheme: Dict[str, Any]) -> str:
    docs = ", ".join(scheme.get("documents_required", []))
    links = ", ".join(scheme.get("where_to_apply_links", []))
    return (
        f"Scheme: {scheme['name']}. "
        f"Category: {scheme.get('category', '')}. "
        f"Purpose: {scheme.get('purpose', '')}. "
        f"Eligibility: {scheme.get('eligibility', '')}. "
        f"Coverage/Risks: {scheme.get('coverage_risks', '')}. "
        f"Mandatory Requirements: {scheme.get('mandatory_requirements', '')}. "
        f"Documents: {docs}. Apply at: {links}."
    )


# ── Indexed flag ──────────────────────────────────────────────────────────────
_use_gemini = False


def initialise():
    global _schemes, _scheme_texts, _embeddings, _tfidf_matrix, _tfidf_vocab, _use_gemini

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    _schemes = data["schemes"]
    _scheme_texts = [_build_scheme_text(s) for s in _schemes]

    api_key = _get_api_key()

    if api_key:
        try:
            print(f"[Embedder] Using Gemini text-embedding-004 to embed {len(_schemes)} schemes...")
            _embeddings = _gemini_embed_batch(_scheme_texts)
            _use_gemini = True
            print("[Embedder] Gemini embeddings ready ✓")
        except Exception as e:
            print(f"[Embedder] Gemini embedding failed ({e}). Falling back to TF-IDF.")
            _tfidf_matrix, _tfidf_vocab = _build_tfidf_matrix(_scheme_texts)
    else:
        print("[Embedder] No GEMINI_API_KEY found. Using TF-IDF fallback.")
        _tfidf_matrix, _tfidf_vocab = _build_tfidf_matrix(_scheme_texts)


def retrieve(query: str, top_k: int = 5) -> List[Dict[str, Any]]:
    if not _schemes:
        initialise()

    if _use_gemini and _embeddings is not None:
        query_vec = _gemini_embed_query(query)
        scores = _embeddings @ query_vec
    elif _tfidf_matrix is not None:
        query_vec = _tfidf_query_vec(query)
        scores = _tfidf_matrix @ query_vec
    else:
        raise RuntimeError("Embedder not initialised. Call initialise() first.")

    top_indices = np.argsort(scores)[::-1][:top_k]
    results = []
    for idx in top_indices:
        scheme = dict(_schemes[idx])
        scheme["_score"] = float(scores[idx])
        results.append(scheme)
    return results
