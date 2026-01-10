import { Cancel01Icon, Settings01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { useCallback, useEffect, useRef, useState } from "react"
import { Streamdown } from "streamdown"
import "./App.css"
import { type Config, KeysConfigModal } from "./components/KeysConfigModal"
import { Button } from "./components/ui/button"
import { type AgentState, Orb } from "./components/ui/orb"
import { isAudioSilent } from "./lib/audio-utils"
import { streamToLLM } from "./lib/llm"
import { chunkText, speakWithTTS } from "./lib/tts"
import { transcribeAudio } from "./lib/whisper"

const defaultConfig: Config = {
  whisperUrl: "https://api.openai.com/v1/audio/transcriptions",
  whisperApiKey: "",
  llmProvider: "openai",
  openaiApiKey: "",
  geminiApiKey: "",
  anthropicApiKey: "",
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
  const [streamingResponse, setStreamingResponse] = useState<string>("")
  const [isStreaming, setIsStreaming] = useState(false)

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
      streamRef.current.getTracks().forEach((track) => {
        track.stop()
      })
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
    // Get the appropriate LLM API key based on provider
    const getLLMApiKey = () => {
      switch (config.llmProvider) {
        case "openai":
          return config.openaiApiKey
        case "gemini":
          return config.geminiApiKey
        case "claude":
          return config.anthropicApiKey
        default:
          return config.openaiApiKey
      }
    }

    if (!config.openaiApiKey) {
      setStatus("Configure OpenAI API key")
      setIsSettingsOpen(true)
      setAgentState(null)
      return
    }

    const llmApiKey = getLLMApiKey()
    if (!llmApiKey) {
      setStatus(`Configure ${config.llmProvider} API key`)
      setIsSettingsOpen(true)
      setAgentState(null)
      return
    }

    try {
      // Check if audio is completely silent before sending to Whisper
      setStatus("Analyzing audio...")
      setAgentState("thinking")
      const isSilent = await isAudioSilent(audioBlob)
      if (isSilent) {
        setStatus("No speech detected")
        setIsProcessing(false)
        setAgentState(null)
        return
      }

      // Transcribe audio
      setStatus("Transcribing...")
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

      console.log("[App] Transcription result:", text)
      console.log("[App] LLM Provider:", config.llmProvider)
      console.log("[App] LLM API Key present:", !!llmApiKey)

      // Get LLM response with streaming
      setStatus("Thinking...")
      setStreamingResponse("")

      console.log("[App] Starting LLM streaming...")
      let fullResponse = ""
      let isFirstChunk = true
      for await (const chunk of streamToLLM(
        text,
        config.llmProvider,
        llmApiKey,
      )) {
        if (isCancelledRef.current) break
        // Only start streaming UI on first chunk (shifts the orb)
        if (isFirstChunk) {
          setIsStreaming(true)
          isFirstChunk = false
        }
        fullResponse += chunk
        setStreamingResponse(fullResponse)
        console.log("[App] Received chunk:", chunk.substring(0, 50))
      }
      console.log(
        "[App] LLM streaming complete, total length:",
        fullResponse.length,
      )

      // Speak the response with TTS (audio streams as it's received)
      setStatus("Speaking...")
      setAgentState("talking")

      // Chunk text if too long for TTS (4096 char limit)
      const chunks = chunkText(fullResponse)

      for (const chunk of chunks) {
        if (isCancelledRef.current) break

        const { stop, finished } = await speakWithTTS(
          chunk,
          config.openaiApiKey, // OpenAI key for TTS
          { voice: "alloy", model: "tts-1" },
          (volume) => {
            outputVolumeRef.current = volume
          },
        )

        ttsStopRef.current = stop
        await finished
        ttsStopRef.current = null
      }

      // Clear streaming state
      setIsStreaming(false)
      setStreamingResponse("")

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

      // Clean up streaming state
      setIsStreaming(false)
      setStreamingResponse("")

      // Extract error message from various error formats
      let errorMessage = "Unknown error"
      if (err instanceof Error) {
        errorMessage = err.message
      } else if (typeof err === "object" && err !== null && "message" in err) {
        errorMessage = String((err as { message: unknown }).message)
      } else if (typeof err === "string") {
        errorMessage = err
      }

      setStatus(`Error: ${errorMessage}`)
      setIsProcessing(false)
      setAgentState(null)
      outputVolumeRef.current = 0
    }
  }

  const startRecording = useCallback(async () => {
    // Check for API keys first
    if (!config.openaiApiKey) {
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
          streamRef.current.getTracks().forEach((track) => {
            track.stop()
          })
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
  }, [
    config.openaiApiKey,
    config.llmProvider,
    config.geminiApiKey,
    config.anthropicApiKey,
  ])

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
        streamRef.current.getTracks().forEach((track) => {
          track.stop()
        })
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
          streamRef.current.getTracks().forEach((track) => {
            track.stop()
          })
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
    <button
      type="button"
      className="orb-container"
      onClick={handleBackgroundClick}
      tabIndex={0}
    >
      {/* Floating action buttons */}
      <div className="orb-actions">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (isRecording) stopRecording()
            stopTTS()
            setIsSettingsOpen(true)
          }}
          title="Settings"
        >
          <HugeiconsIcon icon={Settings01Icon} strokeWidth={2} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={hideWindow}
          title="Minimize to tray"
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </div>

      {/* Centered Orb and Response Container */}
      <div className="orb-response-container">
        <div className={`orb-section ${isStreaming ? "shifted" : ""}`}>
          <div
            className="orb-wrapper"
            onClick={handleOrbClick}
            onKeyDown={(e) => e.key === "Enter" && handleOrbClick()}
            role="button"
            tabIndex={0}
          >
            <Orb
              agentState={agentState}
              getInputVolume={getInputVolume}
              getOutputVolume={getOutputVolume}
              colors={["#7f22fe", "#7c5cff"]}
            />
          </div>

          {/* Status text below Orb */}
          <div className="orb-status">
            {isProcessing && agentState === "talking" && (
              <span className="streaming-indicator">●</span>
            )}
            <span>{status}</span>
          </div>
        </div>

        {/* Streaming Response */}
        {isStreaming && streamingResponse && (
          <div className="response-container">
            <Streamdown>{streamingResponse}</Streamdown>
          </div>
        )}
      </div>

      {/* Settings Modal */}
      <KeysConfigModal
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        config={configDraft}
        onConfigChange={setConfigDraft}
        onSave={saveSettings}
      />
    </button>
  )
}

export default App
