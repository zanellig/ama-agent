/**
 * Utility functions for audio analysis
 */

/**
 * Analyze an audio blob to detect if it's completely silent
 * Returns true if the audio is silent (below threshold), false otherwise
 */
export async function isAudioSilent(
  audioBlob: Blob,
  silenceThreshold: number = 0.01,
): Promise<boolean> {
  const arrayBuffer = await audioBlob.arrayBuffer()

  // Create an offline audio context to decode the audio
  const audioContext = new AudioContext()
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)

    // Get the audio data from the first channel
    const channelData = audioBuffer.getChannelData(0)

    // Calculate RMS (Root Mean Square) of the entire audio
    let sumOfSquares = 0
    for (let i = 0; i < channelData.length; i++) {
      sumOfSquares += channelData[i] * channelData[i]
    }
    const rms = Math.sqrt(sumOfSquares / channelData.length)

    // Close the audio context
    await audioContext.close()

    // Return true if RMS is below threshold (silent)
    return rms < silenceThreshold
  } catch {
    // If we can't decode the audio, assume it's not silent to avoid skipping valid audio
    await audioContext.close()
    return false
  }
}
