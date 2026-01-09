import { createOpenAI } from "@ai-sdk/openai"
import { experimental_generateSpeech as generateSpeech } from "ai"

export type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer"

export interface TTSOptions {
  voice?: TTSVoice
  model?: "tts-1" | "tts-1-hd"
  speed?: number // 0.25 to 4.0
}

/**
 * Generate speech using AI SDK and play with volume monitoring
 */
export async function streamTTS(
  text: string,
  apiKey: string,
  options: TTSOptions = {},
  onOutputVolume?: (volume: number) => void,
): Promise<{ stop: () => void; finished: Promise<void> }> {
  const { voice = "alloy", model = "tts-1-hd", speed = 1.0 } = options

  // Generate speech using AI SDK
  const openai = createOpenAI({ apiKey })
  const result = await generateSpeech({
    model: openai.speech(model),
    text,
    voice,
    providerOptions: {
      openai: {
        speed,
        response_format: "mp3",
      },
    },
  })

  // Play the generated audio with volume monitoring
  // AI SDK returns audio as GeneratedAudioFile with uint8Array property
  return playAudioWithMonitoring(result.audio.uint8Array, onOutputVolume)
}

/**
 * Play audio data with volume monitoring and stop controls
 */
async function playAudioWithMonitoring(
  audioData: Uint8Array,
  onOutputVolume?: (volume: number) => void,
): Promise<{ stop: () => void; finished: Promise<void> }> {
  // Set up Web Audio API
  const audioContext = new AudioContext()
  const analyzer = audioContext.createAnalyser()
  analyzer.fftSize = 256
  analyzer.connect(audioContext.destination)

  // Track state
  let stopped = false
  let animationFrameId: number | null = null
  const dataArray = new Uint8Array(analyzer.frequencyBinCount)
  let isPlaying = false

  // Volume monitoring
  const monitorVolume = () => {
    if (stopped) return

    if (onOutputVolume && isPlaying) {
      analyzer.getByteTimeDomainData(dataArray)

      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128
        sum += normalized * normalized
      }
      const rms = Math.sqrt(sum / dataArray.length)
      onOutputVolume(Math.min(1, rms * 4))
    }

    animationFrameId = requestAnimationFrame(monitorVolume)
  }

  // Cleanup function
  const cleanup = () => {
    stopped = true
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
      animationFrameId = null
    }
    if (onOutputVolume) {
      onOutputVolume(0)
    }
    audioContext.close()
  }

  // Audio source reference for stop
  let activeSource: AudioBufferSourceNode | null = null

  // Stop function
  const stop = () => {
    if (activeSource) {
      try {
        activeSource.stop()
      } catch {
        // Ignore errors from already stopped sources
      }
    }
    cleanup()
  }

  // Start volume monitoring
  monitorVolume()

  const finished = (async () => {
    try {
      if (stopped) {
        return
      }

      // Decode and play - create a copy of the ArrayBuffer for decodeAudioData
      const bufferCopy = audioData.buffer.slice(
        audioData.byteOffset,
        audioData.byteOffset + audioData.byteLength,
      ) as ArrayBuffer
      const audioBuffer = await audioContext.decodeAudioData(bufferCopy)

      if (stopped) {
        return
      }

      const source = audioContext.createBufferSource()
      source.buffer = audioBuffer
      source.connect(analyzer)
      activeSource = source

      isPlaying = true

      // Start playback and wait for audio to finish
      source.start(0)
      await new Promise<void>((resolvePlayback) => {
        source.onended = () => {
          isPlaying = false
          activeSource = null
          cleanup()
          resolvePlayback()
        }
      })
    } catch (err) {
      cleanup()
      throw err
    }
  })()

  return { stop, finished }
}

/**
 * Stream TTS with true chunk-by-chunk playback using PCM format
 * Uses AI SDK for generation, custom playback for low latency
 */
