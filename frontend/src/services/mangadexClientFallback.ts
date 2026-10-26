import type {
	ReleasePage,
	SourceRelease,
	SourceWork,
} from "../types/datasource";

const MANGADEX_API_BASE = "https://api.mangadex.org";
const MANGADEX_UPLOADS_BASE = "https://uploads.mangadex.org";

export interface MangadexChapterItem {
	id: string;
	chapter: string;
	title: string;
	volume: string | null;
	group_id: string;
	group_name: string;
	uploader: string | null;
	uploader_id: string | null;
	publish_at: string | null;
	readable_at: string | null;
	created_at: string | null;
	updated_at: string | null;
	pages: number;
	version: number;
	language: string;
}

export interface MangadexSearchResult {
	id: string;
	title: string;
	description: string;
	status?: string | null;
	year?: string | number | null;
	author?: string | null;
	cover_url?: string | null;
	content_rating?: string | null;
}

interface MangaDexRelationship {
	id: string;
	type: string;
	attributes?: {
		name?: string;
		fileName?: string;
		username?: string;
		[key: string]: unknown;
	};
}

interface MangaDexTag {
	id: string;
	type: string;
	attributes?: {
		name?: Record<string, string>;
	};
}

/**
 * Extracts a MangaDex UUID from either a full URL or a raw UUID string.
 */
export function extractMangadexId(urlOrId: string): string | null {
	if (!urlOrId) return null;
	const trimmed = urlOrId.trim();

	// Match 36-char UUID format (8-4-4-4-12)
	const uuidMatch = trimmed.match(
		/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
	);
	return uuidMatch ? uuidMatch[0].toLowerCase() : null;
}

/**
 * Client-Side Browser Fallback: Fetches Manga Details directly from MangaDex API.
 * This is triggered ONLY when all backend fetch mechanisms (HTTP, Auth, Server Playwright) fail.
 */
export async function fetchMangadexWorkClientSide(
	urlOrId: string,
): Promise<SourceWork> {
	const mangadexId = extractMangadexId(urlOrId);
	if (!mangadexId) {
		throw new Error(
			`Không thể trích xuất MangaDex UUID hợp lệ từ "${urlOrId}"`,
		);
	}

	const url = `${MANGADEX_API_BASE}/manga/${mangadexId}?includes[]=author&includes[]=artist&includes[]=cover_art`;
	const resp = await fetch(url, {
		method: "GET",
		headers: {
			Accept: "application/json",
		},
	});

	if (!resp.ok) {
		throw new Error(
			`MangaDex API returned HTTP ${resp.status} (${resp.statusText})`,
		);
	}

	const data = await resp.json();
	const manga = data?.data;
	if (!manga) {
		throw new Error(
			"Dữ liệu MangaDex không hợp lệ hoặc tác phẩm không tồn tại",
		);
	}

	const attr = manga.attributes || {};
	const relationships: MangaDexRelationship[] = manga.relationships || [];

	// Extract title (prefer en, then ja, or first available)
	const titleObj = attr.title || {};
	const title =
		titleObj.en ||
		titleObj["ja-ro"] ||
		titleObj.ja ||
		Object.values(titleObj)[0] ||
		"Unknown Title";

	// Extract alternative titles
	const altTitles: string[] = [];
	if (Array.isArray(attr.altTitles)) {
		for (const alt of attr.altTitles) {
			for (const val of Object.values(alt)) {
				if (typeof val === "string" && val.trim()) {
					altTitles.push(val.trim());
				}
			}
		}
	}

	// Extract description (prefer en, then first available)
	const descObj = attr.description || {};
	const description =
		descObj.en || descObj.vi || (Object.values(descObj)[0] as string) || "";

	// Extract Author, Artist, Cover
	let author: string | null = null;
	let artist: string | null = null;
	let coverFileName: string | null = null;

	for (const rel of relationships) {
		if (rel.type === "author" && rel.attributes?.name) {
			author = rel.attributes.name;
		} else if (rel.type === "artist" && rel.attributes?.name) {
			artist = rel.attributes.name;
		} else if (rel.type === "cover_art" && rel.attributes?.fileName) {
			coverFileName = rel.attributes.fileName;
		}
	}

	const coverUrl = coverFileName
		? `${MANGADEX_UPLOADS_BASE}/covers/${mangadexId}/${coverFileName}.512.jpg`
		: null;

	// Extract external links / IDs
	const externalIds: Record<string, string> = {
		mangadex: mangadexId,
	};
	if (attr.links && typeof attr.links === "object") {
		for (const [key, val] of Object.entries(attr.links)) {
			if (typeof val === "string") {
				externalIds[key.toLowerCase()] = val;
			}
		}
	}

	// Fetch available languages in background
	let availableLanguages: string[] = ["en"];
	try {
		availableLanguages = await fetchMangadexLanguagesClientSide(mangadexId);
	} catch {
		availableLanguages = ["en", "vi", "ja"];
	}

	const tags =
		(attr.tags as MangaDexTag[] | undefined)
			?.map((t) => t.attributes?.name?.en)
			.filter((name): name is string => Boolean(name)) || [];

	const sourceWork: SourceWork = {
		source: "mangadex",
		source_work_id: mangadexId,
		title: String(title),
		url: `https://mangadex.org/title/${mangadexId}`,
		alt_titles: altTitles,
		author,
		artist,
		cover_url: coverUrl,
		status: attr.status || null,
		year: attr.year ? String(attr.year) : null,
		description: String(description),
		content_rating: attr.contentRating || null,
		publication_demographic: attr.publicationDemographic || null,
		original_language: attr.originalLanguage || null,
		available_languages:
			availableLanguages.length > 0 ? availableLanguages : ["en"],
		external_ids: externalIds,
		extra_metadata: {
			last_volume: attr.lastVolume,
			last_chapter: attr.lastChapter,
			tags,
			client_fallback: true,
		},
	};

	return sourceWork;
}

