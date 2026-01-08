import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { marked } from "marked";
import "./App.css";
import { transcribeAudio } from "./lib/whisper";
import { sendToLLM, LLMProvider } from "./lib/llm";

interface Config {
  whisperUrl: string;
  whisperApiKey: string;
  llmProvider: LLMProvider;
  llmApiKey: string;
}

const defaultConfig: Config = {
  whisperUrl: "https://api.openai.com/v1/audio/transcriptions",
  whisperApiKey: "",
  llmProvider: "openai",
  llmApiKey: "",
};

function App() {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [response, setResponse] = useState("");
  const [transcribedText, setTranscribedText] = useState("");
  const [config, setConfig] = useState<Config>(defaultConfig);
  const [showSettings, setShowSettings] = useState(false);
  const [configDraft, setConfigDraft] = useState<Config>(defaultConfig);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Load config on mount
  useEffect(() => {
    invoke<Config>("get_config")
      .then((savedConfig) => {
        const merged = { ...defaultConfig, ...savedConfig };
        setConfig(merged);
        setConfigDraft(merged);
      })
      .catch(console.error);
  }, []);

  // Listen for toggle-recording event from Rust
  useEffect(() => {
    const unlisten = listen("toggle-recording", () => {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isRecording]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });
        stream.getTracks().forEach((track) => track.stop());
        await processAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setStatus("Recording...");
      setResponse("");
      setTranscribedText("");
    } catch (err) {
      console.error("Failed to start recording:", err);
      setStatus("Error: Microphone access denied");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatus("Processing...");
    }
  };

  const processAudio = async (audioBlob: Blob) => {
    if (!config.whisperApiKey) {
      setStatus("Error: Whisper API key not configured");
      return;
    }
    if (!config.llmApiKey) {
      setStatus("Error: LLM API key not configured");
      return;
    }

    try {
      // Transcribe audio
      setStatus("Transcribing...");
      const text = await transcribeAudio(
        audioBlob,
        config.whisperUrl,
        config.whisperApiKey
      );
      setTranscribedText(text);

      // Send to LLM
      setStatus("Thinking...");
      const llmResponse = await sendToLLM(
        text,
        config.llmProvider,
        config.llmApiKey
      );
      setResponse(llmResponse);
      setStatus("Ready");
    } catch (err) {
      console.error("Processing error:", err);
      setStatus(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`
      );
    }
  };

  const saveSettings = async () => {
    try {
      await invoke("save_config", { config: configDraft });
      setConfig(configDraft);
      setShowSettings(false);
      setStatus("Settings saved");
    } catch (err) {
      console.error("Failed to save config:", err);
      setStatus("Error saving settings");
    }
  };

  const renderedResponse = response ? marked.parse(response) : "";

  return (
    <div className="app">
      <header className="header">
        <h1>🎙️ Voice Agent</h1>
        <button
          className="settings-btn"
          onClick={() => setShowSettings(!showSettings)}
          title="Settings"
        >
          ⚙️
        </button>
      </header>

      {showSettings ? (
        <div className="settings-panel">
          <h2>Settings</h2>

          <div className="form-group">
            <label>Whisper API URL</label>
            <input
              type="text"
              value={configDraft.whisperUrl}
              onChange={(e) =>
                setConfigDraft({ ...configDraft, whisperUrl: e.target.value })
              }
              placeholder="https://api.openai.com/v1/audio/transcriptions"
            />
          </div>

          <div className="form-group">
            <label>Whisper API Key</label>
            <input
              type="password"
              value={configDraft.whisperApiKey}
              onChange={(e) =>
                setConfigDraft({
                  ...configDraft,
                  whisperApiKey: e.target.value,
                })
              }
              placeholder="sk-..."
            />
          </div>

          <div className="form-group">
            <label>LLM Provider</label>
            <select
              value={configDraft.llmProvider}
              onChange={(e) =>
                setConfigDraft({
                  ...configDraft,
                  llmProvider: e.target.value as LLMProvider,
                })
              }
            >
              <option value="openai">OpenAI (GPT-4o)</option>
              <option value="claude">Claude (Opus)</option>
              <option value="gemini">Google Gemini</option>
              <option value="perplexity">Perplexity</option>
            </select>
          </div>

          <div className="form-group">
            <label>LLM API Key</label>
            <input
              type="password"
              value={configDraft.llmApiKey}
              onChange={(e) =>
                setConfigDraft({ ...configDraft, llmApiKey: e.target.value })
              }
              placeholder="API key for selected provider"
            />
          </div>

          <div className="button-group">
            <button className="btn primary" onClick={saveSettings}>
              Save
            </button>
            <button
              className="btn secondary"
              onClick={() => {
                setConfigDraft(config);
                setShowSettings(false);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <main className="main">
          <div className="status-bar">
            <span
              className={`status-indicator ${isRecording ? "recording" : ""}`}
            ></span>
            <span>{status}</span>
          </div>

          <button
            className={`record-btn ${isRecording ? "recording" : ""}`}
            onClick={isRecording ? stopRecording : startRecording}
          >
            {isRecording ? "⏹️ Stop" : "🎤 Record"}
          </button>

          <p className="hint">Press Ctrl+Shift+Space to toggle recording</p>

          {transcribedText && (
            <div className="transcribed">
              <h3>You said:</h3>
              <p>{transcribedText}</p>
            </div>
          )}

          {response && (
            <div className="response">
              <h3>Response:</h3>
              <div
                className="markdown-content"
                dangerouslySetInnerHTML={{ __html: renderedResponse as string }}
              />
            </div>
          )}
        </main>
      )}
    </div>
  );
}

export default App;
