import asyncio
import io
import logging
from typing import Any, Dict, Optional

from bson import ObjectId
from PIL import Image

from backend.database.connection import get_db
from backend.services.minio_service import minio_service
from backend.services.vision_service import vision_service

logger = logging.getLogger("narrator_service")

# Prompt templates designed for manga layout, panel hierarchy, and scene intelligence
PROMPT_PANEL_STRUCTURE = (
    "Examine the layout and visual structure of this manga page carefully. "
    "1. Panels: Count the panels, identify whether they are cleanly separated by white gutters, "
    "borderless, overlapping, or nested inside other panels. "
    "2. Speech Bubbles: Identify each text region. Classify whether it is enclosed in an oval speech bubble, "
    "shouting bubble with jagged edges, thought bubble, or text placed directly on the background illustration. "
    "3. Reading flow: Describe the spatial order from top-right to bottom-left (standard manga flow)."
)

PROMPT_SCENE_NARRATION = (
    "Provide a detailed narrative description of what is happening in this manga panel: "
    "describe the setting, background atmosphere, characters present, their facial expressions, "
    "emotional reactions, physical poses/actions, and any visible dialogue or key sound effects."
)

PROMPT_TEXT_BUBBLE_REFINEMENT = (
    "Extract all readable dialogue text from this comic panel. "
    "Keep dialogues from separate speech bubbles clearly demarcated. "
    "Do not merge separate columns or side-by-side bubbles. "
    "Preserve contractions (e.g., I'd, don't, it's) and hyphenated words across lines."
)


class MangaNarratorService:
    def __init__(self):
        self._model = None
        self._tokenizer = None
        self._device = None
        self._initialized = False
        self._init_lock = asyncio.Lock()

    def is_available(self) -> bool:
        """Check if torch and transformers are installed and can run visual reasoning."""
        import importlib.util

        return (
            importlib.util.find_spec("torch") is not None
            and importlib.util.find_spec("transformers") is not None
        )

    async def _ensure_model_loaded(self):
        """Lazy loader for moondream2 model (vikhyatk/moondream2) to avoid memory impact at startup."""
        if self._initialized:
            return

        async with self._init_lock:
            if self._initialized:
                return

            def _load():
                import importlib

                torch = importlib.import_module("torch")
                transformers = importlib.import_module("transformers")
                auto_model_cls = transformers.AutoModelForCausalLM
                auto_tokenizer_cls = transformers.AutoTokenizer

                if torch.cuda.is_available():
                    device = "cuda"
                    dtype = torch.float16
                elif getattr(torch.backends, "mps", None) and torch.backends.mps.is_available():
                    device = "mps"
                    dtype = torch.float16
                else:
                    device = "cpu"
                    dtype = torch.float32

                model_id = "vikhyatk/moondream2"
                revision = "2024-08-26"
                logger.info(f"Loading visual narrator model {model_id} onto device: {device}...")

                tokenizer = auto_tokenizer_cls.from_pretrained(model_id, revision=revision)
                model = auto_model_cls.from_pretrained(
                    model_id,
                    trust_remote_code=True,
                    torch_dtype=dtype,
                    revision=revision,
                    device_map={"": device} if device != "cpu" else None,
                )
                if device == "cpu":
                    model = model.to(device)
                model.eval()
                return model, tokenizer, device

            self._model, self._tokenizer, self._device = await asyncio.to_thread(_load)
            self._initialized = True
            logger.info("Manga visual narrator model loaded successfully.")

    async def analyze_image(self, image_bytes: bytes, prompt: str = PROMPT_SCENE_NARRATION) -> str:
        """Run vision-language model inference on image bytes with given prompt."""
        if not self.is_available():
            raise RuntimeError("Torch or Transformers not installed in environment for vision narrator.")

        await self._ensure_model_loaded()

        def _infer():
            import importlib

            torch = importlib.import_module("torch")

            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            with torch.no_grad():
                image_embeds = self._model.encode_image(image)
                answer = self._model.answer_question(image_embeds, prompt, tokenizer=self._tokenizer)
                return answer.strip()

        return await asyncio.to_thread(_infer)

    async def narrate_panel(
        self, panel_id: str, mode: str = "scene", custom_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Enrich a panel with deep narrative or structural analysis.
        Modes:
          - 'scene': Deep description of setting, character expressions, actions
          - 'layout': Panel boundary and speech bubble spatial breakdown
          - 'dialogue': Clean textual extraction respecting bubble boundaries
        """
        db = get_db()
        filter_q = {"_id": ObjectId(panel_id)} if ObjectId.is_valid(panel_id) else {"_id": panel_id}
        panel = await db.manga_panels.find_one(filter_q)
        if not panel:
            raise ValueError("Panel not found")

        coords = panel.get("coords", [0.0, 0.0, 1.0, 1.0])
        obj_key = panel.get("page_minio_key")
        if not obj_key:
            raise ValueError("Original page key not associated with this panel")

        def _get_bytes():
            resp = minio_service.client.get_object(minio_service.bucket, obj_key)
            try:
                return resp.read()
            finally:
                resp.close()
                resp.release_conn()

        page_bytes = await asyncio.to_thread(_get_bytes)

        # Sliced panel bytes
        panel_crop_stream = await asyncio.to_thread(vision_service.get_panel_crop_stream, page_bytes, tuple(coords), 92)
        crop_bytes = panel_crop_stream.getvalue()

        # Select prompt
        if custom_prompt:
            prompt = custom_prompt
        elif mode == "layout":
            prompt = PROMPT_PANEL_STRUCTURE
        elif mode == "dialogue":
            prompt = PROMPT_TEXT_BUBBLE_REFINEMENT
        else:
            prompt = PROMPT_SCENE_NARRATION

        description = await self.analyze_image(crop_bytes, prompt=prompt)

        # Update panel record with enrichment
        update_fields: Dict[str, Any] = {}
        if mode == "layout":
            update_fields["layout_description"] = description
        elif mode == "dialogue":
            update_fields["dialogue_refined"] = description
        else:
            update_fields["narrative_description"] = description

        await db.manga_panels.update_one(filter_q, {"$set": update_fields})

        return {
            "panel_id": str(panel["_id"]),
            "mode": mode,
            "prompt": prompt,
            "description": description,
        }


narrator_service = MangaNarratorService()
