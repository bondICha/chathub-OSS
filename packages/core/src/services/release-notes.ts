import { compareVersions } from 'compare-versions'
import Browser from 'webextension-polyfill'
import { getVersion } from '~utils'
// translate


export const RELEASE_NOTES = [
  {
    version: '2.18.1',
    notes: [
      'releasenote_v2181_history_copy_download',
      'releasenote_v2181_restore_error_fix',
    ],
  },
  {
    version: '2.18.0',
    notes: [
      'releasenote_v2180_deep_search',
      'releasenote_v2180_lazy_loading',
      'releasenote_v2180_restore_warning',
    ],
  },
  {
    version: '2.17.1',
    notes: [
      'releasenote_v2171_provider_chatbot_relationship',
    ],
  },
  {
    version: '2.17.0',
    notes: [
      'releasenote_v2170_settings_overhaul',
      'releasenote_v2170_retry_failed_message',
      'releasenote_v2170_btw_all_bots',
    ],
  },
  {
    version: '2.16.4',
    notes: [
      'releasenote_v2164_sidepanel_full_input',
    ],
  },
  {
    version: '2.16.2',
    notes: [
      'releasenote_v2162_openai_image_generation',
      'releasenote_v2162_pair_url_persistence',
      'releasenote_v2162_startup_selector_improvement',
      'releasenote_v2162_by_mimo_v25_pro',
    ],
  },
  {
    version: '2.16.0',
    notes: [
      'releasenote_v2160_btw_popup',
      'releasenote_v2160_chat_bubble',
    ],
  },
  {
    version: '2.15.3',
    notes: [
      'releasenote_v2153_video_input',
      'releasenote_v2153_openrouter_audio',
      'releasenote_v2153_ai_title',
      'releasenote_v2153_allinone_fix',
    ],
  },
  {
    version: '2.15.2',
    notes: [
      'releasenote_v2152_novita_models',
      'releasenote_v2152_quick_settings',
    ],
  },
  {
    version: '2.15.0',
    notes: [
      'releasenote_v2150_pdf_support',
      'releasenote_v2150_quick_settings_panel',
      'releasenote_v2150_gemini_image_improvements',
      'releasenote_v2150_provider_tooltip',
    ],
  },
  {
    version: '2.14.9',
    notes: [
      'releasenote_v2149_all_in_one_duplicate_fix',
    ],
  },
  {
    version: '2.14.8',
    notes: [
      'releasenote_v2148_all_in_one_input_isolation',
      'releasenote_v2148_provider_web_search_unify',
    ],
  },

  {
    version: '2.14.6',
    notes: [
      'releasenote_v2146_persistent_input_state',
      'releasenote_v2146_attachment_popup_enhancement',
    ],
  },
  {
    version: '2.14.5',
    notes: [
      'releasenote_v2145_history_page_refactor',
    ],
  },
  {
    version: '2.14.4',
    notes: [
      'releasenote_v2144_export_fix_and_ui_improvements',
    ],
  },
  {
    version: '2.14.1',
    notes: [
      'releasenote_v2141_replicate_gemini_fix',
    ],
  },
  {
    version: '2.14.0',
    notes: [
      'releasenote_v2140_audio_support',
    ],
  },
  {
    version: '2.13.9',
    notes: [
      'releasenote_v2139_native_web_search_tools',
      'releasenote_v2139_gemini_api_web_search_enhancements',
    ],
  },
  {
    version: '2.13.7',
    notes: [
      'releasenote_v2137_all_in_one_enhancement_fix_for_saved_chatbot_pair',
    ],
  },
  {
    version: '2.13.5',
    notes: [
      'releasenote_v2135_all_in_one_enhancement',
    ],
  },
  {
    version: '2.13.4',
    notes: [
      'releasenote_v2134_replicate_seamless_support',
    ],
  },
  {
    version: '2.13.1',
    notes: [
      'releasenote_v2131_enhanced_scroll_experience',
    ],
  },
  {
    version: '2.13.0',
    notes: [
      'releasenote_v2130_image_agent',
      'releasenote_v2130_ui_improvements',
    ],
  },
  {
    version: '2.12.6',
    notes: [
      'releasenote_v2126_openrouter_image_generation',
    ],
  },
  {
    version: '2.12.5',
    notes: [
      'releasenote_v2125_vertex_gemini_update',
    ],
  },
  {
    version: '2.12.3',
    notes: [
      'releasenote_openai_responses_image_beta',
    ],
  },
  {
    version: '2.12.2',
    notes: [
      'releasenote_v2122_model_preview_enhancement',
      'releasenote_v2122_session_restore_toggle',
      'releasenote_v2122_provider_icons',
      'releasenote_v2122_by_glm_46',
    ],
  },
  {
    version: '2.12.0',
    notes: [
      'releasenote_v2120_provider_feature',
      'releasenote_v2120_claude_sonnet_45',
      'releasenote_v2120_release_note_by_claude_sonnet_45',
    ],
  },
  {
    version: '2.11.0',
    notes: [
      'releasenote_v2110_file_attachment_support',
      'releasenote_v2110_drag_and_drop_support',
      'releasenote_v2110_pdf_support_removed',
    ],
  },
  {
    version: '2.10.11',
    notes: [
      'releasenote_v21011_fix_claude_empty_message_error',
      'releasenote_v21011_remove_image_on_history_restore',
      'releasenote_v21011_expandable_chat_input_field',
    ],
  },
  {
    version: '2.10.8',
    notes: [
      'releasenote_v2110_gemini_openai_format_and_thinking_support',
      'releasenote_v2110_model_list_api_support',
    ],
  },
  {
    version: '2.10.5',
    notes: [
      'releasenote_v2105_code_expansion_modal_enhancement',
      'releasenote_v2105_font_type_setting',
      'releasenote_v2105_this_release_note_is_made_by_grok_code',
    ],
  },
  {
    version: '2.9.0',
    notes: [
      'releasenote_v290_session_restore',
      'releasenote_v290_web_access_enhancement'
    ],
  },
  {
    version: '2.8.2',
    notes: [
      'releasenote_v282_chat_pair_feature',
      'releasenote_v282_common_system_prompt',
    ],
  },
  {
    version: '2.8.1',
    notes: [
      'releasenote_v281_url_fetch',
    ],
  },
  {
    version: '2.8.0',
    notes: [
      'releasenote_v280_vertex_claude',
      'releasenote_v280_multiple_images',
      'releasenote_v280_gemini_update',
      'releasenote_v280_markdown_improvement'    ],
  },
  {
    version: '2.7.7',
    notes: [
      'releasenote_v277_expandable_textarea',
    ],
  },
  {
    version: '2.7.5',
    notes: [
      'releasenote_v275_omnibox_search_fix',
    ],
  },
  {
    version: '2.7.4',
    notes: [
      'releasenote_v274_custom_api_endpoint_options',
      'releasenote_v274_config_system_refactor',
    ],
  },
  {
    version: '2.7.0',
    notes: [
      'releasenote_v270_omnibox_search',
      'releasenote_v270_sidebar_all_in_one_fix',
      'releasenote_v270_thinking_mode_fix',
      'releasenote_v270_add_model_button_enhancement',
      'releasenote_v270_settings_bug_fix',
    ],
  },
  {
    version: '2.6.1',
    notes: [
      'v2.6_fix_visualization',         // 見た目の調整
    ],
  },
  {
    version: '2.6.0',
    notes: [
      'v2.6_custom_model_ui',         // モデル設定UIの統一・ドロップダウン改善
      'v2.6_api_support',             // Perplexity/Bedrock固有IDなど主要APIサポート対応
      'v2.6_codeblock_improvements',  // コードブロック折り返し・ハイライト型対応
      'v2.6_misc_fixes',              // そのほか軽微な不具合修正、内部構成整理
    ],
  },
  {
    version: '2.3.0',
    notes: ['Add propaganda feature'],
  },
  {
    version: '2.3.3',
    notes: ['Propaganda UI enhancement'],
  },
  {
    version: '2.3.5',
    notes: [
      `releasenote-propaganda`,
      `releasenote-code-expand`,
    ],
  },
  {
    version: '2.3.6',
    notes: [
      `releasenote-claude3-7`
    ],
  },
  {
    version: '2.4.0',
    notes: [
      `releasenote-model-suggestion-fix`,
      `releasenote-claude-bedrock-thinking`
    ],
  },
  {
    version: '2.5.0',
    notes: [
      `releasenote-thinking-mode`,
      `releasenote-conversation-history`,
      `releasenote-icon-system`,
      `releasenote-ui-improvements`,
      `releasenote-api-template`
    ],
  },
  {
    version: '2.5.1',
    notes: [
      `releasenote-icon-fix-announcement`,
      `releasenote-thinkmode-fix`,
      `releasenote-remove-conversation-history`
    ],
  },
  {
    version: '2.5.3',
    notes: [
      `releasenote-claude-think`,
      `releasenote-perplexity-reasoning`
    ],
  },
  {
    version: '2.5.4',
    notes: [
      `releasenote-gemini-2.5-pro`
    ],
  },
  {
    version: '2.5.5',
    notes: [
      `releasenote-custom-claude-api`
    ],
  },
]

// バージョンを現在のバージョンとして記録する関数
export async function markCurrentVersionAsRead(): Promise<void> {
  const version = getVersion()
  await Browser.storage.sync.set({ lastCheckReleaseNotesVersion: version })
}

export async function checkReleaseNotes(): Promise<{version: string, notes: string[]}[]> {
  const version = getVersion()
  const { lastCheckReleaseNotesVersion } = await Browser.storage.sync.get('lastCheckReleaseNotesVersion')
  // バージョン記録の更新は行わない（markCurrentVersionAsRead関数に移動）
  if (!lastCheckReleaseNotesVersion) {
    // 初回ユーザー: 最新3バージョンのリリースノートを表示
    const initial = RELEASE_NOTES.slice(0, 3);
    return initial;
  }
  const filtered = RELEASE_NOTES
  .filter(({ version: v }) => compareVersions(v, lastCheckReleaseNotesVersion) > 0)
  return filtered;
}

// 手動でリリースノートを表示するための関数（すべてのバージョンを返す）
export function getAllReleaseNotes(): {version: string, notes: string[]}[] {
  return RELEASE_NOTES.slice(0, 10) // 最新10バージョンのみ表示
}
