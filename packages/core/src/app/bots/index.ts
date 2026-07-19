import { CustomBot } from './custombot'

// CustomBotインスタンスのレジストリ
const customBotRegistry = new Map<number, CustomBot>();

/**
 * カスタムボットのインスタンスを作成する関数
 * @param index カスタムボットのインデックス（0ベース）
 * @returns CustomBotのインスタンス
 */
export function createBotInstance(index: number) {
  // インデックスが有効範囲内かチェック（数値で0以上であること）
  if (typeof index === 'number' && !isNaN(index) && index >= 0) {
    // 既存のインスタンスがあれば再利用
    if (customBotRegistry.has(index)) {
      return customBotRegistry.get(index)!;
    }
    
    // CustomBotは1ベースのcustomBotNumberを期待するため、index + 1を渡す
    const bot = new CustomBot({ customBotNumber: index + 1 });
    customBotRegistry.set(index, bot);
    return bot;
  }

  // デフォルトとして0を使用
  const defaultIndex = 0;
  if (customBotRegistry.has(defaultIndex)) {
    return customBotRegistry.get(defaultIndex)!;
  }
  
  const bot = new CustomBot({ customBotNumber: defaultIndex + 1 });
  customBotRegistry.set(defaultIndex, bot);
  return bot;
}

/**
 * 指定したインデックスのCustomBotインスタンスを無効化
 * @param index カスタムボットのインデックス（0ベース）
 */
export function invalidateCustomBot(index: number) {
  customBotRegistry.delete(index);
}

export function getCustomBot(index: number) {
  return customBotRegistry.get(index);
}

/**
 * ボットインスタンスの型
 */
export type BotInstance = ReturnType<typeof createBotInstance>
