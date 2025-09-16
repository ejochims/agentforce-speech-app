import VoiceRecordButton from '../VoiceRecordButton';

export default function VoiceRecordButtonExample() {
  return (
    <div className="p-8 bg-background">
      <VoiceRecordButton
        onRecordingStart={() => console.log('Recording started in example')}
        onRecordingStop={(blob) => console.log('Recording stopped in example', blob)}
      />
    </div>
  );
}