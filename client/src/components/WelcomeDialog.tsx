import { Mic, KeyboardIcon, Volume2, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface WelcomeDialogProps {
  open: boolean;
  onClose: () => void;
  logoSrc: string;
}

export default function WelcomeDialog({ open, onClose, logoSrc }: WelcomeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-sm rounded-2xl" data-testid="dialog-welcome">
        <DialogHeader className="text-center items-center pb-2">
          <div className="w-16 h-16 rounded-full bg-blue-50 border border-blue-100/80 flex items-center justify-center mb-3 mx-auto">
            <img src={logoSrc} alt="Agentforce" className="w-10 h-10 object-contain" />
          </div>
          <DialogTitle className="text-xl">Welcome to Agentforce</DialogTitle>
          <DialogDescription className="text-sm text-center">
            Your AI-powered voice assistant. Here's how to get started.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Mic className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Tap to talk</p>
              <p className="text-xs text-muted-foreground">Press the mic button and speak your question</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <KeyboardIcon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Or type instead</p>
              <p className="text-xs text-muted-foreground">Tap the pencil icon to switch to text input</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Volume2 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Voice responses</p>
              <p className="text-xs text-muted-foreground">Enable voice in Settings to hear replies spoken aloud</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Hands-free mode</p>
              <p className="text-xs text-muted-foreground">Say "Hey Agentforce" to start recording — enable in Settings</p>
            </div>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button
            className="w-full rounded-full"
            onClick={onClose}
            data-testid="button-welcome-get-started"
          >
            Get Started
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
