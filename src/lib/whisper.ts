import { createOpenAI } from "@ai-sdk/openai"
import { experimental_transcribe as transcribe } from "ai"

/**
 * Transcribe audio using OpenAI Whisper API via AI SDK
 */
export async function transcribeAudio(
  audioBlob: Blob,
  _whisperUrl: string, // Kept for backwards compatibility, unused with SDK
  apiKey: string,
): Promise<string> {
  const openai = createOpenAI({ apiKey })
  const arrayBuffer = await audioBlob.arrayBuffer()

  const result = await transcribe({
    model: openai.transcription("whisper-1"),
    audio: new Uint8Array(arrayBuffer),
  })

  return result.text
}
