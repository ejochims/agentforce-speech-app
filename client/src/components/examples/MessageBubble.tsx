import MessageBubble from '../MessageBubble';

export default function MessageBubbleExample() {
  return (
    <div className="p-8 bg-background space-y-4 max-w-md">
      <MessageBubble
        message="Hello! Can you help me with my account settings?"
        isUser={true}
        timestamp="10:30 AM"
      />
      
      <MessageBubble
        message="I'd be happy to help you with your account settings. What specific changes would you like to make?"
        isUser={false}
        timestamp="10:31 AM"
      />
      
      <MessageBubble
        message=""
        isUser={false}
        isTyping={true}
      />
    </div>
  );
}