"""
Retriever: Builds farmer query → retrieves top schemes via Gemini embeddings
→ synthesises answer with Gemini 1.5 Flash → adds Google search URLs.
"""

from __future__ import annotations

import os
import textwrap
import io
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import quote_plus
from PIL import Image
import base64
import ollama

from rag.embedder import retrieve


# ── API key helper (shared with embedder) ─────────────────────────────────────
def _get_api_key() -> str:
    key = os.environ.get("GEMINI_API_KEY", "")
    if not key:
        env_path = Path(__file__).parent.parent / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("GEMINI_API_KEY"):
                    key = line.split("=", 1)[-1].strip().strip('"').strip("'")
                    os.environ["GEMINI_API_KEY"] = key
                    break
    return key


# ── Gemini generative client ─────────────────────────────────────────────────
def _get_gemini_client():
    """Return an authenticated google-genai Client, or None if no key."""
    try:
        from google import genai  # type: ignore

        api_key = _get_api_key()
        if not api_key:
            return None
        return genai.Client(api_key=api_key)
    except ImportError:
        return None


# ── Query builder ─────────────────────────────────────────────────────────────
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
        f"Needs government schemes for insurance, financial aid, "
        f"input subsidies, mechanisation, irrigation, and disease/yield support."
    )


# ── Google search URL builder ─────────────────────────────────────────────────
def google_search_urls(
    scheme_names: List[str],
    crop_type: str,
    location: str,
    disease_or_yield_status: str,
) -> List[Dict[str, str]]:
    results = []

    for name in scheme_names[:3]:
        q = f"{name} how to apply online India 2025"
        results.append({"label": f"Apply — {name}", "url": f"https://www.google.com/search?q={quote_plus(q)}"})

    extra = [
        f"{crop_type} crop disease {disease_or_yield_status} government scheme India",
        f"farm subsidy {location} India 2025",
        f"{crop_type} PM Fasal Bima crop insurance apply",
        "PM-KISAN eligibility apply online India",
        f"Kisan Credit Card {crop_type} {location}",
    ]
    for q in extra:
        results.append({"label": q, "url": f"https://www.google.com/search?q={quote_plus(q)}"})

    return results


# ── LLM synthesis ─────────────────────────────────────────────────────────────
def _gemini_summary(farmer_query: str, schemes: List[Dict[str, Any]]) -> str:
    client = _get_gemini_client()
    if client is None:
        print("[Retriever] No Gemini API key or package. Using rule-based summary.")
        return _rule_based_summary(farmer_query, schemes)

    context_blocks = []
    for i, s in enumerate(schemes, 1):
        docs = "\n    - ".join(s.get("documents_required", []))
        links = "\n    - ".join(s.get("where_to_apply_links", []))
        context_blocks.append(
            f"--- Scheme {i}: {s['name']} ---\n"
            f"Category: {s.get('category', '')}\n"
            f"Purpose: {s.get('purpose', '')}\n"
            f"Eligibility: {s.get('eligibility', '')}\n"
            f"How to Apply: {s.get('application_process', '')}\n"
            f"Documents Needed:\n    - {docs}\n"
            f"Mandatory Requirements: {s.get('mandatory_requirements', '')}\n"
            f"Coverage / Risks Addressed: {s.get('coverage_risks', '')}\n"
            f"Official Links:\n    - {links}\n"
        )
    context = "\n".join(context_blocks)

    prompt = textwrap.dedent(f"""
        You are an expert Indian agricultural policy advisor helping a farmer.

        Farmer's Profile:
        {farmer_query}

        The following government schemes have been retrieved as the best matches
        for this farmer using semantic search over the official scheme database.

        {context}

        Your task:
        1. Rank the schemes from most relevant to least relevant for THIS farmer, with a clear reason.
        2. For the top 3 schemes, provide step-by-step application instructions tailored to the farmer's situation.
        3. List exact documents they need to collect.
        4. Flag any eligibility risks or conditions this farmer must watch out for.
        5. Give an actionable final recommendation in 2-3 sentences.

        Use clear markdown headings, numbered lists, and bold key terms.
        Be specific to the farmer's crop, location, land size, and disease/yield status.
    """).strip()

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        return response.text if response.text else _rule_based_summary(farmer_query, schemes)
    except Exception as e:
        print(f"[Retriever] Gemini generation error: {e}. Falling back to rule-based.")
        return _rule_based_summary(farmer_query, schemes)


