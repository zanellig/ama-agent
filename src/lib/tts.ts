export type TTSVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";

export interface TTSOptions {
  voice?: TTSVoice;
  model?: "tts-1" | "tts-1-hd";
  speed?: number; // 0.25 to 4.0
}

/**
 * Stream and play TTS audio using OpenAI's Text-to-Speech API
 * Audio starts playing as chunks arrive for lower latency
 */
export async function streamTTS(
  text: string,
  apiKey: string,
  options: TTSOptions = {},
  onOutputVolume?: (volume: number) => void
): Promise<{ stop: () => void; finished: Promise<void> }> {
  const { voice = "alloy", model = "tts-1", speed = 1.0 } = options;

  // Call OpenAI TTS API with streaming
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      speed,
      response_format: "mp3", // MP3 works well for streaming
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS API error: ${response.status} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Failed to get response reader");
  }

  // Set up Web Audio API
  const audioContext = new AudioContext();
  const analyzer = audioContext.createAnalyser();
  analyzer.fftSize = 256;
  analyzer.connect(audioContext.destination);

  // Track state
  let stopped = false;
  let animationFrameId: number | null = null;
  const dataArray = new Uint8Array(analyzer.frequencyBinCount);
  
  // Queue for audio chunks
  const audioQueue: AudioBufferSourceNode[] = [];
  let nextStartTime = audioContext.currentTime;
  let isPlaying = false;

  // Volume monitoring
  const monitorVolume = () => {
    if (stopped) return;
    
    if (onOutputVolume && isPlaying) {
      analyzer.getByteTimeDomainData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      onOutputVolume(Math.min(1, rms * 4));
    }
    
    animationFrameId = requestAnimationFrame(monitorVolume);
  };

  // Cleanup function
  const cleanup = () => {
    stopped = true;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    if (onOutputVolume) {
      onOutputVolume(0);
    }
    // Stop all queued audio
    for (const source of audioQueue) {
      try {
        source.stop();
      } catch {
        // Ignore errors from already stopped sources
      }
    }
    audioQueue.length = 0;
    audioContext.close();
  };

  // Stop function
  const stop = () => {
    reader.cancel();
    cleanup();
  };

  // Start volume monitoring
  monitorVolume();

  // Collect all chunks first, then play
  // (MP3 streaming requires complete frames for decoding)
  const chunks: Uint8Array[] = [];
  
  const finished = new Promise<void>(async (resolve, reject) => {
    try {
      // Read all chunks
      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
        }
      }

      if (stopped) {
        resolve();
        return;
      }

      // Combine chunks into single buffer
      const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      // Decode and play
      const audioBuffer = await audioContext.decodeAudioData(combined.buffer);
      
      if (stopped) {
        resolve();
        return;
      }

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(analyzer);
      
      isPlaying = true;
      
      source.onended = () => {
        isPlaying = false;
        cleanup();
        resolve();
      };
      
      source.start(0);
      audioQueue.push(source);
      
    } catch (err) {
      cleanup();
      reject(err);
    }
  });

  return { stop, finished };
}

/**
 * Stream TTS with true chunk-by-chunk playback using PCM format
 * Lower latency but more complex audio handling
 */