/**
 * Client-Side Browser Fallback: Fetches available translated languages for a manga directly from MangaDex.
 */
export async function fetchMangadexLanguagesClientSide(
	mangadexId: string,
): Promise<string[]> {
	const params = new URLSearchParams({
		limit: "500",
		offset: "0",
		includeFutureUpdates: "0",
	});
	params.append("contentRating[]", "safe");
	params.append("contentRating[]", "suggestive");
	params.append("contentRating[]", "erotica");
	params.append("contentRating[]", "pornographic");

	const resp = await fetch(
		`${MANGADEX_API_BASE}/manga/${mangadexId}/feed?${params.toString()}`,
		{
			method: "GET",
			headers: { Accept: "application/json" },
		},
	);

	if (!resp.ok) {
		return ["en"];
	}

	const data = await resp.json();
	const langs = new Set<string>();
	if (Array.isArray(data?.data)) {
		for (const item of data.data) {
			const lang = item.attributes?.translatedLanguage;
			if (lang) langs.add(lang);
		}
	}

	return Array.from(langs);
}

/**
 * Client-Side Browser Fallback: Fetches chapter releases directly from MangaDex API.
 * This is triggered ONLY when all backend fetch mechanisms fail.
 */
export async function fetchMangadexReleasesClientSide(
	workId: string,
	lang = "en",
	limit = 500,
	offset = 0,
): Promise<ReleasePage> {
	const cleanWorkId = extractMangadexId(workId) || workId;
	const params = new URLSearchParams({
		limit: String(Math.min(limit, 500)),
		offset: String(offset),
		"order[chapter]": "asc",
		includeFutureUpdates: "0",
	});

	params.append("translatedLanguage[]", lang);
	params.append("contentRating[]", "safe");
	params.append("contentRating[]", "suggestive");
	params.append("contentRating[]", "erotica");
	params.append("contentRating[]", "pornographic");
	params.append("includes[]", "scanlation_group");
	params.append("includes[]", "user");

	const resp = await fetch(
		`${MANGADEX_API_BASE}/manga/${cleanWorkId}/feed?${params.toString()}`,
		{
			method: "GET",
			headers: { Accept: "application/json" },
		},
	);

	if (!resp.ok) {
		throw new Error(
			`MangaDex Feed API returned HTTP ${resp.status} (${resp.statusText})`,
		);
	}

	const data = await resp.json();
	const total = data.total || 0;
	const feedItems = Array.isArray(data.data) ? data.data : [];

	const items: SourceRelease[] = [];

	for (const chap of feedItems) {
		const attr = chap.attributes || {};
		// Skip external links
		if (attr.externalUrl) continue;

		const groupIds: string[] = [];
		const groupNames: string[] = [];
		let uploaderName: string | null = null;
		let uploaderId: string | null = null;

		for (const rel of (chap.relationships || []) as MangaDexRelationship[]) {
			if (rel.type === "scanlation_group") {
				groupIds.push(rel.id);
				if (rel.attributes?.name) {
					groupNames.push(rel.attributes.name);
				}
			} else if (rel.type === "user") {
				uploaderId = rel.id;
				if (rel.attributes?.username) {
					uploaderName = rel.attributes.username;
				}
			}
		}

		const groupId = groupIds.length > 0 ? groupIds.join(",") : null;
		const groupName = groupNames.length > 0 ? groupNames.join(" & ") : null;

		const rawVol = attr.volume;
		let volClean: string | null = null;
		if (rawVol !== undefined && rawVol !== null) {
			const sVol = String(rawVol).trim();
			if (sVol && !["none", "null", "no volume"].includes(sVol.toLowerCase())) {
				volClean = sVol;
			}
		}

		const chapterNum = attr.chapter || "oneshot";

		items.push({
			id: chap.id,
			source: "mangadex",
			source_work_id: cleanWorkId,
			chapter_number: String(chapterNum),
			title: attr.title || "",
			volume: volClean,
			language: attr.translatedLanguage || lang,
			unit_kind:
				String(chapterNum).toLowerCase() === "oneshot" ? "oneshot" : "chapter",
			release_type: null,
			group_id: groupId,
			group_name: groupName,
			uploader: uploaderName,
			uploader_id: uploaderId,
			pages_count: attr.pages || 0,
			version: attr.version || 1,
			publish_at: attr.publishAt || null,
			readable_at: attr.readableAt || null,
			created_at: attr.createdAt || null,
			updated_at: attr.updatedAt || null,
			external_url: null,
		});
	}

	const hasNext = offset + limit < total;

	return {
		items,
		total,
		has_next: hasNext,
		page: Math.floor(offset / limit) + 1,
		limit,
		catalogue_complete: !hasNext,
		observed_at: new Date().toISOString(),
	};
}