def generate_treatment_plan(crop_type: str, disease_info: str) -> Optional[str]:
    """Generates a personalized recovery schedule (prescription) for a crop disease."""
    if "disease" not in disease_info.lower() and "detected" not in disease_info.lower() and "expected" not in disease_info.lower():
        # If no specific disease is mentioned, we might not need a treatment plan
        # But we'll still check if any disease name is present
        pass

    client = _get_gemini_client()
    if client is None:
        return None

    prompt = textwrap.dedent(f"""
        You are an expert Plant Pathologist and Agricultural Scientist.
        A farmer has reported the following crop health issue:
        - Crop: {crop_type}
        - Situation: {disease_info}

        Please generate a personalized 'Recovery Schedule' (Prescription) for this crop.
        Your plan should be specific, actionable, and science-backed.

        Include:
        1. Identification: Confirm the likely disease/issue based on the situation.
        2. Recovery Schedule: A day-by-day (or phase-by-phase) plan (e.g., Day 1, Day 3, Day 7).
        3. Actions: Specific tasks (e.g., 'Apply [generic chemical or organic fix]', 'Prune infected parts', 'Adjust irrigation').
        4. Safety: Any precautions or things to avoid.

        Format: Use markdown with a clear title "🌱 AI-Generated Recovery Schedule & Prescription".
    """).strip()

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        return response.text
    except Exception as e:
        print(f"[TreatmentPlan] Gemini generation error: {e}")
        return None


def calculate_pseudo_ndvi(image_bytes: bytes) -> Optional[float]:
    """Calculates a Visible Atmospherically Resistant Index (VARI) or pseudo-NDVI from Green and Red channels."""
    try:
        import numpy as np
        import io
        from PIL import Image
        
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        img_np = np.array(img).astype(float)
        
        R = img_np[:, :, 0]
        G = img_np[:, :, 1]
        
        # Pseudo-NDVI (using Green as proxy for NIR)
        ndvi_map = (G - R) / (G + R + 1e-8)
        
        # Consider only pixels with some green dominance
        veg_pixels = ndvi_map[ndvi_map > 0.05]
        
        if len(veg_pixels) == 0:
            return 0.5
            
        mean_ndvi = float(np.mean(veg_pixels))
        
        # Map raw pseudo-NDVI (~0.05 to ~0.3) to a reasonable yield multiplier (0.5 to 1.0)
        # y = mx + c. Let 0.05 map to 0.5, 0.25 map to 1.0
        mapped_score = (2.5 * mean_ndvi) + 0.375
        
        return round(min(max(mapped_score, 0.4), 1.2), 3)
    except Exception as e:
        print(f"[calculate_pseudo_ndvi] Error: {e}")
        return None

