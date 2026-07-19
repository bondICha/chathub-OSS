import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import BotIcon from '../BotIcon';

// =====================================================================================
// IMPORTANT: アイコン追加・変更時の注意
// =====================================================================================
// 新しいアイコンをここに追加する場合、必ず以下のファイルにも同様の変更を加えてください:
//   - src/app/components/BotIcon.tsx (iconMap の更新)
//
// =====================================================================================

// アイコンのインポート
import claudeLogo from '~/assets/logos/anthropic.png';
import baichuanLogo from '~/assets/logos/baichuan.png';
import bardLogo from '~/assets/logos/bard.svg';
import bingLogo from '~/assets/logos/bing.svg';
import chatglmLogo from '~/assets/logos/chatglm.svg';
import chatgptLogo from '~/assets/logos/chatgpt.svg';
import falconLogo from '~/assets/logos/falcon.jpeg';
import geminiLogo from '~/assets/logos/gemini.svg';
import geminiPngLogo from '~/assets/logos/gemini.png';
import grokLogo from '~/assets/logos/grok.svg';
import gurokkuLogo from '~/assets/logos/gurokku.svg';
import llamaLogo from '~/assets/logos/llama.png';
import mistralLogo from '~/assets/logos/mistral.png';
import piLogo from '~/assets/logos/pi.png';
import qianwenLogo from '~/assets/logos/qianwen.png';
import rakutenLogo from '~/assets/logos/rakuten.svg';
import vicunaLogo from '~/assets/logos/vicuna.jpg';
import wizardlmLogo from '~/assets/logos/wizardlm.png';
import xunfeiLogo from '~/assets/logos/xunfei.png';
import yiLogo from '~/assets/logos/yi.svg';
import alpacaLogo from '~/assets/logos/alpaca.png';
import deepseekLogo from '~/assets/logos/deepseek.svg';
import dollyLogo from '~/assets/logos/dolly.png';
import guanacoLogo from '~/assets/logos/guanaco.png';
import hyperbolicLogo from '~/assets/logos/hyperbolic.svg';
import koalaLogo from '~/assets/logos/koala.jpg';
import oasstLogo from '~/assets/logos/oasst.svg';
import rwkvLogo from '~/assets/logos/rwkv.png';
import stablelmLogo from '~/assets/logos/stablelm.png';
import sambaNovaLogo from '~/assets/logos/SambaNova.svg';
import huddleLLMLogo from '~/assets/logos/HuddleLLM.png';
import deepinfraLogo from '~/assets/logos/deepinfra.svg';
import sbIntuitionsLogo from '~/assets/logos/sb-intuitions.png';
import tsuzumiLogo from '~/assets/logos/tsuzumi.png';
import kimiLogo from '~/assets/logos/kimi.webp';
import tongyiLogo from '~/assets/logos/tongyi.svg';
import xaiLogo from '~/assets/logos/xai.svg';
import bytedanceLogo from '~/assets/logos/bytedance.svg';
import zhipuLogo from '~/assets/logos/zhipu.svg';
import chutesLogo from '~/assets/logos/chutes.svg';
import novitaLogo from '~/assets/logos/novita.svg';
import openrouterLogo from '~/assets/logos/openrouter.svg';
import minimaxLogo from '~/assets/logos/minimax-color.svg';
import xiaomiLogo from '~/assets/logos/xiaomi.svg';

// アイコンオプションの定義
interface IconOption {
  id: string;
  name: string;
  src: string;
}

import OpenAILogo from '../logos/OpenAILogos';
import ClaudeLogo from '../logos/ClaudeLogos';
import PerplexityLogo from '../logos/PerplexityLogos';

// 主要アイコン（先頭に表示）
const featuredIcons: IconOption[] = [
  { id: 'Anthropic.Color', name: 'Anthropic', src: claudeLogo },
  { id: 'chatgpt', name: 'ChatGPT', src: chatgptLogo },
  { id: 'deepseek', name: 'DeepSeek', src: deepseekLogo },
  { id: 'Gemini.Color', name: 'Gemini', src: geminiLogo },
  { id: 'Llama.Color', name: 'Llama', src: llamaLogo },
  { id: 'Mistral.Color', name: 'Mistral', src: mistralLogo },
  { id: 'Bing.Color', name: 'Bing', src: bingLogo },
  { id: 'Rakuten', name: 'Rakuten', src: rakutenLogo },
  { id: 'Bard.Color', name: 'Bard', src: bardLogo }
];

// OpenAIアイコンのバリエーション - 全バリエーションをまとめて表示
const openaiIcons = [
  { id: 'OpenAI.Black', name: 'OpenAI Black', style: 'black' },
  { id: 'OpenAI.Green', name: 'OpenAI Green', style: 'green' },
  { id: 'OpenAI.Purple', name: 'OpenAI Purple', style: 'purple' },
  { id: 'OpenAI.Yellow', name: 'OpenAI Yellow', style: 'yellow' },
  { id: 'OpenAI.BlackSquare', name: 'OpenAI Square', style: 'black-square' },
  { id: 'OpenAI.SimpleBlack', name: 'OpenAI Simple Black', style: 'simple-black' },
  { id: 'OpenAI.SimpleGreen', name: 'OpenAI Simple Green', style: 'simple-green' },
  { id: 'OpenAI.SimplePurple', name: 'OpenAI Simple Purple', style: 'simple-purple' },
  { id: 'OpenAI.SimpleYellow', name: 'OpenAI Simple Yellow', style: 'simple-yellow' },
];

