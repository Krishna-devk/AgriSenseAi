"""
Retriever: Builds farmer query → Passes full data.json to deepseek-v3.1:671b-cloud
→ model selects top schemes and synthesises answer → adds Google search URLs.
"""

from __future__ import annotations

import os
import textwrap
import io
import re
import base64
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus
from PIL import Image
from ollama import Client

import json

# Initialize an explicit Ollama client with a generous timeout (300 seconds)
# This is crucial for large models that may need time to load into VRAM/system memory.
ollama_client = Client(host='http://127.0.0.1:11434', timeout=300)

DATA_PATH = Path(__file__).parent.parent / "data.json"

def _load_data() -> Dict[str, Any]:
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def _ollama_chat_completion(model: str, messages: List[Dict[str, Any]], temperature: float = 0.3) -> str:
    """Helper to call Ollama chat completion using explicit client with timeout safety."""
    try:
        response = ollama_client.chat(
            model=model,
            messages=messages,
            options={'temperature': temperature}
        )
        return response['message']['content']
    except Exception as e:
        print(f"[Ollama] Error calling {model}: {e}")
        # If the primary high-parameter model fails, we don't return immediately but let the caller handle it.
        return ""


def build_query(
    crop_type: str,
    location: str,
    land_size_acres: float,
    disease_or_yield_status: str,
) -> str:
    size_desc = "small/marginal farmer (≤2 ha)" if land_size_acres <= 4.94 else "large farmer (>2 ha)"
    return (
        f"Farmer growing {crop_type} in {location}. "
        f"Land size: {land_size_acres} acres ({size_desc}). "
        f"Current crop status: {disease_or_yield_status}. "
        f"Needs government schemes support."
    )


def google_search_urls(
    scheme_names: List[str],
    crop_type: str,
    location: str,
    disease_or_yield_status: str,
) -> List[Dict[str, str]]:
    results = []
    for name in scheme_names[:3]:
        q = f"{name} application steps India"
        results.append({"label": f"Apply — {name}", "url": f"https://www.google.com/search?q={quote_plus(q)}"})
    return results


_schemes_cache: List[Dict[str, Any]] = []

