import { useState } from 'react';
import { Mic, Phone, Settings, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import VoiceRecordButton from './VoiceRecordButton';
import AudioVisualizer from './AudioVisualizer';
import agentforceLogo from '@assets/agentforce logo_1758045885910.png';

export default function VoiceChat() {
  const [isRecording, setIsRecording] = useState(false);

  const handleRecordingStart = () => {
    setIsRecording(true);
    console.log('Voice recording started');
  };

  const handleRecordingStop = (audioBlob?: Blob) => {
    setIsRecording(false);
    console.log('Voice recording stopped', audioBlob);
    // Todo: Process audio and send to Agentforce API
  };

  return (
    <div className="min-h-screen bg-background">
      {/* iOS-style Status Bar Area */}
      <div className="h-12"></div>
      
      {/* Header */}
      <div className="text-center py-6">
        <div className="flex items-center justify-center gap-3 mb-2">
          <img 
            src={agentforceLogo} 
            alt="Agentforce" 
            className="w-10 h-10 object-contain"
            data-testid="img-header-logo"
          />
          <h1 className="text-2xl font-semibold text-primary" data-testid="text-agentforce-title">
            Agentforce
          </h1>
        </div>
      </div>

      {/* Main Voice Interface Card */}
      <div className="px-6 pb-8">
        <div className="bg-card border border-card-border rounded-3xl p-8 mx-auto max-w-sm shadow-sm">
          {/* Agentforce Logo */}
          <div className="flex justify-center mb-6">
            <img 
              src={agentforceLogo} 
              alt="Agentforce" 
              className="w-20 h-20 object-contain"
              data-testid="img-agentforce-logo"
            />
          </div>

          {/* Title and Instructions */}
          <div className="text-center mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-2" data-testid="text-main-title">
              Talk to AgentForce
            </h2>
            <p className="text-sm text-muted-foreground" data-testid="text-instructions">
              Hold the button below to talk to AgentForce
            </p>
          </div>

          {/* Audio Visualizer */}
          <div className="mb-6">
            <AudioVisualizer isActive={isRecording} height={32} />
          </div>

          {/* Main Voice Button */}
          <div className="flex justify-center mb-6">
            <VoiceRecordButton
              onRecordingStart={handleRecordingStart}
              onRecordingStop={handleRecordingStop}
            />
          </div>

        </div>
      </div>

      {/* Bottom Action Buttons */}
      <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2">
        <div className="flex items-center gap-4">
          <Button
            size="icon"
            variant="destructive"
            className="w-12 h-12 rounded-full"
            data-testid="button-end-call"
            onClick={() => console.log('End call clicked')}
          >
            <Phone className="w-5 h-5" />
          </Button>

          <Button
            size="icon"
            variant="secondary"
            className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 text-white"
            data-testid="button-mute"
            onClick={() => console.log('Mute clicked')}
          >
            <Mic className="w-5 h-5" />
          </Button>

          <Button
            size="icon"
            className="w-12 h-12 rounded-full"
            data-testid="button-more"
            onClick={() => console.log('More options clicked')}
          >
            <Download className="w-5 h-5" />
          </Button>
        </div>
      </div>

      {/* Bottom Tab Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background border-t border-border">
        <div className="flex justify-around py-2 max-w-md mx-auto">
          <Button 
            variant="ghost" 
            className="flex flex-col items-center gap-1 py-3 px-4"
            data-testid="button-tab-download"
          >
            <Download className="w-5 h-5 text-primary" />
            <span className="text-xs text-muted-foreground">Download</span>
          </Button>
          
          <Button 
            variant="ghost" 
            className="flex flex-col items-center gap-1 py-3 px-4"
            data-testid="button-tab-history"
          >
            <div className="w-5 h-5 border-b-2 border-foreground"></div>
            <span className="text-xs text-foreground font-medium">History</span>
          </Button>
          
          <Button 
            variant="ghost" 
            className="flex flex-col items-center gap-1 py-3 px-4"
            data-testid="button-tab-settings"
          >
            <Settings className="w-5 h-5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Settings</span>
          </Button>
        </div>
      </div>
    </div>
  );
}