// Claudeアイコンのバリエーション
const claudeIcons = [
  { id: 'Claude.Orange', name: 'Claude Orange', style: 'orange' },
  { id: 'Claude.OrangeSquare', name: 'Claude Orange Square', style: 'orange-square' },
  { id: 'Claude.Simple', name: 'Claude Simple (Color)', style: 'simple' },
  { id: 'Claude.SimpleBlack', name: 'Claude Simple (Black)', style: 'simple-black' },
];

// Perplexityアイコンのバリエーション
const perplexityIcons: Array<{ id: string; name: string; style: 'color' | 'square' | 'mono' | 'sonar' | 'turquoise' }> = [
  { id: 'Perplexity.Color', name: 'Perplexity Color', style: 'color' },
  { id: 'Perplexity.Square', name: 'Perplexity Square', style: 'square' },
  { id: 'Perplexity.Mono', name: 'Perplexity Mono', style: 'mono' },
  { id: 'Perplexity.Sonar', name: 'Perplexity Sonar', style: 'sonar' },
  { id: 'Perplexity.Turquoise', name: 'Perplexity Black & Turquoise', style: 'turquoise' },
];

// その他のアイコン
const otherIcons: IconOption[] = [
  { id: 'alpaca', name: 'Alpaca', src: alpacaLogo },
  { id: 'baichuan', name: 'Baichuan', src: baichuanLogo },
  { id: 'chatglm', name: 'ChatGLM', src: chatglmLogo },
  { id: 'deepinfra', name: 'DeepInfra', src: deepinfraLogo },
  { id: 'deepseek', name: 'DeepSeek', src: deepseekLogo },
  { id: 'dolly', name: 'Dolly', src: dollyLogo },
  { id: 'falcon', name: 'Falcon', src: falconLogo },
  { id: 'gemini-png', name: 'Gemini (PNG)', src: geminiPngLogo },
  { id: 'grok', name: 'Grok', src: grokLogo },
  { id: 'gurokku', name: 'Gurokku', src: gurokkuLogo },
  { id: 'guanaco', name: 'Guanaco', src: guanacoLogo },
  { id: 'huddlellm', name: 'HuddleLLM', src: huddleLLMLogo },
  { id: 'hyperbolic', name: 'Hyperbolic', src: hyperbolicLogo },
  { id: 'kimi', name: 'Kimi', src: kimiLogo },
  { id: 'koala', name: 'Koala', src: koalaLogo },
  { id: 'oasst', name: 'OASST', src: oasstLogo },
  { id: 'pi', name: 'Pi', src: piLogo },
  { id: 'qianwen', name: 'Qianwen', src: qianwenLogo },
  { id: 'rwkv', name: 'RWKV', src: rwkvLogo },
  { id: 'sambanova', name: 'SambaNova', src: sambaNovaLogo },
  { id: 'sb-intuitions', name: 'SB Intuitions', src: sbIntuitionsLogo },
  { id: 'stablelm', name: 'StableLM', src: stablelmLogo },
  { id: 'tsuzumi', name: 'Tsuzumi', src: tsuzumiLogo },
  { id: 'tongyi', name: 'Tongyi', src: tongyiLogo },
  { id: 'vicuna', name: 'Vicuna', src: vicunaLogo },
  { id: 'wizardlm', name: 'WizardLM', src: wizardlmLogo },
  { id: 'xai', name: 'xAI', src: xaiLogo },
  { id: 'bytedance', name: 'ByteDance', src: bytedanceLogo },
  { id: 'xunfei', name: 'XunFei', src: xunfeiLogo },
  { id: 'yi', name: 'Yi', src: yiLogo },
  { id: 'zhipu', name: 'Zhipu AI', src: zhipuLogo },
  { id: 'chutes', name: 'Chutes', src: chutesLogo },
  { id: 'novita', name: 'Novita', src: novitaLogo },
  { id: 'openrouter', name: 'OpenRouter', src: openrouterLogo },
  { id: 'minimax', name: 'MiniMax', src: minimaxLogo },
  { id: 'xiaomi', name: 'Xiaomi', src: xiaomiLogo }
];

interface IconSelectProps {
  value: string;
  onChange: (value: string) => void;
}