def analyze_crop_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> Dict[str, Any]:
    """Uses Gemini vision model to describe crop issues and suggest treatments."""
    try:
        ndvi_score = calculate_pseudo_ndvi(image_bytes)

        # 1. Image Processing (Pillow validation and resizing)
        try:
            img = Image.open(io.BytesIO(image_bytes))
            max_size = 1024
            if max(img.size) > max_size:
                img.thumbnail((max_size, max_size))
                buffer = io.BytesIO()
                img.save(buffer, format=img.format or "JPEG")
                image_bytes = buffer.getvalue()
        except Exception as img_err:
            print(f"[Vision] Pillow could not open image: {img_err}")
            return {
                "raw_analysis": "The uploaded file is not a valid image or is corrupted.",
                "identified_issues": [],
                "confidence_description": "Error",
                "ndvi_score": None
            }

        client = _get_gemini_client()
        if not client:
            return {
                "raw_analysis": "Gemini client is not configured. Please check your GEMINI_API_KEY environment variable.",
                "identified_issues": [],
                "confidence_description": "Error",
                "ndvi_score": ndvi_score
            }

        prompt = """Act as an expert plant pathologist and agronomist. Look carefully at this image. 
        First, determine if this is an image of a plant, crop, or leaf. 
        If it is NOT a plant, crop, or leaf, simply respond with 'NOT_A_PLANT'. 

        If it IS a plant, strictly provide your analysis using the following headings:
        **Crop Name:** [Name of the plant/crop detected]
        **Symptoms:** [Describe the visual symptoms: color, spots, shape of damage]
        **Crop Health Probability:** [Provide a score between 0.3 and 1.0 based on these rules: 
           - 0.90-1.0: Healthy signs, vibrant colors, no disease.
           - 0.30-0.40: Severe disease, wilting, or pest damage.
           - Scale proportionally for moderate/mixed conditions.]
        **Most Probable Disease:** [Provide the name of the single most likely disease, or 'None' if healthy]
        **Suggested Diseases:** [Provide 1 to 3 other likely diseases. Put each on a new line with a bullet point]
        **Weather Causes:** [Explain what weather conditions usually trigger this issue]
        **Recommendations:** [Give 2-3 actionable, simple steps for the farmer]"""

        from google.genai import types # type: ignore
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt, types.Part.from_bytes(data=image_bytes, mime_type=mime_type)]
        )
        reasoning_text = response.text

        if "NOT_A_PLANT" in reasoning_text.upper():
            return {
                "raw_analysis": "I am specialized in agricultural diagnosis. This image does not appear to be a plant, crop, or leaf. Please upload a clear photo of your crop to get a diagnosis.",
                "identified_crop": "None",
                "visual_symptoms": "N/A - Image is not a plant.",
                "most_probable_disease": "None",
                "identified_issues": [],
                "weather_causes": "N/A",
                "recommendations": "Please provide a plant photo.",
                "confidence_description": "Low",
                "ndvi_score": None
            }

        def extract_section(full_text, heading):
            import re
            pattern = rf"\*\*{heading}\*\*\s*(.*?)(?=\*\*|$)"
            match = re.search(pattern, full_text, re.DOTALL | re.IGNORECASE)
            return match.group(1).strip() if match else ""

        identified_crop = extract_section(reasoning_text, "Crop Name:")
        visual_symptoms = extract_section(reasoning_text, "Symptoms:")
        crop_health_raw = extract_section(reasoning_text, "Crop Health Probability:")
        most_probable_disease = extract_section(reasoning_text, "Most Probable Disease:")
        suggested_diseases_raw = extract_section(reasoning_text, "Suggested Diseases:")
        weather_causes = extract_section(reasoning_text, "Weather Causes:")
        recommendations = extract_section(reasoning_text, "Recommendations:")

        import re
        crop_health_probability = 0.3
        try:
            prob_match = re.search(r"(\d+\.\d+)", crop_health_raw)
            if prob_match:
                crop_health_probability = float(prob_match.group(1))
        except:
            pass

        identified_issues = []
        if suggested_diseases_raw:
            lines = suggested_diseases_raw.split('\n')
            for line in lines:
                cleaned_line = re.sub(r'^[\*\-\d\.]+\s*', '', line).strip()
                if cleaned_line:
                    identified_issues.append(cleaned_line)

        return {
            "raw_analysis": reasoning_text,
            "identified_crop": identified_crop,
            "visual_symptoms": visual_symptoms,
            "crop_health_probability": crop_health_probability,
            "most_probable_disease": most_probable_disease,
            "identified_issues": identified_issues,
            "weather_causes": weather_causes,
            "recommendations": recommendations,
            "confidence_description": "High" if most_probable_disease else "Low",
            "ndvi_score": ndvi_score
        }

    except Exception as e:
        print(f"[Vision/Reasoning] Pipeline error: {e}")
        return {
            "raw_analysis": f"Error in analysis pipeline: {str(e)}",
            "identified_issues": [],
            "confidence_description": "Error",
            "ndvi_score": None
        }


def _rule_based_summary(farmer_query: str, schemes: List[Dict[str, Any]]) -> str:
    lines = [
        "## Matched Government Schemes\n",
        f"**Your Profile:** {farmer_query}\n",
        "---",
    ]
    for rank, s in enumerate(schemes, 1):
        lines.append(f"\n### {rank}. {s['name']}")
        lines.append(f"**Category:** {s.get('category', 'N/A')}")
        lines.append(f"**Purpose:** {s.get('purpose', 'N/A')}")
        lines.append(f"**Eligibility:** {s.get('eligibility', 'N/A')}")
        lines.append(f"\n**How to Apply:**\n{s.get('application_process', 'N/A')}")
        docs = s.get("documents_required", [])
        if docs:
            lines.append("\n**Documents Required:**")
            for d in docs:
                lines.append(f"  - {d}")
        links = s.get("where_to_apply_links", [])
        if links:
            lines.append("\n**Official Links:**")
            for lnk in links:
                lines.append(f"  - {lnk}")
        lines.append(f"\n**Coverage/Risks Addressed:** {s.get('coverage_risks', 'N/A')}")
        lines.append(f"**Mandatory Requirements:** {s.get('mandatory_requirements', 'N/A')}")
        lines.append("\n---")
    return "\n".join(lines)


