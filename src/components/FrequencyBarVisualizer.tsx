import { useEffect, useRef } from "react"

interface FrequencyBarVisualizerProps {
  analyzerNode: AnalyserNode | null
  isActive: boolean
}

export function FrequencyBarVisualizer({
  analyzerNode,
  isActive,
}: FrequencyBarVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationFrameRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Handle high DPI displays
    const dpr = window.devicePixelRatio || 1
    const rect = canvas.getBoundingClientRect()
    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    ctx.scale(dpr, dpr)

    const width = rect.width
    const height = rect.height

    // Number of bars to display (1/10th of the sample rate)
    const barCount = analyzerNode
      ? Math.floor(analyzerNode.frequencyBinCount / 10)
      : 16
    const barWidth = Math.max(2, width / barCount - 2)
    const gap = 2

    // Create buffer for frequency data
    const bufferLength = analyzerNode ? analyzerNode.frequencyBinCount : 128
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw)

      // Clear canvas
      ctx.clearRect(0, 0, width, height)

      if (analyzerNode && isActive) {
        // Get frequency data
        analyzerNode.getByteFrequencyData(dataArray)

        // Sample every 10th frequency bin
        const step = 10
        let barX = (width - barCount * (barWidth + gap)) / 2 // Center the bars

        for (let i = 0; i < barCount; i++) {
          const dataIndex = i * step
          const value = dataArray[dataIndex] || 0
          const barHeight = (value / 255) * height * 0.9

          // Create gradient for each bar
          const gradient = ctx.createLinearGradient(
            0,
            height,
            0,
            height - barHeight,
          )
          gradient.addColorStop(0, "rgba(124, 92, 255, 0.8)")
          gradient.addColorStop(1, "rgba(155, 127, 255, 1)")

          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.roundRect(barX, height - barHeight, barWidth, barHeight, 2)
          ctx.fill()

          barX += barWidth + gap
        }
      } else {
        // Static bars when not active
        const staticBarCount = 16
        const staticBarWidth = Math.max(2, width / staticBarCount - 2)
        let barX = (width - staticBarCount * (staticBarWidth + gap)) / 2

        for (let i = 0; i < staticBarCount; i++) {
          // Create a subtle static pattern
          const barHeight = 4

          ctx.fillStyle = "rgba(124, 92, 255, 0.3)"
          ctx.beginPath()
          ctx.roundRect(
            barX,
            height - barHeight - 2,
            staticBarWidth,
            barHeight,
            2,
          )
          ctx.fill()

          barX += staticBarWidth + gap
        }
      }
    }

    draw()

    return () => {
      cancelAnimationFrame(animationFrameRef.current)
    }
  }, [analyzerNode, isActive])

  return (
    <canvas
      ref={canvasRef}
      className="frequency-bar-canvas"
      style={{
        width: "100%",
        height: "100%",
      }}
    />
  )
}
