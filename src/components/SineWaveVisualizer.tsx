import { useRef, useEffect } from 'react';

interface SineWaveVisualizerProps {
  analyzerNode: AnalyserNode | null;
  isActive: boolean;
}

export function SineWaveVisualizer({ analyzerNode, isActive }: SineWaveVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const centerY = height / 2;

    // Create buffer for audio data
    const bufferLength = analyzerNode ? analyzerNode.fftSize : 256;
    const dataArray = new Uint8Array(bufferLength);

    let phase = 0;

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);

      // Clear canvas with transparent background
      ctx.clearRect(0, 0, width, height);

      let amplitude = 10; // Base amplitude for idle animation

      if (analyzerNode && isActive) {
        // Get waveform data
        analyzerNode.getByteTimeDomainData(dataArray);
        
        // Calculate RMS volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          const normalized = (dataArray[i] - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / bufferLength);
        amplitude = Math.max(10, rms * 150); // Scale amplitude based on volume
      }

      // Draw sine wave
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(124, 92, 255, 0.9)';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // Create gradient for the wave
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, 'rgba(124, 92, 255, 0.3)');
      gradient.addColorStop(0.5, 'rgba(155, 127, 255, 1)');
      gradient.addColorStop(1, 'rgba(124, 92, 255, 0.3)');
      ctx.strokeStyle = gradient;

      const frequency = 0.02;
      const speed = 0.08;
      phase += speed;

      for (let x = 0; x <= width; x++) {
        const y = centerY + Math.sin(x * frequency + phase) * amplitude;
        
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();

      // Draw a second, fainter wave for depth
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(124, 92, 255, 0.3)';
      ctx.lineWidth = 2;

      for (let x = 0; x <= width; x++) {
        const y = centerY + Math.sin(x * frequency * 1.5 + phase * 0.7) * (amplitude * 0.6);
        
        if (x === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      }

      ctx.stroke();
    };

    draw();

    return () => {
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [analyzerNode, isActive]);

  return (
    <canvas
      ref={canvasRef}
      className="sine-wave-canvas"
      style={{
        width: '100%',
        height: '80px',
      }}
    />
  );
}