# ── Public entry point ────────────────────────────────────────────────────────
def match_schemes(
    crop_type: str,
    location: str,
    land_size_acres: float,
    disease_or_yield_status: str,
    top_k: int = 5,
) -> Dict[str, Any]:
    query = build_query(crop_type, location, land_size_acres, disease_or_yield_status)
    schemes = retrieve(query, top_k=top_k)
    scheme_names = [s["name"] for s in schemes]

    summary = _gemini_summary(query, schemes)
    treatment_plan = generate_treatment_plan(crop_type, disease_or_yield_status)
    google_links = google_search_urls(scheme_names, crop_type, location, disease_or_yield_status)

    return {
        "farmer_profile": {
            "crop_type": crop_type,
            "location": location,
            "land_size_acres": land_size_acres,
            "disease_or_yield_status": disease_or_yield_status,
        },
        "query_used": query,
        "matched_schemes": [
            {
                "rank": i + 1,
                "id": s["id"],
                "name": s["name"],
                "category": s.get("category"),
                "purpose": s.get("purpose"),
                "eligibility": s.get("eligibility"),
                "application_process": s.get("application_process"),
                "documents_required": s.get("documents_required", []),
                "coverage_risks": s.get("coverage_risks"),
                "mandatory_requirements": s.get("mandatory_requirements"),
                "where_to_apply_links": s.get("where_to_apply_links", []),
                "relevance_score": round(s.get("_score", 0), 4),
            }
            for i, s in enumerate(schemes)
        ],
        "ai_summary": summary,
        "treatment_plan": treatment_plan,
        "google_search_results": google_links,
    }


def ask_ai_question(message: str, context: Optional[str] = None) -> Dict[str, Any]:
    """Answers general-purpose farming questions using a specialized system prompt."""
    client = _get_gemini_client()
    if client is None:
        return {
            "response": "Gemini AI is not configured. Please check your API key.",
            "suggested_actions": ["Contact Support", "Check Environment Variables"],
        }

    system_instruction = textwrap.dedent("""
        You are 'Krishi Sahayak' (Farmer Assistant), a highly specialized AI consultant for Indian agriculture.
        Your sole purpose is to assist farmers, FPOs, and agri-entrepreneurs with accurate information on:
        1. Government Schemes (Central & State level e.g., PM-KISAN, PMFBY, KCC, NAM).
        2. Minimum Support Price (MSP) for various crops and historical trends.
        3. Subsidies (Machinery, Seeds, Fertilizers, Irrigation).
        4. Crop Insurance and Disaster Compensation.
        5. Post-harvest management and Mandi related information.

        Strict Constraints:
        - ONLY answer questions related to the topics above. If a user asks about anything else (e.g., entertainment, general history, programming, non-agri health), politely decline by saying: "I am specialized only in Indian agricultural schemes, MSP, and farming support. I cannot help with that topic."
        - Use simple, clear language. If the question mentions a specific state or crop, tailor your answer accordingly.
        - provide actionable steps (e.g., 'Visit the nearest CSC', 'Apply on the PMFBY portal').
        - Always mention that the farmer should verify the latest details from official government websites.
        - Be empathetic and supportive.

        Response Format:
        - Use clear headings and bullet points.
        - Keep it concise but comprehensive.
    """).strip()

    full_query = message
    if context:
        full_query = f"Context: {context}\n\nQuestion: {message}"

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            config={
                "system_instruction": system_instruction,
            },
            contents=full_query,
        )
        # Extract suggested actions (simple rule-based extraction from the AI response or fixed ones)
        # For now, we'll try to find common keywords for suggested actions
        text = response.text
        suggested = ["Check official portal", "Visit local Agriculture Office"]
        if "PM-KISAN" in text:
            suggested.append("Register on PM-KISAN Portal")
        if "MSP" in text:
            suggested.append("Check nearest Mandi rates")

        return {
            "response": text,
            "suggested_actions": list(set(suggested)),
        }
    except Exception as e:
        print(f"[Chat] Gemini generation error: {e}")
        return {
            "response": f"Sorry, I encountered an error while processing your request: {str(e)}",
            "suggested_actions": ["Try again later"],
        }

