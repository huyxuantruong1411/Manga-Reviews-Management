import math
import random
from typing import List, Tuple


def _cubic_bezier(p0: float, p1: float, p2: float, p3: float, t: float) -> float:
    """Computes a 1D cubic Bezier point at parameter t in [0, 1]."""
    u = 1.0 - t
    return (u**3) * p0 + 3.0 * (u**2) * t * p1 + 3.0 * u * (t**2) * p2 + (t**3) * p3


def generate_bezier_trajectory(
    start: Tuple[int, int],
    end: Tuple[int, int],
    steps: int = 25,
    jitter: float = 1.0,
) -> List[Tuple[int, int]]:
    """
    Generates a natural, human-like mouse movement trajectory from start to end
    using a Cubic Bezier curve with randomized control points and ease-out velocity profile.
    """
    if steps < 2:
        return [start, end]

    x0, y0 = float(start[0]), float(start[1])
    x3, y3 = float(end[0]), float(end[1])

    dx = x3 - x0
    dy = y3 - y0
    distance = math.hypot(dx, dy)

    # Calculate 2 control points offset perpendicularly from the straight line
    # to create natural human arm/wrist curvature
    deviation = min(distance * 0.35, 60.0)
    angle = math.atan2(dy, dx)
    perp_angle = angle + (math.pi / 2.0 if random.random() < 0.5 else -math.pi / 2.0)

    # First control point (near 1/3 of distance)
    d1 = distance * (0.25 + random.uniform(-0.08, 0.08))
    dev1 = random.uniform(-deviation, deviation)
    x1 = x0 + d1 * math.cos(angle) + dev1 * math.cos(perp_angle)
    y1 = y0 + d1 * math.sin(angle) + dev1 * math.sin(perp_angle)

    # Second control point (near 2/3 of distance)
    d2 = distance * (0.70 + random.uniform(-0.08, 0.08))
    dev2 = random.uniform(-deviation, deviation)
    x2 = x0 + d2 * math.cos(angle) + dev2 * math.cos(perp_angle)
    y2 = y0 + d2 * math.sin(angle) + dev2 * math.sin(perp_angle)

    points: List[Tuple[int, int]] = []

    for i in range(steps):
        raw_progress = i / float(steps - 1)
        # Apply ease-out deceleration curve: fast departure, gentle approach
        t = math.sin(raw_progress * math.pi / 2.0)

        bx = _cubic_bezier(x0, x1, x2, x3, t)
        by = _cubic_bezier(y0, y1, y2, y3, t)

        # Apply minor micro-jitter in the middle of movement (never on endpoints)
        if 0 < i < steps - 1 and jitter > 0:
            bx += random.uniform(-jitter, jitter)
            by += random.uniform(-jitter, jitter)

        points.append((int(round(bx)), int(round(by))))

    # Guarantee exact start and endpoint pinning
    points[0] = (int(round(x0)), int(round(y0)))
    points[-1] = (int(round(x3)), int(round(y3)))

    return points
