/**
 * Custom AI Gateway for Started
 * Routes requests to OpenAI, Anthropic, or Google based on model
 * Replaces ai.gateway.lovable.dev
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { handleOptions } from './_lib/cors';
import { requireAuth } from './_lib/auth';

// API Keys from environment
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GOOGLE_AI_API_KEY = process.env.GOOGLE_AI_API_KEY;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

/**
 * Route to appropriate provider based on model name
 */
function getProvider(model: string): 'openai' | 'anthropic' | 'google' {
  const lowerModel = model.toLowerCase();
  
  if (lowerModel.includes('claude')) {
    return 'anthropic';
  }
  if (lowerModel.includes('gemini')) {
    return 'google';
  }
  // Default to OpenAI for GPT models
  return 'openai';
}

/**
 * Call OpenAI API
 */
async function callOpenAI(body: ChatRequest): Promise<Response> {
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}

/**
 * Call Anthropic API
 */
async function callAnthropic(body: ChatRequest): Promise<Response> {
  // Convert OpenAI format to Anthropic format
  const systemMessage = body.messages.find(m => m.role === 'system');
  const nonSystemMessages = body.messages.filter(m => m.role !== 'system');
  
  const anthropicBody = {
    model: body.model,
    max_tokens: body.max_tokens || 4096,
    system: systemMessage?.content || '',
    messages: nonSystemMessages.map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    })),
  };

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(anthropicBody),
  });

  // Convert Anthropic response to OpenAI format
  const data = await response.json() as any;
  
  if (!response.ok) {
    return new Response(JSON.stringify(data), { status: response.status });
  }

  const openAIFormat = {
    id: data.id,
    object: 'chat.completion',
    created: Date.now(),
    model: data.model,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: data.content[0]?.text || '',
      },
      finish_reason: data.stop_reason === 'end_turn' ? 'stop' : data.stop_reason,
    }],
    usage: {
      prompt_tokens: data.usage?.input_tokens || 0,
      completion_tokens: data.usage?.output_tokens || 0,
      total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    },
  };

  return new Response(JSON.stringify(openAIFormat), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Call Google Gemini API
 */
async function callGoogle(body: ChatRequest): Promise<Response> {
  // Map model names
  let geminiModel = body.model;
  if (!geminiModel.startsWith('gemini-')) {
    geminiModel = 'gemini-1.5-pro';
  }

  // Convert to Gemini format
  const contents = body.messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  const systemInstruction = body.messages.find(m => m.role === 'system');

  const geminiBody: any = {
    contents,
    generationConfig: {
      temperature: body.temperature ?? 0.7,
      maxOutputTokens: body.max_tokens || 4096,
    },
  };

  if (systemInstruction) {
    geminiBody.systemInstruction = { parts: [{ text: systemInstruction.content }] };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${GOOGLE_AI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(geminiBody),
  });

  const data = await response.json() as any;

  if (!response.ok) {
    return new Response(JSON.stringify(data), { status: response.status });
  }

  // Convert to OpenAI format
  const openAIFormat = {
    id: `gemini-${Date.now()}`,
    object: 'chat.completion',
    created: Date.now(),
    model: geminiModel,
    choices: [{
      index: 0,
      message: {
        role: 'assistant',
        content: data.candidates?.[0]?.content?.parts?.[0]?.text || '',
      },
      finish_reason: data.candidates?.[0]?.finishReason?.toLowerCase() || 'stop',
    }],
    usage: {
      prompt_tokens: data.usageMetadata?.promptTokenCount || 0,
      completion_tokens: data.usageMetadata?.candidatesTokenCount || 0,
      total_tokens: data.usageMetadata?.totalTokenCount || 0,
    },
  };

  return new Response(JSON.stringify(openAIFormat), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (handleOptions(req, res)) return;

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require authentication
  const user = await requireAuth(req, res);
  if (!user) return;

  try {
    const body = req.body as ChatRequest;

    if (!body.model || !body.messages) {
      return res.status(400).json({ error: 'Missing model or messages' });
    }

    const provider = getProvider(body.model);
    let response: Response;

    switch (provider) {
      case 'anthropic':
        if (!ANTHROPIC_API_KEY) {
          return res.status(500).json({ error: 'Anthropic API key not configured' });
        }
        response = await callAnthropic(body);
        break;
        
      case 'google':
        if (!GOOGLE_AI_API_KEY) {
          return res.status(500).json({ error: 'Google AI API key not configured' });
        }
        response = await callGoogle(body);
        break;
        
      default:
        if (!OPENAI_API_KEY) {
          return res.status(500).json({ error: 'OpenAI API key not configured' });
        }
        response = await callOpenAI(body);
    }

    const data = await response.json();
    return res.status(response.status).json(data);

  } catch (error) {
    console.error('AI Gateway error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
