/**
 * Transcribe audio using OpenAI Whisper API or compatible endpoint
 */
export async function transcribeAudio(
  audioBlob: Blob,
  whisperUrl: string,
  apiKey: string
): Promise<string> {
  const formData = new FormData();
  formData.append("file", audioBlob, "audio.webm");
  formData.append("model", "whisper-1");

  const response = await fetch(whisperUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API error: ${response.status} - ${errorText}`);
  }

  const data = await response.json();
  return data.text;
}
