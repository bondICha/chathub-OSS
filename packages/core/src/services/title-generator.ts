import { CustomBot } from '~app/bots/custombot';
import { getUserConfig } from './user-config';
import { ChatMessageModel } from '~types';

const SESSION_NAME_SYSTEM_PROMPTS = {
  ja: `あなたの役割は、会話内容から簡潔なタイトルを日本語で生成することです。
ルール:
- 15文字以内
- タイトルのみを出力
- 引用符・句読点・装飾は不要
- 会話の核心となるトピックを捉える
- 説明や補足は一切出力しない`,
  zh: `你的任务是根据对话内容生成一个简洁的中文标题。
规则:
- 15个字以内
- 只输出标题
- 不需要引号、标点或修饰
- 抓住对话的核心主题
- 不要输出任何解释或补充`,
} as const;

// セッション中のタイトル生成用Botインスタンス（チャットBotとは独立）
let titleBot: CustomBot | null = null;
let titleBotIndex: number | null = null;

/**
 * Get or create a dedicated bot instance for title generation.
 * Reuses the same instance within a session so conversation context is preserved.
 */
function getTitleBot(botIndex: number, lang: 'ja' | 'zh'): CustomBot {
  if (titleBot && titleBotIndex === botIndex) {
    return titleBot;
  }
  titleBot = new CustomBot({
    customBotNumber: botIndex + 1,
    systemMessageOverride: SESSION_NAME_SYSTEM_PROMPTS[lang],
  });
  titleBotIndex = botIndex;
  return titleBot;
}

/**
 * Reset the title generation bot (e.g. when starting a new session)
 */
export function resetTitleBot() {
  titleBot = null;
  titleBotIndex = null;
}

/**
 * Generate a session name for a conversation using AI
 * @param allChatsMessages Messages from all chat panels (all bots)
 * @param botIndex The index of the bot to use for session name generation
 * @returns The generated session name
 */
export async function generateSessionName(
  allChatsMessages: ChatMessageModel[][],
  botIndex: number
): Promise<string> {
    const config = await getUserConfig();
    const lang = config.titleLanguage || 'ja';
    const conversationSummary = buildConversationSummary(allChatsMessages);

    const bot = getTitleBot(botIndex, lang);

    const controller = new AbortController();

    const prompt = conversationSummary;

    const stream = bot.sendMessage({
      prompt,
      signal: controller.signal,
    });

    let sessionName = '';
    for await (const chunk of stream) {
      if (chunk.text) {
        sessionName = chunk.text;
      }
    }

    // Clean up the session name
    sessionName = sessionName.trim()
      .replace(/^["'""]+|["'""]+$/g, '') // Remove surrounding quotes
      .replace(/\n.*/g, '') // Take only the first line
      .substring(0, 100); // Limit length

    if (!sessionName) {
      throw new Error('Session name generation returned empty result');
    }

    return sessionName;
}

/**
 * Build a summary of the conversation from all chat panels
 */
function buildConversationSummary(allChatsMessages: ChatMessageModel[][]): string {
  let summary = '';

  // Get the latest user message from the first chat (user message is the same across all panels)
  const firstChat = allChatsMessages[0];
  if (firstChat) {
    const userMsgs = firstChat.filter(m => m.author === 'user');
    const latestUserMsg = userMsgs[userMsgs.length - 1];
    if (latestUserMsg?.text) {
      summary += `User: ${latestUserMsg.text.substring(0, 500)}\n`;
    }
  }

  // Get the latest assistant response from all chat panels
  for (let i = 0; i < allChatsMessages.length; i++) {
    const messages = allChatsMessages[i];
    const assistantMsgs = messages.filter(m => m.author !== 'user');
    const latestAssistantMsg = assistantMsgs[assistantMsgs.length - 1];
    if (latestAssistantMsg?.text) {
      summary += `Bot ${i + 1}: ${latestAssistantMsg.text.substring(0, 300)}\n`;
    }
  }

  if (!summary) {
    throw new Error('Conversation has no messages to summarize');
  }

  return summary;
}
