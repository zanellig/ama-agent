import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { LLMProvider } from "@/lib/llm"
import { AISettings } from "./AISettings"
import { AppearanceSettings } from "./AppearanceSettings"

export interface Config {
  whisperUrl: string
  whisperApiKey: string
  llmProvider: LLMProvider
  openaiApiKey: string
  geminiApiKey: string
  anthropicApiKey: string
  darkMode?: boolean
}

// Define settings tabs - add new tabs here in alphabetical order
const SETTINGS_TABS = [
  { id: "ai", label: "AI" },
  { id: "appearance", label: "Appearance" },
] as const

type SettingsTabId = (typeof SETTINGS_TABS)[number]["id"]

interface SettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  config: Config
  onConfigChange: (config: Config) => void
  onSave: () => void
  defaultTab?: SettingsTabId
}

export function SettingsModal({
  open,
  onOpenChange,
  config,
  onConfigChange,
  onSave,
  defaultTab = "ai",
}: SettingsModalProps) {
  const handleSave = () => {
    onSave()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card border-border backdrop-blur-xl sm:max-w-[700px] p-6"
        showCloseButton={true}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground text-sm font-semibold tracking-wide uppercase">
            Settings
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Configure your application preferences.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          defaultValue={defaultTab}
          orientation="vertical"
          className="flex gap-4 min-h-[280px]"
        >
          <TabsList variant="line" className="shrink-0 w-28">
            {SETTINGS_TABS.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="justify-start text-muted-foreground data-[state=active]:text-foreground w-full"
              >
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="flex-1 min-w-0">
            <TabsContent value="ai" className="mt-0 h-full">
              <AISettings config={config} onConfigChange={onConfigChange} />
            </TabsContent>

            <TabsContent value="appearance" className="mt-0 h-full">
              <AppearanceSettings
                darkMode={config.darkMode ?? true}
                onDarkModeChange={(enabled) =>
                  onConfigChange({ ...config, darkMode: enabled })
                }
              />
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter>
          <Button
            type="button"
            onClick={handleSave}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
          >
            Save & Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
