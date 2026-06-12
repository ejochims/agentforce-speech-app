import { Settings, Download } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface SettingsSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  audioEnabled: boolean;
  onAudioEnabledChange: (enabled: boolean) => void;
  darkMode: boolean;
  onDarkModeChange: (enabled: boolean) => void;
  wakeWordEnabled: boolean;
  wakeWordSupported: boolean;
  onWakeWordEnabledChange: (enabled: boolean) => void;
  autoListen: boolean;
  onAutoListenChange: (enabled: boolean) => void;
  showTransparency: boolean;
  onShowTransparencyChange: (enabled: boolean) => void;
  hasTurns: boolean;
  onExportTranscript: () => void;
}

export default function SettingsSheet({
  open,
  onOpenChange,
  audioEnabled,
  onAudioEnabledChange,
  darkMode,
  onDarkModeChange,
  wakeWordEnabled,
  wakeWordSupported,
  onWakeWordEnabledChange,
  autoListen,
  onAutoListenChange,
  showTransparency,
  onShowTransparencyChange,
  hasTurns,
  onExportTranscript,
}: SettingsSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="rounded-full"
          data-testid="button-settings"
        >
          <Settings className="w-4 h-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80">
        <SheetHeader>
          <SheetTitle>Settings</SheetTitle>
          <SheetDescription>
            Customize your voice chat experience
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          <div className="flex items-center justify-between space-x-4">
            <Label htmlFor="voice-responses" className="flex flex-col space-y-1">
              <span className="text-sm font-medium">Voice Responses</span>
              <span className="text-xs text-muted-foreground">
                Speak agent replies aloud
              </span>
            </Label>
            <Switch
              id="voice-responses"
              checked={audioEnabled}
              onCheckedChange={onAudioEnabledChange}
              data-testid="toggle-voice-responses"
            />
          </div>

          <div className="flex items-center justify-between space-x-4">
            <Label htmlFor="dark-mode" className="flex flex-col space-y-1">
              <span className="text-sm font-medium">Dark Mode</span>
              <span className="text-xs text-muted-foreground">
                Switch to a darker colour scheme
              </span>
            </Label>
            <Switch
              id="dark-mode"
              checked={darkMode}
              onCheckedChange={onDarkModeChange}
              data-testid="toggle-dark-mode"
            />
          </div>

          <div className="flex items-center justify-between space-x-4">
            <Label
              htmlFor="wake-word"
              className={`flex flex-col space-y-1 ${!wakeWordSupported ? 'opacity-50' : ''}`}
            >
              <span className="text-sm font-medium">Wake Word</span>
              <span className="text-xs text-muted-foreground">
                {wakeWordSupported
                  ? "Say \"Hey Agentforce\" to start recording"
                  : 'Not supported in this browser'}
              </span>
            </Label>
            <Switch
              id="wake-word"
              checked={wakeWordEnabled}
              disabled={!wakeWordSupported}
              onCheckedChange={onWakeWordEnabledChange}
              data-testid="toggle-wake-word"
            />
          </div>

          <div className="flex items-center justify-between space-x-4">
            <Label htmlFor="auto-listen" className="flex flex-col space-y-1">
              <span className="text-sm font-medium">Auto-listen</span>
              <span className="text-xs text-muted-foreground">
                Start listening after agent finishes speaking
              </span>
            </Label>
            <Switch
              id="auto-listen"
              checked={autoListen}
              onCheckedChange={onAutoListenChange}
              data-testid="toggle-auto-listen"
            />
          </div>

          <div className="flex items-center justify-between space-x-4">
            <Label htmlFor="show-transparency" className="flex flex-col space-y-1">
              <span className="text-sm font-medium">Agent Transparency</span>
              <span className="text-xs text-muted-foreground">
                Show pipeline timing and debug info
              </span>
            </Label>
            <Switch
              id="show-transparency"
              checked={showTransparency}
              onCheckedChange={onShowTransparencyChange}
              data-testid="button-transparency"
            />
          </div>

          {hasTurns && (
            <div className="pt-2 border-t">
              <Button
                variant="outline"
                className="w-full rounded-full"
                onClick={() => { onExportTranscript(); onOpenChange(false); }}
                data-testid="button-export-transcript"
              >
                <Download className="w-4 h-4 mr-2" />
                Download Transcript
              </Button>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
