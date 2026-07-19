import { searchRelatedContext } from './web-search';
import { AnwserPayload } from '~app/bots/abstract-bot';
import Browser from 'webextension-polyfill';
import { htmlToText } from '~app/utils/html-utils';
import { getLanguage } from '~services/storage/language';

// Import i18n modules (new multilang format: { key: { en, ja, 'zh-CN', 'zh-TW' } })
import chatModule from '~app/i18n/locales/chat.json';

type LangCode = 'en' | 'ja' | 'zh-CN' | 'zh-TW';
type MultiLangEntry = Record<LangCode, string>;

const allModules: Record<string, MultiLangEntry> = {
  ...chatModule as unknown as Record<string, MultiLangEntry>,
};

function getLocalizedText(key: string, language: string = 'en', replacements?: Record<string, string>): string {
  const entry = allModules[key];
  let text = entry
    ? (entry[language as LangCode] ?? entry['en'] ?? key)
    : key;

  if (replacements) {
    Object.entries(replacements).forEach(([placeholder, value]) => {
      text = text.replace(new RegExp(`\\{\\{${placeholder}\\}\\}`, 'g'), value);
    });
  }

  return text;
}

function buildToolUsingPrompt(input: string) {
  // Web search指示はsystem promptに移行
  return `${input}`
}

function buildPromptWithContext(input: string, context: string, language?: string) {
  if (!language) {
    language = getLanguage() || 'en';
  }

  if (!context) {
    return `${getLocalizedText('agent_question_label', language)} ${input}`
  }
  
  const contextPrompt = getLocalizedText('agent_context_prompt', language);
  const questionLabel = getLocalizedText('agent_question_label', language);
  const contextLabel = getLocalizedText('agent_context_label', language);
  
  return `${contextPrompt}\n\n${contextLabel} """${context}"""\n\n${questionLabel} ${input}`
}


function extractJsonPayload(text: string): { action: string; action_input: string; provider?: string } | null {
  // Strict mode: Only accept pure JSON or JSON in code blocks with minimal extra content
  
  // First, try to parse the text as JSON directly
  try {
    const trimmed = text.trim();
    const parsed = JSON.parse(trimmed);
    if (parsed.action && parsed.action_input) {
      return { 
        action: parsed.action, 
        action_input: parsed.action_input,
        provider: parsed.provider 
      };
    }
  } catch (e) {
    // If direct parsing fails, check for code blocks
  }

  // Look for JSON in code blocks (both ```json``` and ``` patterns)
  const codeBlockMatches = [
    text.match(/```json\s*([\s\S]*?)\s*```/),
    text.match(/```\s*([\s\S]*?)\s*```/)
  ];

  for (const match of codeBlockMatches) {
    if (match) {
      try {
        const jsonContent = match[1].trim();
        const parsed = JSON.parse(jsonContent);
        if (parsed.action && parsed.action_input) {
          // Strict check: ensure there's no significant extra content after the code block
          const afterCodeBlock = text.split(match[0])[1];
          if (afterCodeBlock && afterCodeBlock.trim().length > 50) {
            console.log('⚠️ Agent: Rejecting response - contains significant content after JSON code block');
            return null; // Reject if there's substantial extra content
          }
          
          return { 
            action: parsed.action, 
            action_input: parsed.action_input,
            provider: parsed.provider
          };
        }
      } catch (e) {
        // Continue to next pattern
      }
    }
  }

  return null;
}

