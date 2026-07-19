import { ChatError } from '~utils/errors';
import { SearchResultItem } from '~services/agent/web-search/base';

export interface FetchedUrlContent {
  url: string
  content: string
}

export interface ReferenceUrl {
  url: string
  title?: string
}

export interface TextAttachment {
  name: string;
  content: string;
}

export interface ChatMessageModel {
  id: string
  author: number | 'user'
  text: string
  images?: File[]
  attachments?: TextAttachment[]  // UI表示用のテキスト添付（履歴には保存しない）
  audioFiles?: File[]  // Audio attachments (not persisted to storage)
  videoFiles?: File[]  // Video attachments (not persisted to storage)
  pdfFiles?: File[]  // PDF attachments (not persisted to storage)
  error?: ChatError
  thinking?: string
  fetchedUrls?: FetchedUrlContent[];
  searchResults?: SearchResultItem[];
  referenceUrls?: ReferenceUrl[];
}

export interface ConversationModel {
  messages: ChatMessageModel[]
}
