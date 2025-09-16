import ChatHeader from '../ChatHeader';

export default function ChatHeaderExample() {
  return (
    <div className="bg-background">
      <ChatHeader
        agentName="Agentforce"
        isOnline={true}
        onBack={() => console.log('Back clicked')}
        onSettings={() => console.log('Settings clicked')}
      />
    </div>
  );
}