async function* execute(
  input: string,
  llm: (prompt: string, rawUserInput: string) => AsyncGenerator<AnwserPayload>,
  signal?: AbortSignal,
): AsyncGenerator<AnwserPayload> {
  // Get user's language preference
  const language = getLanguage() || 'en';
  let prompt = buildToolUsingPrompt(input)
  let searchCount = 0;
  const maxSearches = 3; // 最大検索回数
  let allSearchResults: any[] = [];
  let allContents: string[] = [];

  while (searchCount < maxSearches) {
    let llmOutputText = '';
    let hasYieldedContent = false;
    
    for await (const payload of llm(prompt, input)) {
      llmOutputText = payload.text;
      // Stream content to UI
      if (payload.text && payload.text.length > 0) {
        yield payload;
        hasYieldedContent = true;
      }
    }

    const parsedJson = extractJsonPayload(llmOutputText);

    if (!parsedJson) {
      // No JSON found, treat as final answer
      if (!hasYieldedContent) {
        yield { text: llmOutputText };
      }
      return;
    }

    if (parsedJson.action === 'web_search') {
      searchCount++;
      const actionInput = parsedJson.action_input;
      const provider = parsedJson.provider || 'google'; // デフォルトはgoogle
      
      let searchResults: any[] = [];
      
      try {
        searchResults = await searchRelatedContext(actionInput, signal, provider);
        
        if (searchResults.length === 0) {
          const emptyResultsMessage = getLocalizedText('agent_empty_search_results', language, { 
            query: actionInput, 
            provider: provider 
          });
          yield { text: '', thinking: emptyResultsMessage, searchResults: [] };
          // AIには簡潔な情報を渡すために空の結果として処理を続行
        } else {
          yield { text: '', searchResults };
        }
      } catch (error) {
        const errorMessage = `❌ 検索エラーが発生しました\nクエリ: "${actionInput}"\nプロバイダー: ${provider}\nエラー: ${error instanceof Error ? error.message : '不明なエラー'}\n\nネットワーク接続や検索プロバイダーの問題の可能性があります。`;
        yield { text: errorMessage };
        searchResults = []; // エラー時は空配列
      }

      const actualResults = searchResults;
      allSearchResults.push(...actualResults);

      // Deduplicate URLs while preserving provider information
      const uniqueUrls = new Set<string>();
      const uniqueResults = actualResults.filter((item: any) => {
        if (uniqueUrls.has(item.link)) {
          return false;
        }
        uniqueUrls.add(item.link);
        return true;
      });

      let fullContents: string[] = [];
      
      if (actualResults.length === 0) {
        // 検索結果が空の場合、AIに伝える情報
        fullContents = [`検索結果が空白でした。クエリ: "${actionInput}" (${provider})`];
      } else {
        fullContents = await Promise.all(
          uniqueResults.map(async (item) => {
            try {
              const response = await Browser.runtime.sendMessage({
                type: 'FETCH_URL',
                url: item.link,
              }) as { success: boolean, content?: string };
              if (response.success && response.content) {
                return `Content from ${item.link}:\n\n${htmlToText(response.content)}`;
              }
              return `Could not fetch content from ${item.link}`;
            } catch (error) {
              console.error(`Error fetching content for ${item.link}:`, error);
              return `Error fetching content from ${item.link}`;
            }
          })
        );
      }
      
      allContents.push(...fullContents);
      
      // 次の検索のために、これまでの検索結果を含めたプロンプトを構築
      const context = `${allContents.join('\n\n')}`;
      const promptWithContext = buildPromptWithContext(input, context, language);
      
      if (searchCount < maxSearches) {
        // まだ検索可能な場合は、継続検索の指示を追加
        const continueSearchInstruction = getLocalizedText('agent_continue_search_instruction', language);
        prompt = `${continueSearchInstruction}\n\n${promptWithContext}`;
      } else {
        // 最大検索回数に達した場合は最終回答を生成
        const finalInstruction = getLocalizedText('agent_final_instruction', language);
        prompt = `${finalInstruction}\n\n${promptWithContext}`;
        
        // 最終回答をストリーミングで表示
        for await (const payload of llm(prompt, input)) {
          yield payload;
        }
        return;
      }
    } else {
      // 検索以外のアクション、または未知のアクション
      if (parsedJson.action !== 'web_search') {
        throw new Error(`Unexpected agent action: ${parsedJson.action}`);
      }
    }
  }

  // ここに到達することは通常ありませんが、安全のため
  const context = `${allContents.join('\n\n')}`;
  const promptWithContext = buildPromptWithContext(input, context, language);
  const finalInstruction = getLocalizedText('agent_final_instruction', language);
  prompt = `${finalInstruction}\n\n${promptWithContext}`;
  
  // 最終回答をストリーミングで表示
  for await (const payload of llm(prompt, input)) {
    yield payload;
  }
}

export { execute }
