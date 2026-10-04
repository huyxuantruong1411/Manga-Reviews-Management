"""Compatibility and hardware probe script for translator runtime.

Outputs structured JSON diagnostics about the host environment, CUDA
availability, and runtime dependencies without initiating heavy model downloads
or paid inference calls.
"""

import json
import platform
import sys
from typing import Any, Dict


def probe_environment() -> Dict[str, Any]:
    diagnostics: Dict[str, Any] = {
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
            "python_version": sys.version,
            "executable": sys.executable,
        },
        "cuda": {"available": False, "device_count": 0, "device_name": None, "vram_total_mb": None},
        "libraries": {
            "torch": None,
            "torchvision": None,
            "opencv": None,
            "pillow": None,
            "rapidocr": None,
            "skia": None,
        },
        "hardware_recommendation": "cpu_lightweight",
        "ready_for_inference": False,
    }

    # Check PyTorch
    try:
        import torch

        diagnostics["libraries"]["torch"] = torch.__version__
        if torch.cuda.is_available():
            diagnostics["cuda"]["available"] = True
            diagnostics["cuda"]["device_count"] = torch.cuda.device_count()
            diagnostics["cuda"]["device_name"] = torch.cuda.get_device_name(0)
            props = torch.cuda.get_device_properties(0)
            vram_mb = round(props.total_memory / (1024 * 1024))
            diagnostics["cuda"]["vram_total_mb"] = vram_mb
            if vram_mb >= 8000:
                diagnostics["hardware_recommendation"] = "gpu_full_features"
            elif vram_mb >= 4000:
                diagnostics["hardware_recommendation"] = "gpu_standard"
            else:
                diagnostics["hardware_recommendation"] = "gpu_lightweight"
    except ImportError:
        pass
    except Exception as e:
        diagnostics["cuda"]["probe_error"] = str(e)

    # Check OpenCV
    try:
        import cv2

        diagnostics["libraries"]["opencv"] = cv2.__version__
    except ImportError:
        pass

    # Check Pillow
    try:
        from PIL import Image

        diagnostics["libraries"]["pillow"] = getattr(Image, "__version__", "installed")
    except ImportError:
        pass

    # Check RapidOCR
    try:
        import rapidocr_onnxruntime

        diagnostics["libraries"]["rapidocr"] = getattr(rapidocr_onnxruntime, "__version__", "installed")
    except ImportError:
        pass

    # Check Skia
    try:
        import skia

        diagnostics["libraries"]["skia"] = getattr(skia, "__version__", "installed")
    except ImportError:
        pass

    return diagnostics


if __name__ == "__main__":
    result = probe_environment()
    print(json.dumps(result, indent=2))
