import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { LLMProvider } from "@/lib/llm"

export interface Config {
  whisperUrl: string
  whisperApiKey: string
  llmProvider: LLMProvider
  openaiApiKey: string
  geminiApiKey: string
  anthropicApiKey: string
}

interface KeysConfigModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: Config
  onConfigChange: (config: Config) => void
  onSave: () => void
}

export function KeysConfigModal({
  open,
  onOpenChange,
  config,
  onConfigChange,
  onSave,
}: KeysConfigModalProps) {
  const handleSave = () => {
    onSave()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-[rgba(25,25,35,0.98)] border-[rgba(255,255,255,0.1)] backdrop-blur-xl max-w-[360px] p-6"
        showCloseButton={true}
      >
        <DialogHeader>
          <DialogTitle className="text-[#f0f0f5] text-sm font-semibold tracking-wide uppercase">
            API Configuration
          </DialogTitle>
          <DialogDescription className="text-[#a0a0b0]">
            Configure your API keys to connect with AI services.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* LLM Provider Selection */}
          <div className="grid gap-2">
            <Label
              htmlFor="llm-provider"
              className="text-[#a0a0b0] text-xs uppercase tracking-wide"
            >
              LLM Provider
            </Label>
            <Select
              value={config.llmProvider}
              onValueChange={(value: LLMProvider) =>
                onConfigChange({
                  ...config,
                  llmProvider: value,
                })
              }
            >
              <SelectTrigger
                id="llm-provider"
                className="bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.1)] text-[#f0f0f5] w-full"
              >
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent className="bg-[rgba(25,25,35,0.98)] border-[rgba(255,255,255,0.1)]">
                <SelectItem value="openai" className="text-[#f0f0f5]">
                  OpenAI
                </SelectItem>
                <SelectItem value="gemini" className="text-[#f0f0f5]">
                  Google Gemini
                </SelectItem>
                <SelectItem value="claude" className="text-[#f0f0f5]">
                  Anthropic Claude
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* OpenAI API Key - Always needed for Whisper + TTS */}
          <div className="grid gap-2">
            <Label
              htmlFor="openai-key"
              className="text-[#a0a0b0] text-xs uppercase tracking-wide"
            >
              OpenAI API Key
              <span className="text-[#606070] ml-1 normal-case">
                (Whisper + TTS{config.llmProvider === "openai" ? " + LLM" : ""})
              </span>
            </Label>
            <Input
              id="openai-key"
              type="password"
              value={config.openaiApiKey}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  openaiApiKey: e.target.value,
                  whisperApiKey: e.target.value, // Keep in sync for Whisper
                })
              }
              placeholder="sk-..."
              className="bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.1)] text-[#f0f0f5] placeholder:text-[#606070]"
            />
          </div>

          {/* Gemini API Key */}
          <div className="grid gap-2">
            <Label
              htmlFor="gemini-key"
              className="text-[#a0a0b0] text-xs uppercase tracking-wide"
            >
              Google Gemini API Key
              {config.llmProvider === "gemini" && (
                <span className="text-[#606070] ml-1 normal-case">(LLM)</span>
              )}
            </Label>
            <Input
              id="gemini-key"
              type="password"
              value={config.geminiApiKey}
              onChange={(e) =>
                onConfigChange({ ...config, geminiApiKey: e.target.value })
              }
              placeholder="AI..."
              className="bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.1)] text-[#f0f0f5] placeholder:text-[#606070]"
            />
          </div>

          {/* Anthropic API Key */}
          <div className="grid gap-2">
            <Label
              htmlFor="anthropic-key"
              className="text-[#a0a0b0] text-xs uppercase tracking-wide"
            >
              Anthropic API Key
              {config.llmProvider === "claude" && (
                <span className="text-[#606070] ml-1 normal-case">(LLM)</span>
              )}
            </Label>
            <Input
              id="anthropic-key"
              type="password"
              value={config.anthropicApiKey}
              onChange={(e) =>
                onConfigChange({ ...config, anthropicApiKey: e.target.value })
              }
              placeholder="sk-ant-..."
              className="bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.1)] text-[#f0f0f5] placeholder:text-[#606070]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleSave}
            className="w-full bg-[#7C5CFF] hover:bg-[#9b7fff] text-white font-medium"
          >
            Save & Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