def _ollama_match_and_summarize(farmer_query: str, all_schemes: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Passes schemes to LLM and gets summary in one go."""
    global _schemes_cache
    if not _schemes_cache:
        for s in all_schemes:
            _schemes_cache.append({
                "id": s["id"], "name": s["name"], "purpose": s.get("purpose", ""),
                "eligibility": s.get("eligibility", ""), "category": s.get("category", "")
            })

    schemes_json = json.dumps(_schemes_cache, indent=2)

    messages = [
        {"role": "system", "content": "You are a Senior Indian Agricultural Policy Advisor. Return TOP_SCHEME_IDS: [id1, id2, ...] and a SUMMARY_START ... SUMMARY_END guidance."},
        {"role": "user", "content": f"Farmer: {farmer_query}\n\nSchemes: {schemes_json}"}
    ]

    # Attempt primary model
    raw_response = _ollama_chat_completion("deepseek-v3.1:671b-cloud", messages)
    
    # Fallback if primary model fails
    if not raw_response:
        print("[Retriever] Primary model failed, trying deepseek-v3.2:cloud...")
        raw_response = _ollama_chat_completion("deepseek-v3.2:cloud", messages)

    if not raw_response:
        return {"summary": _rule_based_summary(farmer_query, all_schemes[:5]), "top_ids": [s["id"] for s in all_schemes[:5]]}

    try:
        id_match = re.search(r"TOP_SCHEME_IDS:\s*\[(.*?)\]", raw_response)
        summary_match = re.search(r"SUMMARY_START\n?(.*?)\n?SUMMARY_END", raw_response, re.DOTALL)
        top_ids = [int(i.strip()) for i in id_match.group(1).split(",") if i.strip()] if id_match else []
        summary = summary_match.group(1).strip() if summary_match else raw_response
        return {"summary": summary, "top_ids": top_ids}
    except:
        return {"summary": raw_response, "top_ids": [s["id"] for s in all_schemes[:5]]}


def calculate_pseudo_ndvi(image_bytes: bytes) -> Optional[float]:
    """Visible Atmospherically Resistant Index (VARI) calculation."""
    try:
        import numpy as np
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_np = np.array(img).astype(float)
        R, G = img_np[:, :, 0], img_np[:, :, 1]
        ndvi_map = (G - R) / (G + R + 1e-8)
        veg_pixels = ndvi_map[ndvi_map > 0.05]
        if len(veg_pixels) == 0: return 0.5
        mean_ndvi = float(np.mean(veg_pixels))
        return round(min(max((2.5 * mean_ndvi) + 0.375, 0.4), 1.2), 3)
    except: return None

def analyze_crop_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> Dict[str, Any]:
    """Vision analysis with robust client support and fallback."""
    try:
        ndvi_score = calculate_pseudo_ndvi(image_bytes)

        # Scale down for vision efficiency
        try:
            img = Image.open(io.BytesIO(image_bytes))
            if max(img.size) > 1024:
                img.thumbnail((1024, 1024))
                buf = io.BytesIO(); img.save(buf, format="JPEG"); image_bytes = buf.getvalue()
        except: pass

        # Step 1: Vision Model
        try:
            vision_resp = ollama_client.chat(
                model='qwen3-vl:235b-cloud',
                messages=[{'role': 'user', 'content': 'Analyze crop disease in detail.', 'images': [image_bytes]}]
            )
            ollama_analysis = vision_resp['message']['content']
        except Exception as e:
            print(f"[Vision] Vision model call failed: {e}")
            ollama_analysis = "Vision metadata capture failed. Proceeding with diagnostic inference."

        # Step 2: Refinement Models
        messages = [
            {"role": "system", "content": "You are a master agronomist. Refine input into structured diagnosis. If not a plant, respond NOT_A_PLANT."},
            {"role": "user", "content": f"Vision Input:\n{ollama_analysis}\n\nStrict Format:\n**Crop Name:** ...\n**Symptoms:** ...\n**Most Probable Disease:** ...\n**Recommendations:** ..."}
        ]
        
        reasoning_text = _ollama_chat_completion("deepseek-v3.1:671b-cloud", messages)
        
        # Fallback to a faster model if the heavy one hangs
        if not reasoning_text:
            print("[Vision] Primary refinement failed, trying deepseek-v3.2...")
            reasoning_text = _ollama_chat_completion("deepseek-v3.2:cloud", messages)

        if not reasoning_text:
            raise ValueError("Ollama refinement pipeline timed out or disconnected.")

        # Handle Non-Plant Detection
        if "NOT_A_PLANT" in reasoning_text.upper():
            return {
                "raw_analysis": "### 🤖 AgriSense AI Assistant\n\nI am your **AgriSense bot**! I've analyzed your photo, but it **doesn't appear to be a crop, plant, or leaf**. \n\nI am specialized in agricultural diagnosis. To help you better, please upload a clear, close-up photo of a crop or leaf. ✨",
                "identified_crop": "None",
                "visual_symptoms": "High confidence: Non-agricultural subject mater.",
                "most_probable_disease": "Non-Crop Image Detected",
                "identified_issues": [], "weather_causes": "N/A", "recommendations": "Provide a plant photo.",
                "confidence_description": "N/A", "ndvi_score": None
            }

        def extract_section(full_text, heading):
            pattern = rf"\*\*{heading}\*\*\s*(.*?)(?=\*\*|$)"
            match = re.search(pattern, full_text, re.DOTALL | re.IGNORECASE)
            return match.group(1).strip() if match else ""

        id_crop = extract_section(reasoning_text, "Crop Name:")
        v_symptoms = extract_section(reasoning_text, "Symptoms:")
        m_prob_disease = extract_section(reasoning_text, "Most Probable Disease:")
        recs = extract_section(reasoning_text, "Recommendations:")

        return {
            "raw_analysis": reasoning_text, "identified_crop": id_crop, "visual_symptoms": v_symptoms,
            "crop_health_probability": 0.5, "most_probable_disease": m_prob_disease,
            "identified_issues": [], "weather_causes": "N/A", "recommendations": recs,
            "confidence_description": "High" if m_prob_disease else "Low", "ndvi_score": ndvi_score
        }

    except Exception as e:
        print(f"[Vision Pipeline Error]: {e}")
        return {
            "raw_analysis": f"❌ **AgriSense Bot Alert**: I am currently experiencing a connection issue with my brain (Ollama). \n\n**Error details:** {str(e)} \n\nPlease ensure Ollama is running at 11434 and the deepseek-v3.1:671b-cloud model is available.",
            "identified_issues": [], "confidence_description": "Error", "ndvi_score": None
        }


def generate_treatment_plan(crop_type: str, disease_info: str) -> Optional[str]:
    """Generates a personalized recovery schedule using explicit client."""
    messages = [
        {"role": "system", "content": "You are a Senior Plant Pathologist. Generate a professional crop recovery prescription."},
        {"role": "user", "content": f"Crop: {crop_type}\nStatus: {disease_info}"}
    ]
    # Use v3.2 for faster treatment planning if v3.1 is busy
    result = _ollama_chat_completion("deepseek-v3.2:cloud", messages)
    if not result:
        result = _ollama_chat_completion("deepseek-v3.1:671b-cloud", messages)
    return result if result else None

def _rule_based_summary(farmer_query: str, schemes: List[Dict[str, Any]]) -> str:
    lines = ["## 🌱 Agricultural Support & Schemes\n"]
    for rank, s in enumerate(schemes, 1):
        lines.append(f"\n### {rank}. {s['name']}\n**Purpose:** {s.get('purpose')}")
    return "\n".join(lines)

def match_schemes(crop_type: str, location: str, land_size_acres: float, disease_or_yield_status: str, top_k: int = 5) -> Dict[str, Any]:
    query = build_query(crop_type, location, land_size_acres, disease_or_yield_status)
    data = _load_data()
    all_schemes = data.get("schemes", [])
    analysis = _ollama_match_and_summarize(query, all_schemes)
    
    top_ids = analysis["top_ids"]
    matched_schemes = []
    id_map = {s["id"]: s for s in all_schemes}
    for i, sid in enumerate(top_ids[:top_k]):
        if sid in id_map:
            s = dict(id_map[sid])
            s["_score"] = 1.0 - (i * 0.05)
            matched_schemes.append(s)
    if not matched_schemes: matched_schemes = all_schemes[:top_k]

    scheme_names = [s["name"] for s in matched_schemes]
    treatment_plan = generate_treatment_plan(crop_type, disease_or_yield_status)
    
    return {
        "farmer_profile": {"crop_type": crop_type, "location": location, "land_size_acres": land_size_acres, "disease_or_yield_status": disease_or_yield_status},
        "matched_schemes": matched_schemes, "ai_summary": analysis["summary"], "treatment_plan": treatment_plan,
        "google_search_results": google_search_urls(scheme_names, crop_type, location, disease_or_yield_status),
    }

def ask_ai_question(message: str, context: Optional[str] = None) -> Dict[str, Any]:
    """Answers general farming questions with timeout safety."""
    messages = [
        {"role": "system", "content": "You are 'Krishi Sahayak' (Farmer Assistant). Answer ONLY agricultural scheme/MSP questions."},
        {"role": "user", "content": f"Context: {context}\n\nQuestion: {message}" if context else message}
    ]
    try:
        text = _ollama_chat_completion("deepseek-v3.2:cloud", messages)
        if not text: text = _ollama_chat_completion("deepseek-v3.1:671b-cloud", messages)
        if not text: raise ValueError("AI engines unavailable.")
        return {"response": text, "suggested_actions": ["Check official portal"]}
    except Exception as e:
        return {"response": f"Error: {str(e)}", "suggested_actions": []}
