import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

interface AppearanceSettingsProps {
  darkMode: boolean
  onDarkModeChange: (enabled: boolean) => void
}

export function AppearanceSettings({
  darkMode,
  onDarkModeChange,
}: AppearanceSettingsProps) {
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <Label
          htmlFor="dark-mode"
          className="text-muted-foreground text-xs uppercase tracking-wide"
        >
          Dark Mode
        </Label>
        <Switch
          id="dark-mode"
          checked={darkMode}
          onCheckedChange={onDarkModeChange}
        />
      </div>
    </div>
  )
}
