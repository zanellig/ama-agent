/**
 * Transcribe audio using OpenAI Whisper API directly
 */
export async function transcribeAudio(
  audioBlob: Blob,
  _whisperUrl: string, // Kept for backwards compatibility
  apiKey: string,
): Promise<string> {
  // Create FormData for multipart upload
  const formData = new FormData()

  // Append audio file with proper filename and type
  // MediaRecorder typically produces webm format
  const audioFile = new File([audioBlob], "audio.webm", {
    type: audioBlob.type || "audio/webm",
  })
  formData.append("file", audioFile)
  formData.append("model", "whisper-1")

  const response = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    },
  )

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Whisper API error: ${response.status} - ${errorText}`)
  }

  const result = await response.json()
  return result.text
}
