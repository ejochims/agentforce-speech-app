# Agentforce Voice Chat Mobile App

## Overview

This is a mobile-first voice chat application that provides a Salesforce Agentforce-inspired voice interface. The application is designed as a single-page web prototype that mimics native mobile app experiences, focusing on voice interaction and real-time communication with AI agents. The app features a clean, modern UI with voice recording capabilities, real-time audio visualization, and a chat interface optimized for mobile devices.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for fast development and building
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state management and caching
- **UI Components**: Custom component library built on Radix UI primitives with shadcn/ui styling patterns
- **Styling**: Tailwind CSS with custom design system and CSS variables for theming
- **Mobile-First Design**: Responsive design optimized for mobile devices with iOS-style interactions

### Component Design System
- **Voice Interface**: Large circular recording button with pulse animations and real-time audio visualization
- **Chat Components**: Message bubbles with user/agent differentiation, typing indicators, and timestamps
- **Theme System**: Support for both light and dark modes using CSS custom properties
- **Accessibility**: ARIA labels, focus management, and reduced motion support for better accessibility

### Audio Processing
- **Voice Recording**: Browser-based MediaRecorder API for audio capture
- **Real-time Visualization**: Custom audio visualizer component with animated bars during recording
- **File Handling**: Audio blob processing for voice data transmission

### Data Layer
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Schema**: User management schema with extensible design for future voice chat features
- **Connection**: Neon Database serverless PostgreSQL for cloud deployment

### Development Tools
- **Build System**: Vite with React plugin and runtime error overlay for development
- **Type Safety**: Full TypeScript configuration with strict mode enabled
- **Code Quality**: ESLint and path mapping for clean imports
- **Development Server**: Express.js backend with hot module replacement

## External Dependencies

### UI and Component Libraries
- **Radix UI**: Comprehensive set of unstyled, accessible UI primitives for building the interface
- **Lucide React**: Icon library providing consistent iconography throughout the application
- **Class Variance Authority**: Utility for creating type-safe component variants
- **Tailwind CSS**: Utility-first CSS framework for rapid UI development

### Data and State Management
- **TanStack React Query**: Server state management, caching, and synchronization
- **Drizzle ORM**: Type-safe SQL ORM for PostgreSQL database operations
- **Zod**: Runtime type validation and schema definition

### Development and Build Tools
- **Vite**: Fast build tool and development server
- **TypeScript**: Static type checking and enhanced developer experience
- **PostCSS**: CSS processing with Autoprefixer for cross-browser compatibility

### Audio and Media
- **Browser APIs**: MediaRecorder API for voice recording and audio processing
- **React Hook Form**: Form state management with validation resolvers

### Database and Infrastructure
- **Neon Database**: Serverless PostgreSQL database platform
- **Express.js**: Backend server framework for API routes and middleware