export async function streamTTSRealtime(
  text: string,
  apiKey: string,
  options: TTSOptions = {},
  onOutputVolume?: (volume: number) => void
): Promise<{ stop: () => void; finished: Promise<void> }> {
  const { voice = "alloy", model = "tts-1", speed = 1.0 } = options;

  // Use PCM format for true streaming (requires manual audio handling)
  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: text,
      voice,
      speed,
      response_format: "pcm", // Raw PCM for streaming
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`TTS API error: ${response.status} - ${errorText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Failed to get response reader");
  }

  // PCM format: 24kHz, 16-bit, mono
  const SAMPLE_RATE = 24000;
  const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
  
  const analyzer = audioContext.createAnalyser();
  analyzer.fftSize = 256;
  analyzer.connect(audioContext.destination);

  let stopped = false;
  let animationFrameId: number | null = null;
  const dataArray = new Uint8Array(analyzer.frequencyBinCount);
  
  // Scheduling for gapless playback
  let nextStartTime = audioContext.currentTime + 0.1; // Small initial buffer
  const activeSources: AudioBufferSourceNode[] = [];

  // Volume monitoring
  const monitorVolume = () => {
    if (stopped) return;
    
    if (onOutputVolume) {
      analyzer.getByteTimeDomainData(dataArray);
      
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        const normalized = (dataArray[i] - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / dataArray.length);
      onOutputVolume(Math.min(1, rms * 4));
    }
    
    animationFrameId = requestAnimationFrame(monitorVolume);
  };

  // Cleanup
  const cleanup = () => {
    stopped = true;
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    if (onOutputVolume) {
      onOutputVolume(0);
    }
    for (const source of activeSources) {
      try { source.stop(); } catch { /* ignore */ }
    }
    activeSources.length = 0;
    audioContext.close();
  };

  const stop = () => {
    reader.cancel();
    cleanup();
  };

  monitorVolume();

  // Process PCM chunks and schedule playback
  let pendingData = new Uint8Array(0);
  const CHUNK_SIZE = 4800; // 100ms of audio at 24kHz mono 16-bit

  const scheduleChunk = (pcmData: Int16Array) => {
    if (stopped) return;

    // Convert Int16 PCM to Float32
    const floatData = new Float32Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      floatData[i] = pcmData[i] / 32768;
    }

    // Create audio buffer
    const buffer = audioContext.createBuffer(1, floatData.length, SAMPLE_RATE);
    buffer.getChannelData(0).set(floatData);

    // Create and schedule source
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(analyzer);
    
    // Ensure we don't schedule in the past
    const now = audioContext.currentTime;
    if (nextStartTime < now) {
      nextStartTime = now + 0.01;
    }
    
    source.start(nextStartTime);
    nextStartTime += buffer.duration;
    
    activeSources.push(source);
    
    // Clean up finished sources
    source.onended = () => {
      const idx = activeSources.indexOf(source);
      if (idx > -1) activeSources.splice(idx, 1);
    };
  };

  const finished = new Promise<void>(async (resolve, reject) => {
    try {
      while (!stopped) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        // Combine with pending data
        const combined = new Uint8Array(pendingData.length + value.length);
        combined.set(pendingData);
        combined.set(value, pendingData.length);

        // Process complete chunks
        let offset = 0;
        while (offset + CHUNK_SIZE * 2 <= combined.length) {
          const chunkBytes = combined.slice(offset, offset + CHUNK_SIZE * 2);
          const pcmData = new Int16Array(chunkBytes.buffer, chunkBytes.byteOffset, CHUNK_SIZE);
          scheduleChunk(pcmData);
          offset += CHUNK_SIZE * 2;
        }

        // Keep remaining bytes for next iteration
        pendingData = combined.slice(offset);
      }

      // Process remaining data
      if (pendingData.length >= 2 && !stopped) {
        const samples = Math.floor(pendingData.length / 2);
        const pcmData = new Int16Array(pendingData.buffer, pendingData.byteOffset, samples);
        scheduleChunk(pcmData);
      }

      // Wait for all audio to finish
      if (!stopped) {
        const remainingTime = nextStartTime - audioContext.currentTime;
        if (remainingTime > 0) {
          await new Promise(r => setTimeout(r, remainingTime * 1000 + 100));
        }
      }

      cleanup();
      resolve();
    } catch (err) {
      cleanup();
      reject(err);
    }
  });

  return { stop, finished };
}

/**
 * Simple text chunker for long responses
 * OpenAI TTS has a 4096 character limit
 */
export function chunkText(text: string, maxLength: number = 4000): string[] {
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    // Find a good break point (sentence end, paragraph, or word boundary)
    let breakPoint = remaining.lastIndexOf(". ", maxLength);
    if (breakPoint === -1 || breakPoint < maxLength / 2) {
      breakPoint = remaining.lastIndexOf(" ", maxLength);
    }
    if (breakPoint === -1) {
      breakPoint = maxLength;
    }

    chunks.push(remaining.slice(0, breakPoint + 1).trim());
    remaining = remaining.slice(breakPoint + 1).trim();
  }

  return chunks;
}

// Re-export the streaming version as the default
export { streamTTSRealtime as speakWithTTS };
