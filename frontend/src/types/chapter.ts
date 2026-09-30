export interface PageItem {
  page_number: number;
  filename: string;
  object_key: string;
  file_size: number;
  width?: number | null;
  height?: number | null;
  md5_hash?: string | null;
  url?: string | null;
}

export interface Chapter {
  id: string;
  manga_id: string;
  chapter_number: string;
  chapter_numeric: number;
  volume?: string | null;
  title?: string;
  language: string;
  scanlation_group?: string | null;
  source: string;
  source_id?: string | null;
  pages: PageItem[];
  page_count: number;
  uploader?: string | null;
  publish_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ReadingProgress {
  manga_id: string;
  last_read_chapter_id?: string | null;
  last_read_chapter_number?: string | null;
  last_read_page: number;
  read_chapter_ids: string[];
  reading_mode: "long_strip" | "single" | "double_ltr" | "double_rtl";
  fit_mode: "width" | "height" | "original";
  updated_at?: string;
}

export interface DetectedChapter {
  folder_name: string;
  folder_path: string;
  chapter_number: string;
  chapter_numeric: number;
  volume?: string | null;
  title?: string;
  scanlation_group?: string | null;
  page_count: number;
  image_files: string[];
  is_duplicate: boolean;
  existing_chapter_id?: string | null;
}

export interface FolderScanResponse {
  folder_path: string;
  is_valid: boolean;
  message: string;
  total_folders: number;
  detected_chapters: DetectedChapter[];
  unrecognized_folders: string[];
}

export interface StorageDuplicateItem {
  chapter_id: string;
  chapter_number: string;
  chapter_title?: string | null;
  page_number: number;
  filename: string;
  object_key: string;
  file_size: number;
  url?: string | null;
}

export interface StorageDuplicateGroup {
  md5_hash: string;
  file_size: number;
  items: StorageDuplicateItem[];
}
