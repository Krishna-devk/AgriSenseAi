# 🌾 AgriSense AI (Krishi Sahayak)

Krishi Sahayak is a comprehensive digital platform designed to empower farmers with AI-driven insights. It blends traditional agricultural knowledge with cutting-edge AI models like **Ollama**, **DeepSeek**, and **Qwen-VL** to deliver intelligent, real-time assistance.

---

## 🚀 Project Structure

The project is divided into two main components:

- **`frontend/`**: A modern React frontend built with Vite, React Router, and Recharts for a seamless user experience.
- **`backend/`**: A robust FastAPI backend that leverages LLMs (Gemini, DeepSeek, Qwen) for RAG-based matching, disease analysis, and yield prediction.

---

## 🛠️ Features

- 🌱 **Government Scheme Matchmaking**  
  Matches farmers to relevant government schemes based on their profile, location, and land size using AI-powered retrieval.

- 🍃 **Crop Disease Detection**  
  Analyze leaf images using multimodal AI (**Qwen3-VL**) to detect diseases and recommend treatments.

- 📊 **Yield Prediction**  
  Predict crop yields using climate, soil, fertilizer data, and NDVI indices with ML models.

- 🤖 **AI Chat Assistant**  
  RAG-powered assistant using **DeepSeek-V3.1** and **Gemini**, capable of answering farming queries, MSP info, and subsidy details.

- 🌦️ **Market & Weather Insights**  
  Real-time weather updates and mandi prices for informed decision-making.

---

## 🧠 AI Stack

This project integrates multiple AI systems for different tasks:

### 🔹 Ollama (Local LLM Orchestration)
- Used for running lightweight/local models for offline or low-latency inference.
- Acts as a fallback or edge AI system when cloud models are unavailable.

### 🔹 DeepSeek-V3.1 (671B Cloud)
- Primary LLM for:
  - RAG-based question answering
  - Government scheme matchmaking
  - Chat assistant reasoning
- Strong reasoning and multilingual capabilities for Indian agricultural contexts.

### 🔹 Qwen3-VL (235B Cloud)
- Multimodal model used for:
  - Crop disease detection from leaf images
  - Visual analysis + text reasoning
- Enables image + text understanding in a single pipeline.

### 🔹 Gemini AI
- Used for:
  - Supplementary reasoning
  - Backup inference
  - API-based integrations

---

## ⚙️ Backend Setup (rag)

1. **Navigate to the directory**:
   ```bash
   cd backend
   ```

2. **Set up virtual environment**:

   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

3. **Install dependencies**:

   ```bash
   pip install -r requirements.txt
   ```

4. **Environment Variables**:
   Create a `.env` file in the backend directory:

   ```env
   # Gemini
   GOOGLE_API_KEY=your_gemini_api_key

   # DeepSeek (Cloud)
   DEEPSEEK_API_KEY=your_deepseek_api_key

   # Qwen (Cloud)
   QWEN_API_KEY=your_qwen_api_key

   # Optional: Ollama (Local)
   OLLAMA_BASE_URL=http://localhost:11434
   ```

5. **Run Ollama (Optional but Recommended)**:

   ```bash
   ollama serve
   ```

   Pull a model:

   ```bash
   ollama pull llama3
   ```

6. **Run the FastAPI server**:

   ```bash
   python main.py
   ```

   API runs at:

   ```
   http://localhost:8000
   ```

---

## 💻 Frontend Setup (crop_ui)

1. **Navigate to the directory**:

   ```bash
   cd crop_ui
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Run the development server**:

   ```bash
   npm run dev
   ```

Frontend runs at:

```
http://localhost:5173
```

---

## 🔗 AI Workflow Architecture

```text
User Input
   ↓
Frontend (React UI)
   ↓
FastAPI Backend
   ↓
┌───────────────────────────────┐
│   Model Routing Layer         │
├───────────────────────────────┤
│ DeepSeek → Text + RAG         │
│ Qwen-VL → Image Analysis      │
│ Gemini → Backup / Hybrid      │
│ Ollama → Local fallback       │
└───────────────────────────────┘
   ↓
Vector DB (FAISS / Chroma)
   ↓
Response to User
```

---

## 🧰 Tech Stack

### Frontend

* React 19
* Vite
* React Router
* Axios
* Recharts
* Lucide Icons
* Vanilla CSS

### Backend

* FastAPI
* LangChain (RAG pipelines)
* FAISS / ChromaDB (vector storage)
* Scikit-learn (ML models)
* Ollama (local inference)
* DeepSeek API (LLM reasoning)
* Qwen-VL API (multimodal AI)
* Gemini API

---

## 🚀 Deployment

* Docker (recommended for full-stack deployment)
* VPS / Cloud (AWS, GCP, Azure)
* Ollama can be deployed on edge devices for rural/offline use

---

## 🌍 Vision

AgriSense AI aims to bridge the gap between farmers and intelligent technology by delivering:

* Accessible AI tools in rural regions
* Multilingual agricultural support
* Data-driven farming decisions

---

## 📄 License

This project is licensed under the MIT License.
