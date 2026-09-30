export interface PanelResult {
  panel_id: string;
  manga_id: string;
  manga_title: string;
  chapter_id: string;
  chapter_number: string;
  volume?: string | null;
  page_number: number;
  panel_index: number;
  coords: [number, number, number, number];
  raw_text: string;
  cleaned_text: string;
  highlighted_text?: string;
  vocabulary?: Array<{
    term: string;
    lemma: string;
    pos_tag: string;
    frequency: number;
  }>;
}

export interface PanelScanStatus {
  stage: string;
  current: number;
  total: number;
  percent: number;
  message: string;
  is_scanning: boolean;
}

export interface PanelStats {
  manga_id: string;
  total_panels: number;
  total_pages_scanned: number;
  total_chapters_scanned: number;
  total_unique_words: number;
  is_scanning: boolean;
}

export interface WordMeaning {
  part_of_speech: string;
  definition: string;
  example?: string;
}

export interface WordDefinition {
  word: string;
  phonetic: string;
  audio_url: string;
  meanings: WordMeaning[];
  cached?: boolean;
}
