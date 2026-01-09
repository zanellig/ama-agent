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

interface Config {
  whisperUrl: string
  whisperApiKey: string
  llmProvider: LLMProvider
  llmApiKey: string
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
        className="bg-[rgba(25,25,35,0.98)] border-[rgba(255,255,255,0.1)] backdrop-blur-xl max-w-[360px]"
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

        <div className="grid gap-4 py-2">
          {/* Whisper API Key */}
          <div className="grid gap-2">
            <Label
              htmlFor="whisper-key"
              className="text-[#a0a0b0] text-xs uppercase tracking-wide"
            >
              Whisper API Key
            </Label>
            <Input
              id="whisper-key"
              type="password"
              value={config.whisperApiKey}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  whisperApiKey: e.target.value,
                })
              }
              placeholder="sk-..."
              className="bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.1)] text-[#f0f0f5] placeholder:text-[#606070]"
            />
          </div>

          {/* LLM Provider */}
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
                <SelectItem value="claude" className="text-[#f0f0f5]">
                  Claude
                </SelectItem>
                <SelectItem value="gemini" className="text-[#f0f0f5]">
                  Gemini
                </SelectItem>
                <SelectItem value="perplexity" className="text-[#f0f0f5]">
                  Perplexity
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* LLM API Key */}
          <div className="grid gap-2">
            <Label
              htmlFor="llm-key"
              className="text-[#a0a0b0] text-xs uppercase tracking-wide"
            >
              LLM API Key
            </Label>
            <Input
              id="llm-key"
              type="password"
              value={config.llmApiKey}
              onChange={(e) =>
                onConfigChange({ ...config, llmApiKey: e.target.value })
              }
              placeholder="API key"
              className="bg-[rgba(0,0,0,0.3)] border-[rgba(255,255,255,0.1)] text-[#f0f0f5] placeholder:text-[#606070]"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
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