/**
 * Client-Side Browser Fallback: Fetches chapters formatted for MangaDetailPage.
 */
export async function fetchMangadexChaptersClientSide(
	mangadexId: string,
	lang = "en",
): Promise<MangadexChapterItem[]> {
	const releasePage = await fetchMangadexReleasesClientSide(
		mangadexId,
		lang,
		500,
		0,
	);
	const allItems = releasePage.items || [];

	const deduplicated: Record<string, MangadexChapterItem> = {};
	for (const item of allItems) {
		const key = `${item.chapter_number}_${item.group_id || "no-group"}`;
		if (!deduplicated[key]) {
			deduplicated[key] = {
				id: item.id,
				chapter: item.chapter_number,
				title: item.title,
				volume: item.volume || null,
				group_id: item.group_id || "no-group",
				group_name: item.group_name || "No Group",
				uploader: item.uploader || null,
				uploader_id: item.uploader_id || null,
				publish_at: item.publish_at || null,
				readable_at: item.readable_at || null,
				created_at: item.created_at || null,
				updated_at: item.updated_at || null,
				pages: item.pages_count,
				version: item.version,
				language: item.language,
			};
		}
	}

	// Sort natural numeric order
	const result = Object.values(deduplicated);
	result.sort((a, b) => {
		const numA = Number.parseFloat(a.chapter) || 0;
		const numB = Number.parseFloat(b.chapter) || 0;
		return numA - numB;
	});

	return result;
}

/**
 * Client-Side Browser Fallback: Direct search on MangaDex.
 */
