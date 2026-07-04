export const PROMPT_TEMPLATE = `USER'S INPUT
--------------------
Here is the user's input:

{{input}}

RESPONSE FORMAT INSTRUCTIONS
----------------------------

TOOLS
------
Assistant can use tools to look up information that may be helpful in answering the users original question. The tools are:

{{tools}}

Output a JSON markdown code snippet containing a valid JSON object in one of two formats:

**Option 1:**
Use this if you want to use a tool.
Markdown code snippet formatted in the following schema:

\`\`\`json
{
    "action": string, // The action to take. Must be one of [{{tool_names}}]
    "action_input": string // The input to the action. May be a stringified object.
}
\`\`\`

IMPORTANT: When using a tool (Option 1), respond ONLY with the JSON code snippet above. Do not include any additional text, explanations, or commentary before or after the JSON. Only the JSON code snippet should be in your response.

**Option #2:**
Use this if you want the assistant to answer USER'S INPUT directly and conversationally without using external tools. Answer with the same language user with.
Simply provide your answer as plain text without any JSON formatting.

CRITICAL RULES:
- When using a tool (Option 1): Respond with ONLY the JSON code snippet. No additional text whatsoever.
- When answering directly (Option 2): Use plain text without JSON formatting.
- Choose Option 1 only when you need to search for current information or access external resources.
- Choose Option 2 when you can answer based on your existing knowledge.

This instruction must be applied to only next answer from you.
`

/**
 * Web Search Instructions for different languages
 */
export const WEB_SEARCH_INSTRUCTIONS = {
  en: {
    title: '## 🔍 Web Search Tool',
    description: 'You have access to a web search tool with multiple providers. When you need current information, recent news, or information beyond your knowledge cutoff, use the JSON format specified above.',
    usage: `**CRITICAL RULES FOR WEB SEARCH:**
- Use concise, specific search queries
- Choose appropriate search provider: "google" for general searches, "bing_news" for recent news
- When using web search (Option 1): Respond with ONLY the JSON code snippet. No additional text whatsoever.
- Use this tool ONLY when you need current or recent information beyond your knowledge
- You can search multiple times with different keywords if needed

**Web Search JSON Format:**
\`\`\`json
{
    "action": "web_search",
    "action_input": "your search query here",
    "provider": "google"
}
\`\`\`

or for news:
\`\`\`json
{
    "action": "web_search",
    "action_input": "your news query here", 
    "provider": "bing_news"
}
\`\`\``
  },
  ja: {
    title: '## 🔍 Web検索ツール',
    description: '複数の検索プロバイダーを持つWeb検索ツールが利用できます。最新情報、最近のニュース、またはあなたの知識範囲を超える情報が必要な場合、上記で指定されたJSON形式を使用してください。',
    usage: `**Web検索の重要ルール:**
- 簡潔で具体的な検索クエリを使用してください
- 適切な検索プロバイダーを選択：一般検索には"google"、最新ニュースには"bing_news"
- Web検索使用時（オプション1）：JSONコードスニペットのみを返してください。追加テキストは一切なし。
- あなたの知識を超える最新または最近の情報が必要な場合にのみ使用
- 必要に応じて異なるキーワードで複数回検索可能
**CRITICAL RULES FOR WEB SEARCH:**
- Use concise, specific search queries
- Choose appropriate search provider: "google" for general searches, "bing_news" for recent news
- When using web search (Option 1): Respond with ONLY the JSON code snippet. No additional text whatsoever.
- Use this tool ONLY when you need current or recent information beyond your knowledge
- You can search multiple times with different keywords if needed

**Web検索JSON形式:**
\`\`\`json
{
    "action": "web_search",
    "action_input": "検索クエリをここに",
    "provider": "google"
}
\`\`\`

ニュース検索の場合:
\`\`\`json
{
    "action": "web_search",
    "action_input": "ニュース検索クエリをここに",
    "provider": "bing_news"
}
\`\`\``
  },
  zh: {
    title: '## 🔍 网络搜索工具',
    description: '您可以使用具有多个提供商的网络搜索工具。当您需要当前信息、最新新闻或超出您知识范围的信息时，请使用上面指定的JSON格式。',
    usage: `**网络搜索的重要规则:**
- 使用简洁、具体的搜索查询
- 选择合适的搜索提供商：一般搜索使用"google"，最新新闻使用"bing_news"
- 使用网络搜索时（选项1）：仅返回JSON代码片段。不要添加任何额外文本。
- 仅在需要超出您知识范围的当前或最新信息时使用此工具
- 如需要可以使用不同关键词多次搜索
**CRITICAL RULES FOR WEB SEARCH:**
- Use concise, specific search queries
- Choose appropriate search provider: "google" for general searches, "bing_news" for recent news
- When using web search (Option 1): Respond with ONLY the JSON code snippet. No additional text whatsoever.
- Use this tool ONLY when you need current or recent information beyond your knowledge
- You can search multiple times with different keywords if needed

**网络搜索JSON格式:**
\`\`\`json
{
    "action": "web_search",
    "action_input": "在此输入搜索查询",
    "provider": "google"
}
\`\`\`

新闻搜索格式:
\`\`\`json
{
    "action": "web_search",
    "action_input": "在此输入新闻查询",
    "provider": "bing_news"
}
\`\`\``
  }
} as const

/**
 * Get web search instructions for system prompt
 */
export function getWebSearchInstructions(webAccessEnabled: boolean, language: string = 'en'): string {
  if (!webAccessEnabled) {
    const offMessages = {
      en: '\n\n## 🚫 Web search: Currently turned off by user',
      ja: '\n\n## 🚫 Web サーチ: ユーザーによって現在オフになっています',
      zh: '\n\n## 🚫 网络搜索：用户当前已关闭'
    }
    
    const lang = language.toLowerCase().startsWith('zh') ? 'zh' :
                 language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
    
    return offMessages[lang as keyof typeof offMessages]
  }
  
  const lang = language.toLowerCase().startsWith('zh') ? 'zh' : 
               language.toLowerCase().startsWith('ja') ? 'ja' : 'en'
  
  const instructions = WEB_SEARCH_INSTRUCTIONS[lang as keyof typeof WEB_SEARCH_INSTRUCTIONS]
  
  return `

${instructions.title}

${instructions.description}

${instructions.usage}`
}
