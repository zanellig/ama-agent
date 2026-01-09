import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window"
import { useCallback, useEffect, useRef, useState } from "react"
import "./App.css"
import { KeysConfigModal } from "./components/KeysConfigModal"
import { type AgentState, Orb } from "./components/ui/orb"
import { type LLMProvider, sendToLLM } from "./lib/llm"
import { chunkText, speakWithTTS } from "./lib/tts"
import { transcribeAudio } from "./lib/whisper"

interface Config {
  whisperUrl: string
  whisperApiKey: string
  llmProvider: LLMProvider
  llmApiKey: string
}

const defaultConfig: Config = {
  whisperUrl: "https://api.openai.com/v1/audio/transcriptions",
  whisperApiKey: "",
  llmProvider: "openai",
  llmApiKey: "",
}

// Settings modal state managed by isSettingsOpen boolean

function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [status, setStatus] = useState("Ready")
  const [config, setConfig] = useState<Config>(defaultConfig)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [configDraft, setConfigDraft] = useState<Config>(defaultConfig)
  const [agentState, setAgentState] = useState<AgentState>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyzerRef = useRef<AnalyserNode | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const silenceStartRef = useRef<number | null>(null)
  const silenceIntervalRef = useRef<number | null>(null)
  const isCancelledRef = useRef<boolean>(false)
  const whisperSentRef = useRef<boolean>(false)
  const outputVolumeRef = useRef<number>(0)
  const ttsStopRef = useRef<(() => void) | null>(null)

  // Load config on mount
  useEffect(() => {
    invoke<Config>("get_config")
      .then((savedConfig) => {
        const merged = { ...defaultConfig, ...savedConfig }
        setConfig(merged)
        setConfigDraft(merged)
      })
      .catch(console.error)
  }, [])

  // Helper function to resize window
  const resizeWindow = useCallback(async () => {
    const appWindow = getCurrentWindow()
    await appWindow.setSize(new LogicalSize(400, 450))
    await appWindow.center()
  }, [])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }, [isRecording])

  const stopTTS = useCallback(() => {
    if (ttsStopRef.current) {
      ttsStopRef.current()
      ttsStopRef.current = null
    }
  }, [])

  const hideWindow = useCallback(async () => {
    // Mark as cancelled so onstop doesn't process audio
    isCancelledRef.current = true

    // Stop TTS if playing
    stopTTS()

    // Stop recording if active
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop()
    }
    // Clean up silence detection
    if (silenceIntervalRef.current) {
      clearInterval(silenceIntervalRef.current)
      silenceIntervalRef.current = null
    }
    silenceStartRef.current = null
    // Clean up audio
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    analyzerRef.current = null
    outputVolumeRef.current = 0
    setIsRecording(false)
    setIsProcessing(false)
    setStatus("Ready")
    setAgentState(null)
    setIsSettingsOpen(false)

    // Hide to tray via Tauri command (emits window-hidden event)
    await invoke("hide_to_tray")
  }, [stopTTS])

  // Get input volume from analyzer for Orb reactivity
  const getInputVolume = useCallback(() => {
    if (!analyzerRef.current) return 0

    const dataArray = new Uint8Array(analyzerRef.current.frequencyBinCount)
    analyzerRef.current.getByteTimeDomainData(dataArray)

    let sum = 0
    for (let i = 0; i < dataArray.length; i++) {
      const normalized = (dataArray[i] - 128) / 128
      sum += normalized * normalized
    }
    const rms = Math.sqrt(sum / dataArray.length)

    // Scale RMS to 0-1 range with some amplification
    return Math.min(1, rms * 5)
  }, [])

  // Get output volume for Orb reactivity during TTS
  const getOutputVolume = useCallback(() => {
    return outputVolumeRef.current
  }, [])

  const processAudio = async (audioBlob: Blob) => {
    if (!config.whisperApiKey) {
      setStatus("Configure API keys")
      setIsSettingsOpen(true)
      setAgentState(null)
      return
    }
    if (!config.llmApiKey) {
      setStatus("Configure API keys")
      setIsSettingsOpen(true)
      setAgentState(null)
      return
    }

    try {
      // Transcribe audio
      setStatus("Transcribing...")
      setAgentState("thinking")
      whisperSentRef.current = true
      const text = await transcribeAudio(
        audioBlob,
        config.whisperUrl,
        config.whisperApiKey,
      )

      // Check if no speech was detected
      if (!text || text.trim() === "") {
        setStatus("No speech detected")
        setIsProcessing(false)
        setAgentState(null)
        // Auto-restart recording after a short delay
        setTimeout(() => {
          if (!isCancelledRef.current) {
            startRecording()
          }
        }, 1500)
        return
      }

      // Get LLM response (non-streaming for TTS)
      setStatus("Thinking...")
      const response = await sendToLLM(
        text,
        config.llmProvider,
        config.llmApiKey,
      )

      // Speak the response with TTS
      setStatus("Speaking...")
      setAgentState("talking")

      // Chunk text if too long for TTS
      const chunks = chunkText(response)

      for (const chunk of chunks) {
        if (isCancelledRef.current) break

        const { stop, finished } = await speakWithTTS(
          chunk,
          config.whisperApiKey, // Reuse OpenAI key
          { voice: "alloy", model: "tts-1" },
          (volume) => {
            outputVolumeRef.current = volume
          },
        )

        ttsStopRef.current = stop
        await finished
        ttsStopRef.current = null
      }

      setStatus("Ready")
      setAgentState(null)
      setIsProcessing(false)
      outputVolumeRef.current = 0
      whisperSentRef.current = false

      // Auto-restart recording after response
      if (!isCancelledRef.current) {
        setTimeout(() => {
          startRecording()
        }, 500)
      }
    } catch (err) {
      console.error("Processing error:", err)
      setStatus(
        `Error: ${err instanceof Error ? err.message : "Unknown error"}`,
      )
      setIsProcessing(false)
      setAgentState(null)
      outputVolumeRef.current = 0
    }
  }

  const startRecording = useCallback(async () => {
    // Check for API keys first
    if (!config.whisperApiKey || !config.llmApiKey) {
      setStatus("Configure API keys first")
      setIsSettingsOpen(true)
      return
    }

    // Silence detection constants
    const SILENCE_THRESHOLD = 0.01
    const SILENCE_DURATION_MS = 1000
    const CHECK_INTERVAL_MS = 100

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Set up audio context and analyzer for visualization
      const audioContext = new AudioContext()
      const source = audioContext.createMediaStreamSource(stream)
      const analyzer = audioContext.createAnalyser()
      analyzer.fftSize = 256
      source.connect(analyzer)

      audioContextRef.current = audioContext
      analyzerRef.current = analyzer

      const mediaRecorder = new MediaRecorder(stream)
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      // Reset silence tracking
      silenceStartRef.current = null

      // Set up silence detection interval
      const dataArray = new Uint8Array(analyzer.frequencyBinCount)
      silenceIntervalRef.current = window.setInterval(() => {
        if (
          !mediaRecorderRef.current ||
          mediaRecorderRef.current.state !== "recording"
        ) {
          return
        }

        // Calculate RMS of audio
        analyzer.getByteTimeDomainData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          const normalized = (dataArray[i] - 128) / 128
          sum += normalized * normalized
        }
        const rms = Math.sqrt(sum / dataArray.length)

        if (rms < SILENCE_THRESHOLD) {
          // Silence detected
          if (!silenceStartRef.current) {
            silenceStartRef.current = Date.now()
          } else if (
            Date.now() - silenceStartRef.current >=
            SILENCE_DURATION_MS
          ) {
            // 1 second of silence - auto stop
            if (
              mediaRecorderRef.current &&
              mediaRecorderRef.current.state === "recording"
            ) {
              mediaRecorderRef.current.stop()
              setIsRecording(false)
            }
          }
        } else {
          // Speech detected - reset silence timer
          silenceStartRef.current = null
        }
      }, CHECK_INTERVAL_MS)

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Clear silence detection interval
        if (silenceIntervalRef.current) {
          clearInterval(silenceIntervalRef.current)
          silenceIntervalRef.current = null
        }
        silenceStartRef.current = null

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        })

        // Clean up stream and audio context
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }
        if (audioContextRef.current) {
          audioContextRef.current.close()
          audioContextRef.current = null
        }
        analyzerRef.current = null

        // Check if cancelled (e.g., user pressed X to hide)
        if (isCancelledRef.current) {
          isCancelledRef.current = false
          setAgentState(null)
          return
        }

        setIsProcessing(true)
        setAgentState("thinking")
        await processAudio(audioBlob)
      }

      // Reset flags when starting new recording
      isCancelledRef.current = false
      whisperSentRef.current = false

      mediaRecorder.start()
      setIsRecording(true)
      setAgentState("listening")
      setStatus("Listening...")
      setIsSettingsOpen(false)
    } catch (err) {
      console.error("Failed to start recording:", err)
      setStatus("Microphone access denied")
      setAgentState(null)
    }
  }, [config.whisperApiKey, config.llmApiKey])

  // Listen for window-shown event to auto-start recording
  useEffect(() => {
    const unlistenShown = listen("window-shown", () => {
      // Only auto-start if we're not already recording and not processing
      if (!isRecording && !isProcessing) {
        startRecording()
      }
    })

    const unlistenHidden = listen("window-hidden", () => {
      // Full interrupt when hiding to tray
      isCancelledRef.current = true

      // Stop TTS if playing
      stopTTS()

      // Stop recording if active
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.stop()
      }
      // Clean up silence detection
      if (silenceIntervalRef.current) {
        clearInterval(silenceIntervalRef.current)
        silenceIntervalRef.current = null
      }
      silenceStartRef.current = null
      // Clean up audio
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      analyzerRef.current = null
      outputVolumeRef.current = 0
      whisperSentRef.current = false

      setIsRecording(false)
      setIsProcessing(false)
      setStatus("Ready")
      setAgentState(null)
      setIsSettingsOpen(false)
    })

    // Handle shortcut-action when window is visible
    const unlistenShortcut = listen("shortcut-action", () => {
      if (agentState === "talking") {
        // Interrupt TTS and restart listening
        stopTTS()
        setAgentState(null)
        setStatus("Ready")
        setIsProcessing(false)
        outputVolumeRef.current = 0
        whisperSentRef.current = false
        startRecording()
      } else if (agentState === "listening" && !whisperSentRef.current) {
        // Cancel workflow before whisper request
        isCancelledRef.current = true

        // Stop recording
        if (
          mediaRecorderRef.current &&
          mediaRecorderRef.current.state === "recording"
        ) {
          mediaRecorderRef.current.stop()
        }
        // Clean up silence detection
        if (silenceIntervalRef.current) {
          clearInterval(silenceIntervalRef.current)
          silenceIntervalRef.current = null
        }
        silenceStartRef.current = null
        // Clean up audio
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop())
          streamRef.current = null
        }
        if (audioContextRef.current) {
          audioContextRef.current.close()
          audioContextRef.current = null
        }
        analyzerRef.current = null

        setIsRecording(false)
        setAgentState(null)
        setStatus("Ready")
      } else if (!isRecording && !isProcessing) {
        // Ready state - minimize to tray
        invoke("hide_to_tray")
      }
      // If whisperSentRef.current is true (processing), do nothing
    })

    return () => {
      unlistenShown.then((fn) => fn())
      unlistenHidden.then((fn) => fn())
      unlistenShortcut.then((fn) => fn())
    }
  }, [isRecording, isProcessing, agentState, startRecording, stopTTS])

  // Resize window on mount
  useEffect(() => {
    resizeWindow()
  }, [resizeWindow])

  const saveSettings = async () => {
    try {
      await invoke("save_config", { config: configDraft })
      setConfig(configDraft)
      setStatus("Settings saved")
      // After saving, close modal and start recording
      setIsSettingsOpen(false)
      startRecording()
    } catch (err) {
      console.error("Failed to save config:", err)
      setStatus("Error saving settings")
    }
  }

  const handleOrbClick = () => {
    if (isRecording) {
      // Cancel workflow before whisper request (same as shortcut interrupt)
      isCancelledRef.current = true

      // Stop recording
      if (
        mediaRecorderRef.current &&
        mediaRecorderRef.current.state === "recording"
      ) {
        mediaRecorderRef.current.stop()
      }
      // Clean up silence detection
      if (silenceIntervalRef.current) {
        clearInterval(silenceIntervalRef.current)
        silenceIntervalRef.current = null
      }
      silenceStartRef.current = null
      // Clean up audio
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop())
        streamRef.current = null
      }
      if (audioContextRef.current) {
        audioContextRef.current.close()
        audioContextRef.current = null
      }
      analyzerRef.current = null

      setIsRecording(false)
      setAgentState(null)
      setStatus("Ready")
    } else if (agentState === "talking") {
      stopTTS()
      setAgentState(null)
      setStatus("Ready")
      setIsProcessing(false)
      startRecording()
    } else if (!isProcessing) {
      startRecording()
    }
  }

  // Handle background click to hide window
  const handleBackgroundClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only hide if clicking directly on the container (not on child elements)
    if (e.target === e.currentTarget) {
      hideWindow()
    }
  }

  return (
    <div className="orb-container" onClick={handleBackgroundClick}>
      {/* Floating action buttons */}
      <div className="orb-actions">
        <button
          className="orb-action-btn"
          onClick={() => {
            if (isRecording) stopRecording()
            stopTTS()
            setIsSettingsOpen(true)
          }}
          title="Settings"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
        <button
          className="orb-action-btn"
          onClick={hideWindow}
          title="Minimize to tray"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Centered Orb */}
      <div className="orb-wrapper" onClick={handleOrbClick}>
        <Orb
          agentState={agentState}
          getInputVolume={getInputVolume}
          getOutputVolume={getOutputVolume}
          colors={["#7f22fe", "#7c5cff66"]}
        />
      </div>

      {/* Status text below Orb */}
      <div className="orb-status">
        {isProcessing && agentState === "talking" && (
          <span className="streaming-indicator">●</span>
        )}
        <span>{status}</span>
      </div>

      {/* Settings Modal */}
      <KeysConfigModal
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        config={configDraft}
        onConfigChange={setConfigDraft}
        onSave={saveSettings}
      />
    </div>
  )
}

export default App