export async function searchMangadexClientSide(
	query: string,
	limit = 20,
): Promise<MangadexSearchResult[]> {
	const cleanQuery = query.trim();
	const uuid = extractMangadexId(cleanQuery);
	const params = new URLSearchParams();

	if (uuid) {
		params.append("ids[]", uuid);
	} else {
		params.append("title", cleanQuery);
		params.append("limit", String(limit));
		params.append("order[relevance]", "desc");
	}

	params.append("includes[]", "author");
	params.append("includes[]", "artist");
	params.append("includes[]", "cover_art");
	params.append("contentRating[]", "safe");
	params.append("contentRating[]", "suggestive");
	params.append("contentRating[]", "erotica");
	params.append("contentRating[]", "pornographic");

	const resp = await fetch(`${MANGADEX_API_BASE}/manga?${params.toString()}`, {
		method: "GET",
		headers: { Accept: "application/json" },
	});

	if (!resp.ok) {
		throw new Error(`MangaDex Search API failed with status ${resp.status}`);
	}

	const data = await resp.json();
	const list = (data?.data || []) as Array<{
		id: string;
		attributes?: {
			title?: Record<string, string>;
			description?: Record<string, string>;
			status?: string;
			year?: number;
			contentRating?: string;
			[key: string]: unknown;
		};
		relationships?: MangaDexRelationship[];
	}>;

	return list.map((m) => {
		const attr = m.attributes || {};
		const titleObj = attr.title || {};
		const title =
			titleObj.en ||
			titleObj["ja-ro"] ||
			titleObj.ja ||
			Object.values(titleObj)[0] ||
			"Unknown";

		let coverFileName: string | null = null;
		let authorName: string | null = null;

		for (const rel of m.relationships || []) {
			if (rel.type === "cover_art" && rel.attributes?.fileName) {
				coverFileName = rel.attributes.fileName;
			} else if (rel.type === "author" && rel.attributes?.name) {
				authorName = rel.attributes.name;
			}
		}

		const descObj = attr.description || {};
		const description =
			descObj.en ||
			descObj.vi ||
			(Object.values(descObj)[0] as string | undefined) ||
			"";

		return {
			id: m.id,
			title,
			description,
			status: attr.status || null,
			year: attr.year ?? null,
			author: authorName || "Unknown",
			content_rating: attr.contentRating || null,
			cover_url: coverFileName
				? `${MANGADEX_UPLOADS_BASE}/covers/${m.id}/${coverFileName}.512.jpg`
				: null,
		};
	});
}

/**
 * Client-Side Browser Fallback: Fetches complete manga details formatted for Manga import.
 * This is triggered ONLY when backend cannot reach MangaDex during import.
 */
