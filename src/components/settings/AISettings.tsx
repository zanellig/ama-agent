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
import type { Config } from "./SettingsModal"

interface AISettingsProps {
  config: Config
  onConfigChange: (config: Config) => void
}

export function AISettings({ config, onConfigChange }: AISettingsProps) {
  return (
    <div className="grid gap-4">
      {/* LLM Provider Selection */}
      <div className="grid gap-2">
        <Label
          htmlFor="llm-provider"
          className="text-muted-foreground text-xs uppercase tracking-wide"
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
            className="bg-input border-border text-foreground w-full"
          >
            <SelectValue placeholder="Select provider" />
          </SelectTrigger>
          <SelectContent className="bg-card border-border">
            <SelectItem value="openai" className="text-foreground">
              OpenAI
            </SelectItem>
            <SelectItem value="gemini" className="text-foreground">
              Google Gemini
            </SelectItem>
            <SelectItem value="claude" className="text-foreground">
              Anthropic Claude
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* OpenAI API Key - Always needed for Whisper + TTS */}
      <div className="grid gap-2">
        <Label
          htmlFor="openai-key"
          className="text-muted-foreground text-xs uppercase tracking-wide"
        >
          OpenAI API Key
          <span className="text-muted-foreground/60 ml-1 normal-case">
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
          className="bg-input border-border text-foreground placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Gemini API Key */}
      <div className="grid gap-2">
        <Label
          htmlFor="gemini-key"
          className="text-muted-foreground text-xs uppercase tracking-wide"
        >
          Google Gemini API Key
          {config.llmProvider === "gemini" && (
            <span className="text-muted-foreground/60 ml-1 normal-case">
              (LLM)
            </span>
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
          className="bg-input border-border text-foreground placeholder:text-muted-foreground/50"
        />
      </div>

      {/* Anthropic API Key */}
      <div className="grid gap-2">
        <Label
          htmlFor="anthropic-key"
          className="text-muted-foreground text-xs uppercase tracking-wide"
        >
          Anthropic API Key
          {config.llmProvider === "claude" && (
            <span className="text-muted-foreground/60 ml-1 normal-case">
              (LLM)
            </span>
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
          className="bg-input border-border text-foreground placeholder:text-muted-foreground/50"
        />
      </div>
    </div>
  )
}
