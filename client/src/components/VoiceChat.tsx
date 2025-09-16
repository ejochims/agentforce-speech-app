import { useState, useEffect, useRef } from 'react';
import ChatHeader from './ChatHeader';
import MessageBubble from './MessageBubble';
import VoiceRecordButton from './VoiceRecordButton';
import AudioVisualizer from './AudioVisualizer';

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: string;
}

export default function VoiceChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: "Hi, I'm an AI assistant powered by Agentforce. How can I help you today?",
      isUser: false,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [isRecording, setIsRecording] = useState(false);
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isAgentTyping]);

  const handleRecordingStart = () => {
    setIsRecording(true);
    console.log('Voice recording started');
  };

  const handleRecordingStop = (audioBlob?: Blob) => {
    setIsRecording(false);
    
    if (audioBlob) {
      // Simulate speech-to-text transcription
      const simulatedTranscriptions = [
        "What's the weather like today?",
        "Can you help me with my order status?",
        "Tell me about your services",
        "How can I contact support?",
        "What are your business hours?"
      ];
      
      const userMessage = simulatedTranscriptions[Math.floor(Math.random() * simulatedTranscriptions.length)];
      
      // Add user message
      const newUserMessage: Message = {
        id: Date.now().toString(),
        text: userMessage,
        isUser: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      
      setMessages(prev => [...prev, newUserMessage]);
      
      // Simulate agent response delay
      setIsAgentTyping(true);
      setTimeout(() => {
        const agentResponses = [
          "I'd be happy to help you with that. Let me check the current information for you.",
          "That's a great question! I can assist you with finding the right solution.",
          "I understand what you're looking for. Here's what I can tell you about that.",
          "Let me help you with that request. I'll gather the relevant information.",
          "Thank you for asking! I can provide you with the details you need."
        ];
        
        const agentResponse = agentResponses[Math.floor(Math.random() * agentResponses.length)];
        
        const newAgentMessage: Message = {
          id: (Date.now() + 1).toString(),
          text: agentResponse,
          isUser: false,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        
        setMessages(prev => [...prev, newAgentMessage]);
        setIsAgentTyping(false);
      }, 2000);
    }
    
    console.log('Voice recording stopped');
  };

  const handleBack = () => {
    console.log('Back button clicked');
    // Todo: implement navigation
  };

  const handleSettings = () => {
    console.log('Settings button clicked');
    // Todo: implement settings
  };

  return (
    <div className="flex flex-col h-screen bg-background max-w-md mx-auto">
      <ChatHeader 
        agentName="Agentforce"
        isOnline={true}
        onBack={handleBack}
        onSettings={handleSettings}
      />
      
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message.text}
            isUser={message.isUser}
            timestamp={message.timestamp}
          />
        ))}
        
        {isAgentTyping && (
          <MessageBubble
            message=""
            isUser={false}
            isTyping={true}
          />
        )}
        
        <div ref={messagesEndRef} />
      </div>
      
      {/* Voice Interface */}
      <div className="p-6 border-t border-border bg-background/95 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <AudioVisualizer isActive={isRecording} />
          
          <VoiceRecordButton
            onRecordingStart={handleRecordingStart}
            onRecordingStop={handleRecordingStop}
          />
          
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            Talk to AgentForce using your voice. Hold the button to record your message.
          </p>
        </div>
      </div>
    </div>
  );
}