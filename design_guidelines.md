# Design Guidelines: Agentforce Voice Chat Mobile App

## Design Approach: Native Mobile App Reference
Drawing inspiration from modern voice-first mobile applications like iOS Voice Memos, WhatsApp voice messages, and Siri interface patterns, focusing on simplicity, accessibility, and voice-centric interactions.

## Core Design Elements

### Color Palette
**Primary Colors:**
- Brand Blue: 212 100% 50% (Salesforce-inspired primary)
- Background Dark: 222 25% 8% (Rich dark background for mobile)
- Surface Dark: 220 15% 12% (Card and component backgrounds)

**Text & UI Colors:**
- Text Primary: 0 0% 95% (High contrast white text)
- Text Secondary: 0 0% 65% (Muted text for timestamps, labels)
- Success Green: 142 76% 36% (Recording active state)
- Warning Red: 0 84% 60% (Stop recording, errors)

### Typography
- **Primary Font**: System font stack (-apple-system, BlinkMacSystemFont, 'Segoe UI')
- **Hierarchy**: 
  - Large titles: 28px, bold weight
  - Message text: 16px, regular weight
  - Timestamps/labels: 14px, medium weight
  - Button text: 16px, semibold weight

### Layout System
**Spacing Units**: Consistent use of 4px base unit (4, 8, 16, 24, 32px)
- Container padding: 16px
- Component spacing: 24px
- Button padding: 16px vertical, 24px horizontal
- Message bubbles: 12px internal padding

## Component Library

### Voice Recording Interface
- **Hold-to-Talk Button**: Large circular button (80px diameter) with gradient background
- **Recording State**: Pulsing red ring animation around button during recording
- **Audio Visualization**: Real-time waveform display above button during recording
- **Microphone Icon**: Centered white microphone glyph in button

### Message Display
- **User Messages**: Right-aligned blue bubbles with rounded corners (16px border-radius)
- **Agent Responses**: Left-aligned dark gray bubbles with subtle border
- **Timestamps**: Small gray text below each message
- **Typing Indicators**: Three-dot animation for agent responses

### Navigation & Header
- **Clean Header**: Minimal design with agent name and status
- **Back Button**: iOS-style chevron for navigation
- **Status Indicator**: Green dot for active connection

### Input Controls
- **Voice Button**: Primary CTA with hold-to-talk functionality
- **Send Button**: Secondary action for manual text input (if needed)
- **Settings**: Gear icon for configuration access

## Mobile-First Considerations

### Touch Targets
- Minimum 44px touch targets for accessibility
- Voice button prominent and easily reachable with thumb
- Generous spacing between interactive elements

### Responsive Behavior
- Full-width message containers with max-width constraints
- Keyboard-aware layout adjustments
- Safe area respect for notched devices

### Performance
- Smooth 60fps animations for recording states
- Efficient audio processing and visualization
- Optimized message rendering for scrolling

## Voice-Centric UX Patterns

### Recording Flow
1. **Idle State**: Clear call-to-action to start recording
2. **Active Recording**: Visual feedback with waveform and timer
3. **Processing**: Loading state while transcribing
4. **Confirmation**: Show transcribed text before sending

### Audio Feedback
- **Haptic Feedback**: Subtle vibration on record start/stop
- **Visual Indicators**: Color changes and animations for all states
- **Status Communication**: Clear messaging for connection/processing states

## Accessibility
- High contrast ratios (4.5:1 minimum) throughout
- Voice-over compatible with descriptive labels
- Large touch targets for users with motor difficulties
- Clear visual hierarchy with proper heading structure

## Key Interactions
- **Long Press**: Hold to record voice message
- **Release**: Stop recording and process
- **Tap**: Send processed message to Agentforce
- **Swipe**: Navigate message history
- **Pull to Refresh**: Reload conversation

This design prioritizes voice interaction while maintaining visual clarity and mobile usability, creating a seamless bridge between the user's voice input and Agentforce's AI capabilities.