export async function streamTTSRealtime(
  text: string,
  apiKey: string,
  options: TTSOptions = {},
  onOutputVolume?: (volume: number) => void,
): Promise<{ stop: () => void; finished: Promise<void> }> {
  const { voice = "alloy", model = "tts-1", speed = 1.0 } = options

  // Generate speech using AI SDK with PCM format for streaming
  const openai = createOpenAI({ apiKey })
  const result = await generateSpeech({
    model: openai.speech(model),
    text,
    voice,
    providerOptions: {
      openai: {
        speed,
        response_format: "pcm",
      },
    },
  })

  // Play PCM audio with volume monitoring
  return playPCMAudioWithMonitoring(result.audio.uint8Array, onOutputVolume)
}

/**
 * Play PCM audio data with volume monitoring
 * PCM format: 24kHz, 16-bit, mono
 */
async function playPCMAudioWithMonitoring(
  pcmData: Uint8Array,
  onOutputVolume?: (volume: number) => void,
): Promise<{ stop: () => void; finished: Promise<void> }> {
  const SAMPLE_RATE = 24000
  const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })

  const analyzer = audioContext.createAnalyser()
  analyzer.fftSize = 256
  analyzer.connect(audioContext.destination)

  let stopped = false
  let animationFrameId: number | null = null
  const dataArray = new Uint8Array(analyzer.frequencyBinCount)
  let activeSource: AudioBufferSourceNode | null = null

  // Volume monitoring
  const monitorVolume = () => {
    if (stopped) return

    if (onOutputVolume) {
      analyzer.getByteTimeDomainData(dataArray)

      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128
        sum += normalized * normalized
      }
      const rms = Math.sqrt(sum / dataArray.length)
      onOutputVolume(Math.min(1, rms * 4))
    }

    animationFrameId = requestAnimationFrame(monitorVolume)
  }

  // Cleanup
  const cleanup = () => {
    stopped = true
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId)
    }
    if (onOutputVolume) {
      onOutputVolume(0)
    }
    audioContext.close()
  }

  const stop = () => {
    if (activeSource) {
      try {
        activeSource.stop()
      } catch {
        /* ignore */
      }
    }
    cleanup()
  }

  monitorVolume()

  const finished = new Promise<void>((resolve, reject) => {
    try {
      if (stopped) {
        resolve()
        return
      }

      // Convert PCM Int16 to Float32
      const samples = pcmData.length / 2
      const int16Data = new Int16Array(
        pcmData.buffer,
        pcmData.byteOffset,
        samples,
      )
      const floatData = new Float32Array(samples)
      for (let i = 0; i < samples; i++) {
        floatData[i] = int16Data[i] / 32768
      }

      // Create audio buffer
      const buffer = audioContext.createBuffer(1, floatData.length, SAMPLE_RATE)
      buffer.getChannelData(0).set(floatData)

      // Create and play source
      const source = audioContext.createBufferSource()
      source.buffer = buffer
      source.connect(analyzer)
      activeSource = source

      source.onended = () => {
        activeSource = null
        cleanup()
        resolve()
      }

      source.start(0)
    } catch (err) {
      cleanup()
      reject(err)
    }
  })

  return { stop, finished }
}

/**
 * Simple text chunker for long responses
 * OpenAI TTS has a 4096 character limit
 */
export function chunkText(text: string, maxLength: number = 4000): string[] {
  if (text.length <= maxLength) {
    return [text]
  }

  const chunks: string[] = []
  let remaining = text

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining)
      break
    }

    // Find a good break point (sentence end, paragraph, or word boundary)
    let breakPoint = remaining.lastIndexOf(". ", maxLength)
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = remaining.lastIndexOf(" ", maxLength)
    }
    if (breakPoint === -1) {
      breakPoint = maxLength
    }

    chunks.push(remaining.slice(0, breakPoint + 1).trim())
    remaining = remaining.slice(breakPoint + 1).trim()
  }

  return chunks
}

// Re-export the streaming version as the default
export { streamTTSRealtime as speakWithTTS }
