import { useEffect, useState } from "react";
import client from "../api/client";

export interface BlurSettings {
	enabled: boolean;
	blurSuggestive: boolean;
	blurErotica: boolean;
	blurPornographic: boolean;
	blurTags: string[]; // tag database IDs
	blurGroups: string[]; // tag group names (lowercase)
	hideRating: boolean;
}

export interface MinimalManga {
	content_rating?: string | null;
	tag_ids?: string[];
	tags?: Array<{
		_id?: string;
		mangadex_id?: string | null;
		group?: string;
	}>;
}

interface Tag {
	_id: string;
	mangadex_id?: string | null;
	name: { en: string; vi?: string | null };
	group?: string;
}

// Global cached tags promise to avoid redundant server requests
let tagsCache: Tag[] | null = null;
let tagsPromise: Promise<Tag[]> | null = null;

const getTagsCached = async (): Promise<Tag[]> => {
	if (tagsCache) return tagsCache;
	if (!tagsPromise) {
		tagsPromise = client.get("/api/tags/").then((res) => {
			tagsCache = res.data;
			return res.data;
		});
	}
	return tagsPromise;
};

const DEFAULT_SETTINGS: BlurSettings = {
	enabled: false,
	blurSuggestive: false,
	blurErotica: true,
	blurPornographic: true,
	blurTags: [],
	blurGroups: [],
	hideRating: false,
};

export const useMangaBlur = () => {
	const [settings, setSettings] = useState<BlurSettings>(() => {
		const saved = localStorage.getItem("manga_blur_settings");
		if (saved) {
			try {
				return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
			} catch (e) {
				console.error("Failed to parse cover blur settings:", e);
			}
		}
		return DEFAULT_SETTINGS;
	});

	const [tags, setTags] = useState<Tag[]>([]);

	useEffect(() => {
		// Retrieve cached or fetched tags
		getTagsCached()
			.then(setTags)
			.catch((err) =>
				console.error("Failed to fetch tags for blur check:", err),
			);

		const handleSettingsChange = () => {
			const saved = localStorage.getItem("manga_blur_settings");
			if (saved) {
				try {
					setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(saved) });
				} catch (e) {
					console.error("Failed to parse updated cover blur settings:", e);
				}
			}
		};

		window.addEventListener(
			"manga_blur_settings_changed",
			handleSettingsChange,
		);
		return () => {
			window.removeEventListener(
				"manga_blur_settings_changed",
				handleSettingsChange,
			);
		};
	}, []);

	const shouldBlur = (manga: MinimalManga | null | undefined): boolean => {
		if (!manga || !settings.enabled) return false;

		// 1. Content Rating Check
		const rating = (
			manga.content_rating || (manga as any).contentRating
		)?.toLowerCase();
		if (rating === "suggestive" && settings.blurSuggestive) return true;
		if (rating === "erotica" && settings.blurErotica) return true;
		if (rating === "pornographic" && settings.blurPornographic) return true;

		// 2. Local Tag ID Check
		const mTagIds = manga.tag_ids || [];
		if (mTagIds.some((tid) => settings.blurTags.includes(tid))) return true;

		// 3. Tag Objects Check (MangaDex results or parsed tags)
		const mTags = manga.tags || [];
		if (
			mTags.some((t) => {
				if (t._id && settings.blurTags.includes(t._id)) return true;
				if (
					t.mangadex_id &&
					tags.some(
						(dt) =>
							dt.mangadex_id === t.mangadex_id &&
							settings.blurTags.includes(dt._id),
					)
				) {
					return true;
				}
				if (t.group && settings.blurGroups.includes(t.group.toLowerCase()))
					return true;
				return false;
			})
		) {
			return true;
		}

		// 4. Tag Group Check using tag_ids and cached tags mapping
		if (
			settings.blurGroups.length > 0 &&
			tags.length > 0 &&
			mTagIds.length > 0
		) {
			const matchedTags = mTagIds
				.map((tid) => tags.find((t) => t._id === tid))
				.filter(Boolean) as Tag[];
			if (
				matchedTags.some(
					(t) => t.group && settings.blurGroups.includes(t.group.toLowerCase()),
				)
			)
				return true;
		}

		return false;
	};

	const updateSettings = (newSettings: BlurSettings) => {
		localStorage.setItem("manga_blur_settings", JSON.stringify(newSettings));
		setSettings(newSettings);
		window.dispatchEvent(new Event("manga_blur_settings_changed"));
	};

	return { settings, shouldBlur, updateSettings, tags };
};
