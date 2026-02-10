import { supabase } from '@/integrations/supabase/client';

export interface MCPToolCallRequest {
  tool: string;
  input: Record<string, unknown>;
  githubToken?: string;
  vercelToken?: string;
  supabaseToken?: string;
  cloudflareToken?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;
  awsRegion?: string;
  stripeToken?: string;
  slackToken?: string;
  notionToken?: string;
  n8nApiKey?: string;
  n8nBaseUrl?: string;
  telegramBotToken?: string;
  googleApiKey?: string;
  alphaVantageKey?: string;
  cmcApiKey?: string;
  hfToken?: string;
  dockerHost?: string;
  dockerApiKey?: string;
  postgresUrl?: string;
  doToken?: string;
  twitterBearerToken?: string;
  linkedinToken?: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  zapierWebhookUrl?: string;
  airtableToken?: string;
  jiraEmail?: string;
  jiraApiToken?: string;
  jiraDomain?: string;
  sfInstanceUrl?: string;
  sfAccessToken?: string;
  hubspotToken?: string;
  mondayToken?: string;
  asanaToken?: string;
  discordBotToken?: string;
  trelloApiKey?: string;
  trelloToken?: string;
  serverId: string;
}

export interface MCPToolCallResult {
  ok: boolean;
  result?: unknown;
  error?: string;
}

export async function callMCPTool(req: MCPToolCallRequest): Promise<MCPToolCallResult> {
  const body: Record<string, unknown> = { tool: req.tool, input: req.input };

  switch (req.serverId) {
    case 'mcp-github': body.github_token = req.githubToken; break;
    case 'mcp-vercel': body.vercel_token = req.vercelToken; break;
    case 'mcp-supabase': body.supabase_token = req.supabaseToken; break;
    case 'mcp-cloudflare': body.cloudflare_token = req.cloudflareToken; break;
    case 'mcp-aws':
      body.aws_access_key_id = req.awsAccessKeyId;
      body.aws_secret_access_key = req.awsSecretAccessKey;
      body.aws_region = req.awsRegion || 'us-east-1';
      break;
    case 'mcp-stripe': body.stripe_token = req.stripeToken; break;
    case 'mcp-slack': body.slack_token = req.slackToken; break;
    case 'mcp-notion': body.notion_token = req.notionToken; break;
    case 'mcp-n8n':
      body.n8n_api_key = req.n8nApiKey;
      body.n8n_base_url = req.n8nBaseUrl;
      break;
    case 'mcp-telegram': body.telegram_bot_token = req.telegramBotToken; break;
    case 'mcp-google-sheets': body.google_api_key = req.googleApiKey; break;
    case 'mcp-alpha-vantage': body.alpha_vantage_key = req.alphaVantageKey; break;
    case 'mcp-coinmarketcap': body.cmc_api_key = req.cmcApiKey; break;
    case 'mcp-huggingface': body.hf_token = req.hfToken; break;
    case 'mcp-docker':
      body.docker_host = req.dockerHost;
      body.docker_api_key = req.dockerApiKey;
      break;
    case 'mcp-postgres': body.postgres_url = req.postgresUrl; break;
    case 'mcp-digitalocean': body.do_token = req.doToken; break;
    case 'mcp-twitter': body.twitter_bearer_token = req.twitterBearerToken; break;
    case 'mcp-linkedin': body.linkedin_token = req.linkedinToken; break;
    case 'mcp-twilio':
      body.twilio_account_sid = req.twilioAccountSid;
      body.twilio_auth_token = req.twilioAuthToken;
      break;
    case 'mcp-zapier': body.zapier_webhook_url = req.zapierWebhookUrl; break;
    case 'mcp-airtable': body.airtable_token = req.airtableToken; break;
    case 'mcp-jira':
      body.jira_email = req.jiraEmail;
      body.jira_api_token = req.jiraApiToken;
      body.jira_domain = req.jiraDomain;
      break;
    case 'mcp-salesforce':
      body.sf_instance_url = req.sfInstanceUrl;
      body.sf_access_token = req.sfAccessToken;
      break;
    case 'mcp-hubspot': body.hubspot_token = req.hubspotToken; break;
    case 'mcp-monday': body.monday_token = req.mondayToken; break;
    case 'mcp-asana': body.asana_token = req.asanaToken; break;
    case 'mcp-discord': body.discord_bot_token = req.discordBotToken; break;
    case 'mcp-trello':
      body.trello_api_key = req.trelloApiKey;
      body.trello_token = req.trelloToken;
      break;
    // firecrawl and perplexity use server-side env vars, no client token needed
  }

  const { data, error } = await supabase.functions.invoke(req.serverId, { body });

  if (error) {
    return { ok: false, error: error.message };
  }

  return data as MCPToolCallResult;
}