export async function fetchMangadexDetailsForImportClientSide(
	mangadexId: string,
): Promise<{
	fallback_details: Record<string, unknown>;
	cover_base64: string | null;
}> {
	const cleanId = extractMangadexId(mangadexId) || mangadexId;
	const url = `${MANGADEX_API_BASE}/manga/${cleanId}?includes[]=author&includes[]=artist&includes[]=cover_art`;
	const resp = await fetch(url, {
		method: "GET",
		headers: { Accept: "application/json" },
	});

	if (!resp.ok) {
		throw new Error(
			`MangaDex API returned HTTP ${resp.status} (${resp.statusText})`,
		);
	}

	const data = await resp.json();
	const manga = data?.data;
	if (!manga) {
		throw new Error(
			"Dữ liệu MangaDex không hợp lệ hoặc tác phẩm không tồn tại",
		);
	}

	const attr = manga.attributes || {};
	const relationships: MangaDexRelationship[] = manga.relationships || [];

	const titleObj = attr.title || {};
	const title =
		titleObj.en ||
		titleObj["ja-ro"] ||
		titleObj.ja ||
		Object.values(titleObj)[0] ||
		"Unknown Title";

	const altTitles: string[] = [];
	if (Array.isArray(attr.altTitles)) {
		for (const alt of attr.altTitles) {
			for (const [lang, val] of Object.entries(alt)) {
				if (typeof val === "string" && val.trim()) {
					altTitles.push(`${lang}|${val.trim()}`);
				}
			}
		}
	}

	const descObj = attr.description || {};
	const description =
		descObj.en || descObj.vi || (Object.values(descObj)[0] as string) || "";

	const authors: string[] = [];
	const artists: string[] = [];
	const authorsMeta: Array<{ id: string; name: string }> = [];
	const artistsMeta: Array<{ id: string; name: string }> = [];
	let coverFileName: string | null = null;

	for (const rel of relationships) {
		if (rel.type === "author") {
			const name = rel.attributes?.name || "Unknown";
			authors.push(name);
			authorsMeta.push({ id: rel.id, name });
		} else if (rel.type === "artist") {
			const name = rel.attributes?.name || "Unknown";
			artists.push(name);
			artistsMeta.push({ id: rel.id, name });
		} else if (rel.type === "cover_art" && rel.attributes?.fileName) {
			coverFileName = rel.attributes.fileName;
		}
	}

	const coverUrl = coverFileName
		? `${MANGADEX_UPLOADS_BASE}/covers/${cleanId}/${coverFileName}.512.jpg`
		: null;

	// Gather tags in backend format
	const tags: Array<{
		mangadex_id: string;
		name: Record<string, string>;
		group: string;
		description: string | null;
	}> = [];
	if (Array.isArray(attr.tags)) {
		for (const t of attr.tags) {
			const tAttr = t.attributes || {};
			tags.push({
				mangadex_id: t.id,
				name: tAttr.name || {},
				group: tAttr.group || "genre",
				description: tAttr.description || null,
			});
		}
	}

	// Resolve links
	const links: Array<{ title: string; url: string }> = [
		{ title: "MangaDex", url: `https://mangadex.org/title/${cleanId}` },
	];
	const linkTemplates: Record<string, [string, string]> = {
		al: ["AniList", "https://anilist.co/manga/{}"],
		ap: ["Anime-Planet", "https://www.anime-planet.com/manga/{}"],
		bw: ["BookWalker", "https://bookwalker.jp/{}"],
		mu: ["MangaUpdates", "https://www.mangaupdates.com/series.html?id={}"],
		nu: ["NovelUpdates", "https://www.novelupdates.com/series/{}"],
		kt: ["Kitsu", "https://kitsu.io/manga/{}"],
		mal: ["MyAnimeList", "https://myanimelist.net/manga/{}"],
		amz: ["Amazon", "{}"],
		ebj: ["eBookJapan", "{}"],
		cdj: ["CDJapan", "{}"],
		raw: ["Official Raw", "{}"],
		engtl: ["Official English", "{}"],
	};
	if (attr.links && typeof attr.links === "object") {
		for (const [key, val] of Object.entries(attr.links)) {
			if (typeof val === "string" && linkTemplates[key]) {
				const [tplTitle, tpl] = linkTemplates[key];
				const urlStr =
					key === "bw"
						? `https://bookwalker.jp/${val.replace(/^\//, "")}`
						: tpl.includes("{}")
							? tpl.replace("{}", val)
							: val;
				links.push({ title: tplTitle, url: urlStr });
			}
		}
	}

	// Attempt client-side cover download as base64
	let coverBase64: string | null = null;
	if (coverUrl) {
		try {
			const imgResp = await fetch(coverUrl);
			if (imgResp.ok) {
				const blob = await imgResp.blob();
				coverBase64 = await new Promise<string>((resolve, reject) => {
					const reader = new FileReader();
					reader.onloadend = () => {
						const result = reader.result as string;
						const b64 = result.includes(",") ? result.split(",")[1] : result;
						resolve(b64);
					};
					reader.onerror = reject;
					reader.readAsDataURL(blob);
				});
			}
		} catch (imgErr) {
			console.warn(
				"Could not download cover image in client fallback:",
				imgErr,
			);
		}
	}

	const fallbackDetails = {
		mangadex_id: cleanId,
		title: String(title),
		alt_titles: altTitles,
		description: String(description),
		author: authors.length > 0 ? authors.join(", ") : "Unknown",
		artist: artists.length > 0 ? artists.join(", ") : "Unknown",
		authors_meta: authorsMeta,
		artists_meta: artistsMeta,
		year: attr.year ? String(attr.year) : "N/A",
		status: attr.status || null,
		cover_url: coverUrl,
		tags,
		content_rating: attr.contentRating || null,
		publication_demographic: attr.publicationDemographic || null,
		original_language: attr.originalLanguage || null,
		last_volume: attr.lastVolume || null,
		last_chapter: attr.lastChapter || null,
		links,
	};

	return {
		fallback_details: fallbackDetails,
		cover_base64: coverBase64,
	};
}
