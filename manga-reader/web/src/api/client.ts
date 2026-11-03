/**
 * Clean typed HTTP client for Manga Reader Backend API (127.0.0.1:18000).
 */

export interface UserProfile {
  user_id: string;
  email: string;
  username: string;
  display_name: string;
  role: "reader" | "admin";
  status: "active" | "locked" | "pending_verification";
  avatar_url?: string | null;
  bio?: string | null;
  reader_settings?: Record<string, any>;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserProfile;
}

export interface MangaItem {
  pool_manga_id: string;
  slug: string;
  title: string;
  alt_titles: string[];
  description: string;
  status: "ongoing" | "completed" | "hiatus" | "cancelled" | "unknown";
  content_rating: string;
  publication_demographic: string;
  cover_url?: string | null;
  chapter_count: number;
  average_rating: number;
  rating_count: number;
  view_count: number;
  is_hidden?: boolean;
  tags?: string[];
  authors?: Array<{ creator_id: string; name: string }>;
  artists?: Array<{ creator_id: string; name: string }>;
  updated_at: string;
}

export interface ChapterItem {
  pool_chapter_id: string;
  pool_manga_id: string;
  chapter_number: string;
  chapter_numeric: number;
  volume?: string | null;
  title?: string | null;
  language: string;
  page_count: number;
  view_count: number;
  is_read?: boolean;
  last_read_page_number?: number;
  is_completed?: boolean;
  publish_at?: string;
}

export interface ChapterPagesData {
  pool_chapter_id: string;
  pool_manga_id: string;
  chapter_number: string;
  title?: string;
  page_count: number;
  prev_chapter_id?: string | null;
  next_chapter_id?: string | null;
  reader_settings: {
    reading_mode: "vertical_scroll" | "single_page" | "double_page";
    reading_direction: "ltr" | "rtl";
    fit_mode: "fit_width" | "fit_height" | "original";
    background_color: "dark" | "black" | "light" | "sepia";
    preload_pages: number;
  };
  pages: Array<{
    page_uid: string;
    page_number: number;
    filename: string;
    image_url: string;
    width?: number;
    height?: number;
  }>;
}

export interface CommentItem {
  comment_id: string;
  manga_id: string;
  chapter_id?: string | null;
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  parent_comment_id?: string | null;
  content: string;
  is_spoiler: boolean;
  spoiler_locked_by_admin: boolean;
  is_edited: boolean;
  edited_at?: string | null;
  is_deleted: boolean;
  like_count: number;
  dislike_count: number;
  user_reaction?: "like" | "dislike" | null;
  created_at: string;
}

export interface ReadingListDetail {
  list_id: string;
  owner_id: string;
  name: string;
  description: string;
  visibility: string;
  manga_count: number;
  created_at: string;
  updated_at: string;
}

export interface ReportItem {
  report_id: string;
  reporter_id?: string | null;
  target_type: "user" | "manga" | "comment";
  target_id: string;
  reason: string;
  details?: string | null;
  status: "pending" | "resolved" | "dismissed";
  resolution_action?: string | null;
  created_at: string;
  resolved_at?: string | null;
}

export interface EtlPackageItem {
  pool_manga_id: string;
  title: string;
  slug: string;
  author?: string;
  artist?: string;
  status?: string;
  content_rating?: string;
  publication_demographic?: string;
  year?: string | number;
  chapter_count: number;
  page_count: number;
  total_size_bytes: number;
  pool_revision: number;
  manifest_sha256?: string;
  cover_url?: string;
  already_ingested: boolean;
  local_revision?: number;
  cdc_enabled: boolean;
  has_upstream_update: boolean;
}

export interface EtlSourcesResponse {
  datalake_pool_api: string;
  datalake_online: boolean;
  datalake_packages: EtlPackageItem[];
  local_contracts: Array<{ filename: string; pool_manga_id?: string; title?: string; already_ingested: boolean }>;
  ingested_count: number;
}