const IconSelect: FC<IconSelectProps> = ({ value, onChange }) => {
  const { t } = useTranslation();
  
  // アイコンアイテムのレンダリング
  const renderIconItem = (icon: IconOption, size = 32) => {
    // 現在選択されているかどうかを判定
    const isSelected = value === icon.id;
    
    return (
      <div
        key={icon.id}
        className={`p-2 border rounded-md flex flex-col items-center cursor-pointer bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
          isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-800 dark:border-blue-400' : 'border-gray-200 dark:border-gray-600'
        }`}
        onClick={() => onChange(icon.id)}
        title={icon.name}
      >
        <div className="flex items-center justify-center" style={{ width: size, height: size }}>
          <img src={icon.src} alt={icon.name} style={{ maxWidth: '100%', maxHeight: '100%' }} />
        </div>
        <span className="mt-1 text-xs truncate w-full text-center dark:text-gray-300">{icon.name}</span>
      </div>
    );
  };

  // OpenAIアイコンアイテムのレンダリング
  const renderOpenAIItem = (icon: { id: string; name: string; style: string }, size = 32) => {
    // 現在選択されているかどうかを判定
    const isSelected = value === icon.id;
    
    return (
      <div
        key={icon.id}
        // Added dark mode background and adjusted border/selected styles
        className={`p-2 border rounded-md flex flex-col items-center cursor-pointer bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
          isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-800 dark:border-blue-400' : 'border-gray-200 dark:border-gray-600'
        }`}
        onClick={() => onChange(icon.id)}
        title={icon.name}
      >
        <div className="flex items-center justify-center" style={{ width: size, height: size }}>
          <OpenAILogo size={size} style={icon.style} />
        </div>
        <span className="mt-1 text-xs truncate w-full text-center dark:text-gray-300">{icon.name}</span>
      </div>
    );
  };

  // Perplexityアイコンアイテムのレンダリング
  const renderPerplexityItem = (icon: { id: string; name: string; style: 'color' | 'square' | 'mono' | 'sonar' | 'turquoise' }, size = 32) => {
    // 現在選択されているかどうかを判定
    const isSelected = value === icon.id;
    
    return (
      <div
        key={icon.id}
        // Added dark mode background and adjusted border/selected styles
        className={`p-2 border rounded-md flex flex-col items-center cursor-pointer bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
          isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-800 dark:border-blue-400' : 'border-gray-200 dark:border-gray-600'
        }`}
        onClick={() => onChange(icon.id)}
        title={icon.name}
      >
        <div className="flex items-center justify-center" style={{ width: size, height: size }}>
          <PerplexityLogo size={size} style={icon.style} />
        </div>
        <span className="mt-1 text-xs truncate w-full text-center dark:text-gray-300">{icon.name}</span>
      </div>
    );
  };

  // Claudeアイコンアイテムのレンダリング
  const renderClaudeItem = (icon: { id: string; name: string; style: string }, size = 32) => {
    // 現在選択されているかどうかを判定
    const isSelected = value === icon.id;
    
    return (
      <div
        key={icon.id}
        // Added dark mode background and adjusted border/selected styles
        className={`p-2 border rounded-md flex flex-col items-center cursor-pointer bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
          isSelected ? 'border-blue-500 bg-blue-50 dark:bg-blue-800 dark:border-blue-400' : 'border-gray-200 dark:border-gray-600'
        }`}
        onClick={() => onChange(icon.id)}
        title={icon.name}
      >
        <div className="flex items-center justify-center" style={{ width: size, height: size }}>
          <ClaudeLogo size={size} style={icon.style} />
        </div>
        <span className="mt-1 text-xs truncate w-full text-center dark:text-gray-300">{icon.name}</span>
      </div>
    );
  };
  
  return (
    <div className="flex flex-col gap-4">
      {/* 主要アイコン */}
      <section className="mb-6">
        <h3 className="font-medium mb-2 text-sm text-gray-700 dark:text-gray-300">{t('Featured icons')}</h3>
        
        {/* 主要アイコングリッド */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {featuredIcons.map(icon => renderIconItem(icon))}
        </div>
      </section>

      {/* Claudeアイコン */}
      <section className="mb-6">
        <h3 className="font-medium mb-2 text-sm text-gray-700 dark:text-gray-300">{t('Claude Icons')}</h3>
        
        {/* Claudeアイコングリッド */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {claudeIcons.map(icon => renderClaudeItem(icon, 40))}
        </div>
      </section>

      {/* Perplexityアイコン */}
      <section className="mb-6">
        <h3 className="font-medium mb-2 text-sm text-gray-700 dark:text-gray-300">{t('Perplexity Icons')}</h3>
        
        {/* Perplexityアイコングリッド */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          {perplexityIcons.map(icon => renderPerplexityItem(icon, 40))}
        </div>
      </section>

      {/* OpenAIアイコン */}
      <section className="mb-6">
        <h3 className="font-medium mb-2 text-sm text-gray-700 dark:text-gray-300">{t('OpenAI Icons')}</h3>
        
        {/* OpenAIアイコングリッド（すべてのバリエーション） */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          {openaiIcons.map(icon => renderOpenAIItem(icon, 40))}
        </div>
      </section>



      {/* その他のアイコン */}
      <section>
        <h3 className="font-medium mb-2 text-sm text-gray-700 dark:text-gray-300">{t('Other icons')}</h3>
        
        {/* その他のアイコングリッド */}
        <div className="grid grid-cols-4 gap-3">
          {otherIcons.map(icon => renderIconItem(icon, 32))}
        </div>
      </section>
    </div>
  );
};

export default IconSelect;