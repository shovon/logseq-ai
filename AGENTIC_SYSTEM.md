# Agentic System Architecture

This document explains how the agentic system works for analyzing the current page in Logseq.

## Overview

The system uses a **multi-step agentic workflow** that:
1. **Detects user intent** using AI function calling
2. **Retrieves relevant page content** if needed
3. **Enhances the user's message** with context
4. **Generates an intelligent response**

## How It Works

### Step 1: Intent Detection

When a user sends a message, the system first analyzes it to determine the user's intent using OpenAI's `generateObject` with structured output:

```typescript
// src/services/agent-orchestrator.ts
const IntentSchema = z.object({
  intent: z.enum([
    "analyze_current_page",
    "general_query", 
    "analyze_specific_page"
  ]),
  reasoning: z.string(),
  pageName: z.string().optional()
});
```

The AI model analyzes phrases like:
- "take a look at the current page" → `analyze_current_page`
- "what's this page about" → `analyze_current_page`
- "tell me about [[Project X]]" → `analyze_specific_page`
- "how do I use this?" → `general_query`

### Step 2: Page Retrieval

If the intent is `analyze_current_page` or `analyze_specific_page`, the system:

1. **Gets the current page** using Logseq's API:
   ```typescript
   const currentPage = await getCurrentPage();
   ```

2. **Retrieves page content** including:
   - All blocks from the page
   - Backlinks (other pages that reference this page)
   
   This is done via `buildPageContext()` which uses:
   - `logseq.Editor.getPageBlocksTree()` - Gets all blocks
   - `logseq.Editor.getPageLinkedReferences()` - Gets backlinks

### Step 3: Message Enhancement

The original user message is enhanced with the retrieved page context:

```typescript
enhancedMessage = `User is asking about the current page they're viewing.

Current Page: ${currentPage.name}

Page Content:
${currentPage.content}

User's Question: ${originalMessage}

Please analyze the page content and provide a helpful response...`
```

### Step 4: Response Generation

The enhanced message is sent to the main chat completion system, which:
- Uses GPT-4 to generate a response
- Streams the response back to the user
- Has full context of the page content

## Integration Points

### Chat Completion Service

The agentic workflow is integrated into `chat-completion.ts`:

```typescript
async function buildPromptWithContext(
  input: string,
  messages: Message[]
): Promise<Message[]> {
  // Automatically enhances message with page context if needed
  const { enhancedMessage } = await buildEnhancedMessage(input);
  
  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
    { role: "user", content: enhancedMessage },
  ];
}
```

This means **every user message** is automatically analyzed and enhanced if it needs page context - no special syntax required!

## Example Flow

1. **User types**: "take a look at the current page, and tell me what's it about"

2. **Intent Detection**:
   - AI detects: `intent: "analyze_current_page"`
   - Reasoning: "User explicitly asks to look at current page"

3. **Page Retrieval**:
   - System gets current page (e.g., "My Notes")
   - Retrieves all blocks and backlinks
   - Content: "This page contains notes about..."

4. **Message Enhancement**:
   ```
   User is asking about the current page they're viewing.
   Current Page: My Notes
   Page Content: [full page content]
   User's Question: take a look at the current page, and tell me what's it about
   ```

5. **Response**: AI analyzes the page content and provides a summary

## Key Features

### Automatic Detection
- No special commands needed
- Works with natural language
- Handles variations: "current page", "this page", "the page", etc.

### Multi-Shot Prompting
- Uses structured output (Zod schemas) for reliable intent detection
- Chain of reasoning: Intent → Retrieval → Enhancement → Response

### Error Handling
- Gracefully handles missing pages
- Falls back to general query if page can't be retrieved
- Provides helpful error messages

## Extending the System

### Adding New Intents

1. Add to `IntentSchema`:
```typescript
intent: z.enum([
  "analyze_current_page",
  "general_query",
  "analyze_specific_page",
  "your_new_intent"  // Add here
])
```

2. Handle in `buildEnhancedMessage()`:
```typescript
if (intent.intent === "your_new_intent") {
  // Your custom logic
}
```

### Adding More Context Sources

You can extend `buildEnhancedMessage()` to:
- Analyze multiple pages
- Include related pages
- Add graph context
- Include journal entries

## Performance Considerations

- **Intent Detection**: Uses `gpt-4o-mini` (fast, cheap) for intent detection
- **Main Response**: Uses `gpt-4` (slower, more capable) for final response
- **Caching**: Consider caching page content if same page is analyzed multiple times

## Future Enhancements

Potential improvements:
1. **Function Calling**: Use OpenAI function calling instead of structured output for more complex workflows
2. **Multi-Agent System**: Separate agents for different tasks (retrieval, analysis, synthesis)
3. **Streaming Intent**: Show user that page is being analyzed
4. **Context Window Management**: Handle very long pages intelligently
5. **Graph Traversal**: Analyze connected pages automatically

