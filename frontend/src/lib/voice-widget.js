(function() {
  const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY;

  // --- 1. INJECT CSS ---
  const style = document.createElement('style');
  style.innerHTML = `
    #va-trigger {
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      box-shadow: 0 4px 20px rgba(16, 185, 129, 0.45);
      cursor: pointer;
      z-index: 10001;
      transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.25s;
      display: flex;
      justify-content: center;
      align-items: center;
      border: 3px solid rgba(255, 255, 255, 0.35);
      overflow: hidden;
    }
    #va-trigger:hover {
      transform: scale(1.12) translateY(-3px);
      box-shadow: 0 10px 30px rgba(16, 185, 129, 0.6);
    }
    #va-trigger img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    /* Pulse ring when listening */
    @keyframes va-ring-pulse {
      0% { transform: scale(1); opacity: 0.7; }
      100% { transform: scale(1.6); opacity: 0; }
    }
    #va-trigger.listening::before {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: rgba(16, 185, 129, 0.4);
      animation: va-ring-pulse 1.2s ease-out infinite;
    }

    #va-popup {
      position: fixed;
      bottom: 96px;
      right: 24px;
      width: 340px;
      background: #0f172a;
      border-radius: 24px;
      box-shadow: 0 16px 48px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.06);
      display: flex;
      flex-direction: column;
      z-index: 10000;
      color: white;
      font-family: 'Inter', 'Segoe UI', sans-serif;
      overflow: hidden;
      opacity: 0;
      pointer-events: none;
      transform: translateY(16px) scale(0.97);
      transition: opacity 0.28s ease, transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }
    #va-popup.active {
      opacity: 1;
      pointer-events: all;
      transform: translateY(0) scale(1);
    }

    #va-header {
      padding: 16px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(255,255,255,0.04);
      border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    #va-header-left {
      display: flex;
      align-items: center;
      gap: 10px;
    }
    #va-header-icon {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      overflow: hidden;
      border: 2px solid rgba(16,185,129,0.5);
    }
    #va-header-icon img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    #va-header-title {
      font-weight: 700;
      font-size: 0.95rem;
      letter-spacing: -0.01em;
    }
    #va-header-subtitle {
      font-size: 0.7rem;
      color: #34d399;
      font-weight: 500;
    }
    #va-close {
      background: rgba(255,255,255,0.08);
      border: none;
      color: #94a3b8;
      width: 30px;
      height: 30px;
      border-radius: 50%;
      font-size: 1rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
    }
    #va-close:hover { background: rgba(239,68,68,0.2); color: #f87171; }

    #va-avatar-container {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      padding: 28px 0 8px;
      gap: 10px;
    }
    #va-avatar {
      width: 72px;
      height: 72px;
      border-radius: 50%;
      overflow: hidden;
      border: 3px solid rgba(16,185,129,0.4);
      box-shadow: 0 0 0 0 rgba(16,185,129,0.5);
      transition: all 0.3s;
    }
    #va-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    @keyframes va-pulse {
      0% { box-shadow: 0 0 0 0 rgba(16,185,129, 0.7); }
      70% { box-shadow: 0 0 0 18px rgba(16,185,129, 0); }
      100% { box-shadow: 0 0 0 0 rgba(16,185,129, 0); }
    }
    .va-listening #va-avatar {
      animation: va-pulse 1.4s infinite;
      border-color: #10b981;
    }

    @keyframes va-bounce {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.07); }
    }
    .va-speaking #va-avatar {
      animation: va-bounce 0.8s infinite alternate;
      border-color: #6c63ff;
      box-shadow: 0 0 20px rgba(108,99,255,0.4);
    }

    #va-status {
      font-size: 0.78rem;
      color: #64748b;
      font-weight: 500;
      letter-spacing: 0.03em;
    }

    #va-chat {
      padding: 16px 20px 20px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
      max-height: 160px;
      min-height: 80px;
    }

    #va-transcript {
      padding: 8px 14px;
      background: rgba(255,255,255,0.05);
      border-radius: 12px 12px 4px 12px;
      color: #94a3b8;
      font-style: italic;
      font-size: 0.85rem;
      text-align: right;
      border: 1px solid rgba(255,255,255,0.06);
      display: none;
    }
    #va-transcript:not(:empty) { display: block; }

    #va-response {
      padding: 10px 14px;
      background: linear-gradient(135deg, rgba(16,185,129,0.12), rgba(6,95,70,0.08));
      border: 1px solid rgba(16,185,129,0.2);
      border-radius: 4px 12px 12px 12px;
      color: #e2e8f0;
      font-size: 0.9rem;
      line-height: 1.5;
    }

    #va-chat::-webkit-scrollbar { width: 4px; }
    #va-chat::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 3px; }

    @media (max-width: 480px) {
      #va-popup {
        width: calc(100vw - 32px);
        right: 16px;
        bottom: 92px;
      }
      #va-trigger {
        right: 20px;
        bottom: 20px;
        width: 54px;
        height: 54px;
      }
    }
  `;
  document.head.appendChild(style);

  // --- 2. INJECT HTML ---
  const container = document.createElement('div');
  container.innerHTML = `
    <div id="va-trigger" title="Ask AgriSense AI">
      <img src="/cropped_circle_image.png" alt="AgriSense Voice" />
    </div>

    <div id="va-popup">
      <div id="va-header">
        <div id="va-header-left">
          <div id="va-header-icon">
            <img src="/cropped_circle_image.png" alt="AgriSense" />
          </div>
          <div>
            <div id="va-header-title">AgriSense AI</div>
            <div id="va-header-subtitle">● Voice Assistant</div>
          </div>
        </div>
        <button id="va-close">✕</button>
      </div>
      <div id="va-avatar-container">
        <div id="va-avatar">
          <img src="/cropped_circle_image.png" alt="Avatar" />
        </div>
        <div id="va-status">Tap mic to speak...</div>
      </div>
      <div id="va-chat">
        <div id="va-transcript"></div>
        <div id="va-response">Hi! I'm your AgriSense assistant. Ask me anything about your crops, weather, or farming. 🌾</div>
      </div>
    </div>
  `;
  document.body.appendChild(container);

  // --- 3. LOGIC ---
  const trigger = document.getElementById('va-trigger');
  const popup = document.getElementById('va-popup');
  const closeBtn = document.getElementById('va-close');
  const avatarContainer = document.getElementById('va-avatar-container');
  const statusEl = document.getElementById('va-status');
  const transcriptEl = document.getElementById('va-transcript');
  const responseEl = document.getElementById('va-response');

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let synth = window.speechSynthesis;
  let isPopupOpen = false;

  if (!SpeechRecognition) {
    statusEl.innerText = "Voice not supported. Use Chrome.";
  } else {
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';
  }

  function setStatus(text, mode = 'idle') {
    statusEl.innerText = text;
    avatarContainer.className = '';
    if (mode === 'listening') {
      avatarContainer.classList.add('va-listening');
      trigger.classList.add('listening');
    } else {
      trigger.classList.remove('listening');
    }
    if (mode === 'speaking') avatarContainer.classList.add('va-speaking');
  }

  function detectLang(text) {
    if (/[\u0900-\u097F]/.test(text)) return { code: 'hi-IN', name: 'Hindi/Devanagari' };
    if (/[\u0B80-\u0BFF]/.test(text)) return { code: 'ta-IN', name: 'Tamil' };
    if (/[\u0C00-\u0C7F]/.test(text)) return { code: 'te-IN', name: 'Telugu' };
    if (/[\u0980-\u09FF]/.test(text)) return { code: 'bn-IN', name: 'Bengali' };
    const lower = text.toLowerCase();
    if (lower.includes('kya') || lower.includes('hai') || lower.includes('kaise')) {
      return { code: 'hi-IN', name: 'Hinglish (Hindi in English script)' };
    }
    return { code: 'en-US', name: 'English' };
  }

  async function askGroq(userText, langName) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [
            {
              role: "system",
              content: `You are an AI assistant for a smart agriculture app called AgriSense AI. 
                The user is speaking in the language/script: ${langName}.
                IMPORTANT RULES:
                1. Reply in the EXACT SAME language and script the user used.
                2. Keep replies SHORT (1-3 sentences max) — this is a voice interface.
                3. No markdown, asterisks, bullets, or special characters — plain text only.
                4. Be helpful, conversational, and focused on farming/agriculture.`
            },
            { role: "user", content: userText }
          ],
          max_tokens: 300,
          temperature: 0.7
        })
      });
      if (!response.ok) throw new Error("API failed");
      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (e) {
      console.error(e);
      return "Sorry, I couldn't connect to the AI service right now.";
    }
  }

  function speak(text, langCode) {
    if (!isPopupOpen) return;
    synth.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = langCode || 'en-IN';
    utter.rate = 1.0;
    utter.pitch = 1.0;
    const voices = synth.getVoices();
    let preferredVoice =
      voices.find(v => v.lang === utter.lang && (v.name.includes('Female') || v.name.includes('Google'))) ||
      voices.find(v => v.lang === utter.lang) ||
      voices.find(v => v.lang.includes('IN')) ||
      voices.find(v => v.lang.includes('GB'));
    if (preferredVoice) utter.voice = preferredVoice;

    utter.onstart = () => setStatus("Speaking...", 'speaking');
    utter.onend = () => {
      setStatus("Listening...", 'listening');
      if (isPopupOpen && recognition) { try { recognition.start(); } catch(e) {} }
    };
    utter.onerror = () => {
      setStatus("Listening...", 'listening');
      if (isPopupOpen && recognition) { try { recognition.start(); } catch(e) {} }
    };
    synth.speak(utter);
  }

  if (recognition) {
    recognition.onstart = () => setStatus("Listening...", 'listening');

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
        else interimTranscript += event.results[i][0].transcript;
      }
      transcriptEl.innerText = finalTranscript || interimTranscript;
      if (finalTranscript) { recognition.stop(); processInput(finalTranscript); }
    };

    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') setStatus("Please allow microphone access.", 'idle');
      else if (event.error === 'no-speech') { if (isPopupOpen) try { recognition.start(); } catch(e) {} }
      else setStatus("Mic error. Try again.", 'idle');
    };
  }

  async function processInput(text) {
    setStatus("Thinking...", 'idle');
    responseEl.innerText = "...";
    const detected = detectLang(text);
    const botReply = await askGroq(text, detected.name);
    if (!isPopupOpen) return;
    transcriptEl.innerText = text;
    responseEl.innerText = botReply;
    speak(botReply, detected.code);
  }

  trigger.addEventListener('click', () => {
    isPopupOpen = true;
    popup.classList.add('active');
    transcriptEl.innerText = "";
    responseEl.innerText = "Hi! I'm your AgriSense assistant. Ask me anything about your crops, weather, or farming. 🌾";
    speak(responseEl.innerText, 'en-US');
  });

  closeBtn.addEventListener('click', () => {
    isPopupOpen = false;
    popup.classList.remove('active');
    synth.cancel();
    if (recognition) try { recognition.stop(); } catch(e) {}
    setStatus("Tap to speak...", 'idle');
    trigger.classList.remove('listening');
  });

})();