const TOKEN_KEY = "mr_access_token";
const USER_KEY = "mr_user_profile";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser(): UserProfile | null {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredAuth(token: string, user: UserProfile): void {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearStoredAuth(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  const token = getStoredToken();
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(endpoint, { ...options, headers });

  if (res.status === 401) {
    clearStoredAuth();
  }

  if (!res.ok) {
    let errorDetail = res.statusText || "Đã xảy ra lỗi kết nối";
    try {
      const errJson = await res.json();
      if (typeof errJson.detail === "string") {
        errorDetail = errJson.detail;
      } else if (Array.isArray(errJson.detail)) {
        errorDetail = errJson.detail.map((d: any) => d.msg || JSON.stringify(d)).join(", ");
      } else if (errJson.detail && typeof errJson.detail === "object") {
        errorDetail = errJson.detail.message || JSON.stringify(errJson.detail);
      } else if (errJson.message) {
        errorDetail = errJson.message;
      } else {
        errorDetail = JSON.stringify(errJson);
      }
    } catch {
      // ignore
    }
    throw new Error(errorDetail);
  }

  if (res.status === 204) {
    return {} as T;
  }

  return res.json();
}

export const api = {
  // Token and storage helpers
  getToken: getStoredToken,
  setToken: (token: string | null) => {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  },
  getCurrentUser: () => request<UserProfile>("/api/v1/users/me"),
  logout: clearStoredAuth,

  // Health
  getHealth: () => request<{ status: string; checks: Record<string, boolean> }>("/health/ready"),

  // Auth
  register: (body: any) => request<any>("/api/v1/auth/register", { method: "POST", body: JSON.stringify(body) }),
  verifyEmail: (body: any) => request<any>("/api/v1/auth/verify-email", { method: "POST", body: JSON.stringify(body) }),
  resendOtp: (email: string) => request<any>("/api/v1/auth/resend-otp", { method: "POST", body: JSON.stringify({ email }) }),
  login: async (credentials: any): Promise<AuthResponse> => {
    const data = await request<AuthResponse>("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    setStoredAuth(data.access_token, data.user);
    return data;
  },
  getMe: () => request<UserProfile>("/api/v1/users/me"),
  getUserDetail: (userId: string) => request<UserProfile>(`/api/v1/users/${userId}`),
  updateProfile: (body: any) => request<UserProfile>("/api/v1/users/me/profile", { method: "PATCH", body: JSON.stringify(body) }),
  updatePassword: (body: any) => request<any>("/api/v1/users/me/password", { method: "PUT", body: JSON.stringify(body) }),

  // Catalog & Search
  getMangas: (params: Record<string, any>) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.append(k, String(v));
    });
    return request<{ total: number; page: number; page_size: number; items: MangaItem[] }>(`/api/v1/mangas?${q.toString()}`);
  },
  searchMangas: (q: string, type: "title" | "creator" = "title") =>
    request<{ total: number; items: MangaItem[] }>(`/api/v1/mangas/search?q=${encodeURIComponent(q)}&search_type=${type}`),
  autocomplete: (q: string) =>
    request<{ items: Array<{ pool_manga_id: string; title: string; slug: string }> }>(`/api/v1/mangas/autocomplete?q=${encodeURIComponent(q)}`),
  getMangaDetail: (idOrSlug: string) => request<MangaItem & { user_reading_status?: string; user_rating?: number }>(`/api/v1/mangas/${idOrSlug}`),
  getCreatorDetail: (id: string) => request<any>(`/api/v1/creators/${id}`),

  // Recommendations
  getContentRecommendations: (mangaId: string) =>
    request<{ model: string; is_fallback?: boolean; items: MangaItem[] }>(`/api/v1/mangas/${mangaId}/recommendations/content-based`),
  getItemRecommendations: (mangaId: string) =>
    request<{ model: string; is_cold_start_fallback?: boolean; items: MangaItem[] }>(`/api/v1/mangas/${mangaId}/recommendations/item-based`),
  getUserRecommendations: () =>
    request<{ model: string; is_cold_start?: boolean; items: MangaItem[] }>("/api/v1/recommendations/user-based"),

  // Reader & Chapters
  getChapters: (mangaId: string, params: Record<string, any> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.append(k, String(v));
    });
    return request<{ manga_id: string; total: number; items: ChapterItem[] }>(`/api/v1/mangas/${mangaId}/chapters?${q.toString()}`);
  },
  getReadFirst: (mangaId: string) => request<{ chapter_id: string; chapter_number: string; page_number: number }>(`/api/v1/mangas/${mangaId}/read-first`),
  getContinueReading: (mangaId: string) => request<{ chapter_id: string; chapter_number: string; page_number: number; caught_up?: boolean }>(`/api/v1/mangas/${mangaId}/continue-reading`),
  getChapterPages: (chapterId: string) => request<ChapterPagesData>(`/api/v1/chapters/${chapterId}/pages`),
  recordProgress: (chapterId: string, body: { page_number: number; is_completed?: boolean; dwell_seconds?: number; pages_read_count?: number }) =>
    request<{ pool_chapter_id: string; last_read_page_number: number; is_completed: boolean; view_counted: boolean }>(`/api/v1/chapters/${chapterId}/progress`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateReaderSettings: (body: any) => request<any>("/api/v1/users/me/reader-settings", { method: "PUT", body: JSON.stringify(body) }),

  // Ratings & Status
  setReadingStatus: (mangaId: string, status: string) =>
    request<any>(`/api/v1/users/me/reading-status/${mangaId}`, { method: "PUT", body: JSON.stringify({ status }) }),
  deleteReadingStatus: (mangaId: string) =>
    request<any>(`/api/v1/users/me/reading-status/${mangaId}`, { method: "DELETE" }),
  getReadingHistory: () => request<any>("/api/v1/users/me/reading-history"),
  rateManga: (mangaId: string, score: number) =>
    request<any>(`/api/v1/mangas/${mangaId}/ratings`, { method: "POST", body: JSON.stringify({ score }) }),
  deleteRating: (mangaId: string) => request<any>(`/api/v1/mangas/${mangaId}/ratings`, { method: "DELETE" }),
  getRatingHistory: () => request<any>("/api/v1/users/me/rating-history"),
  reportManga: (mangaId: string, body: any) =>
    request<any>(`/api/v1/mangas/${mangaId}/reports`, { method: "POST", body: JSON.stringify(body) }),

  // Comments
  getComments: (mangaId: string, params: Record<string, any> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.append(k, String(v));
    });
    return request<{ total: number; page: number; page_size: number; items: CommentItem[] }>(`/api/v1/mangas/${mangaId}/comments?${q.toString()}`);
  },
  createComment: (mangaId: string, body: any) =>
    request<CommentItem>(`/api/v1/mangas/${mangaId}/comments`, { method: "POST", body: JSON.stringify(body) }),
  toggleCommentSpoiler: (commentId: string, is_spoiler: boolean) =>
    request<CommentItem>(`/api/v1/comments/${commentId}/spoiler`, { method: "PATCH", body: JSON.stringify({ is_spoiler }) }),
  editComment: (commentId: string, content: string) =>
    request<CommentItem>(`/api/v1/comments/${commentId}`, { method: "PUT", body: JSON.stringify({ content }) }),
  deleteComment: (commentId: string) =>
    request<any>(`/api/v1/comments/${commentId}`, { method: "DELETE" }),
  getCommentEditHistory: (commentId: string) =>
    request<{ items: Array<{ edit_id: number; previous_content: string; edited_at: string }> }>(`/api/v1/comments/${commentId}/edit-history`),
  reactComment: (commentId: string, reaction: "like" | "dislike" | "none") =>
    request<any>(`/api/v1/comments/${commentId}/reactions`, { method: "POST", body: JSON.stringify({ reaction }) }),
  reportComment: (commentId: string, body: any) =>
    request<any>(`/api/v1/comments/${commentId}/reports`, { method: "POST", body: JSON.stringify(body) }),

  // Reading Lists
  getReadingLists: () => request<{ total: number; items: ReadingListDetail[] }>("/api/v1/reading-lists"),
  createReadingList: (body: { name: string; description?: string }) =>
    request<ReadingListDetail>("/api/v1/reading-lists", { method: "POST", body: JSON.stringify(body) }),
  getReadingListDetail: (listId: string) => request<ReadingListDetail>(`/api/v1/reading-lists/${listId}`),
  updateReadingList: (listId: string, body: any) =>
    request<ReadingListDetail>(`/api/v1/reading-lists/${listId}`, { method: "PUT", body: JSON.stringify(body) }),
  deleteReadingList: (listId: string) => request<any>(`/api/v1/reading-lists/${listId}`, { method: "DELETE" }),
  mergeReadingLists: (body: any) => request<ReadingListDetail>("/api/v1/reading-lists/merge", { method: "POST", body: JSON.stringify(body) }),
  getListItems: (listId: string, params: Record<string, any> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.append(k, String(v));
    });
    return request<{ list_id: string; total: number; available_tags_in_list: string[]; items: any[] }>(`/api/v1/reading-lists/${listId}/items?${q.toString()}`);
  },
  batchAddToLists: (body: { manga_id: string; list_ids: string[]; new_list_name?: string }) =>
    request<any>("/api/v1/reading-lists/batch-add-manga", { method: "POST", body: JSON.stringify(body) }),
  removeMangaFromList: (listId: string, mangaId: string) =>
    request<any>(`/api/v1/reading-lists/${listId}/items/${mangaId}`, { method: "DELETE" }),
  getListAnalytics: (listId: string) => request<any>(`/api/v1/reading-lists/${listId}/analytics`),

  // User Stats & Activity
  getReadingAnalytics: (userId: string) => request<any>(`/api/v1/users/${userId}/reading-analytics`),

  // Admin Console
  getReports: (params: Record<string, any> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.append(k, String(v));
    });
    return request<{ total: number; items: ReportItem[] }>(`/api/v1/admin/reports?${q.toString()}`);
  },
  resolveReport: (reportId: string, payload: { action: string; note?: string }) =>
    request<any>(`/api/v1/admin/reports/${reportId}/resolve`, { method: "POST", body: JSON.stringify(payload) }),
  lockUser: (userId: string, payload: { reason: string; duration_days?: number; force_override?: boolean }) =>
    request<any>(`/api/v1/admin/users/${userId}/lock`, { method: "POST", body: JSON.stringify(payload) }),
  unlockUser: (userId: string, payload: { reason: string; force_override?: boolean }) =>
    request<any>(`/api/v1/admin/users/${userId}/unlock`, { method: "POST", body: JSON.stringify(payload) }),
  getUserActivityLogs: (userId: string) => request<any>(`/api/v1/admin/users/${userId}/activity-logs`),
  hideManga: (mangaId: string, reason: string) =>
    request<any>(`/api/v1/admin/mangas/${mangaId}/hide`, { method: "POST", body: JSON.stringify({ reason }) }),
  showManga: (mangaId: string, reason: string = "Restored by admin") =>
    request<any>(`/api/v1/admin/mangas/${mangaId}/show`, { method: "POST", body: JSON.stringify({ reason }) }),
  deleteManga: (mangaId: string, reason?: string) =>
    request<any>(`/api/v1/admin/mangas/${mangaId}`, { method: "DELETE", body: JSON.stringify({ reason }) }),
  getMangaAnalytics: (params: Record<string, any> = {}) => {
    const q = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== "") q.append(k, String(v));
    });
    return request<any>(`/api/v1/admin/analytics/mangas?${q.toString()}`);
  },
  getEtlSources: () => request<EtlSourcesResponse>("/api/v1/admin/etl/sources"),
  ingestEtlPackage: (body: { package?: any; pool_manga_id?: string; pool_manga_ids?: string[]; cdc_enabled?: boolean }) =>
    request<any>("/api/v1/admin/etl/ingest", { method: "POST", body: JSON.stringify(body) }),
  toggleMangaCdc: (mangaId: string, cdcEnabled: boolean) =>
    request<any>(`/api/v1/admin/mangas/${mangaId}/toggle-cdc`, { method: "POST", body: JSON.stringify({ cdc_enabled: cdcEnabled }) }),
  recomputeRecommendations: () => request<any>("/api/v1/admin/workers/recompute-recommendations", { method: "POST" }),
};
