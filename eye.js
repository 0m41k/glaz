(() => {
  "use strict";

  const canvas = document.querySelector("#art");
  const button = document.querySelector("#playback");
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) return;

  const columns = 104;
  const rows = 36;
  const background = "#080709";
  const glyphs = " .,:;-/()[]{}itfjrxuvczXJYLOQmwMN0#@";
  const colors = new Map();
  const duration = 28;
  const stillTime = 2.2;
  const frameInterval = 1000 / 30;
  const pupilRadius = .133;
  const motionPreference = matchMedia("(prefers-reduced-motion: reduce)");

  const heartEdges = makeHeartEdges();
  const stars = Array.from({ length: 155 }, (_, i) => ({
    x: random(i * 7 + 1) * 2.12 - 1.06,
    y: random(i * 7 + 2) * 1.68 - .84,
    strength: .35 + random(i * 7 + 3) * .65,
    phase: random(i * 7 + 4) * Math.PI * 2,
    size: .42 + random(i * 7 + 5) * .65,
    cross: i % 11 === 0,
  }));

  let elapsed = 0;
  let running = !motionPreference.matches;
  let frameId = 0;
  let previousTimestamp;
  let frameElapsed = 0;

  function clamp(value, min = 0, max = 1) {
    return Math.min(max, Math.max(min, value));
  }

  function smooth(start, end, value) {
    const t = clamp((value - start) / (end - start));
    return t * t * (3 - 2 * t);
  }

  function random(seed) {
    let value = Math.imul(seed ^ 0x61c88647, 0x45d9f3b);
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
  }

  function color(r, g, b) {
    const red = clamp(r, 0, 255) & 248;
    const green = clamp(g, 0, 255) & 248;
    const blue = clamp(b, 0, 255) & 248;
    const key = (red << 16) | (green << 8) | blue;
    if (!colors.has(key)) colors.set(key, `rgb(${red}, ${green}, ${blue})`);
    return colors.get(key);
  }

  function blink(time, center, close, open) {
    return smooth(center - close, center, time) * (1 - smooth(center, center + open, time));
  }

  function sceneAt(time) {
    const openness = smooth(0, .92, time) * (1 - blink(time, 3.18, .15, .28));
    const approach = clamp(time / 25.2);
    const braking = Math.max(0, approach - .91);
    const zoomProgress = (approach - braking ** 2 / .18) / .955;
    const zoom = 13.4 ** (.29 * zoomProgress + .71 * zoomProgress ** 2.6);
    return {
      time, openness, zoom,
      worldReveal: smooth(7.1, 17.6, time),
      glint: 1 - smooth(9, 19, time),
      heartReveal: smooth(13.6, 18.2, time),
      heartSize: (.034 + .368 * smooth(16.2, 25.8, time)) * (1 + .026 * Math.sin(time * 4.2)),
      fade: smooth(0, .24, time) * (1 - smooth(27.7, duration, time)),
    };
  }

  function makeHeartEdges() {
    // The right half from the central notch to the tip. Sampling mirrors it on the left.
    const curves = [
      [.16, -.68, .38, -.88, .62, -.88],
      [.86, -.88, 1.06, -.67, 1.02, -.39],
      [.96, .05, .52, .46, 0, .97],
    ];
    const edges = [];
    let x = 0;
    let y = -.35;

    for (const [controlX1, controlY1, controlX2, controlY2, endX, endY] of curves) {
      const startX = x;
      const startY = y;
      for (let step = 1; step <= 10; step++) {
        const t = step / 10;
        const s = 1 - t;
        const nextX = s ** 3 * startX + 3 * s ** 2 * t * controlX1 + 3 * s * t ** 2 * controlX2 + t ** 3 * endX;
        const nextY = s ** 3 * startY + 3 * s ** 2 * t * controlY1 + 3 * s * t ** 2 * controlY2 + t ** 3 * endY;
        const dx = nextX - x;
        const dy = nextY - y;
        edges.push({ x, y, dx, dy, lengthSquared: dx * dx + dy * dy });
        x = nextX;
        y = nextY;
      }
    }
    return edges;
  }

  function heartDistance(u, v) {
    const x = Math.abs(u);
    if (x > 1.18 || v < -1.04 || v > 1.14) return .2;
    let minimum = Infinity;
    let inside = false;

    for (const edge of heartEdges) {
      const dx = x - edge.x;
      const dy = v - edge.y;
      const along = clamp((dx * edge.dx + dy * edge.dy) / edge.lengthSquared);
      minimum = Math.min(minimum, (dx - along * edge.dx) ** 2 + (dy - along * edge.dy) ** 2);
      if ((dy < 0) !== (dy < edge.dy) && dx < edge.dx * dy / edge.dy) inside = !inside;
    }
    return (inside ? -1 : 1) * Math.sqrt(minimum);
  }

  function sampleHeart(x, y, scene, noise) {
    if (scene.heartReveal === 0) return null;
    const u = x / scene.heartSize;
    const v = y / scene.heartSize;
    const distance = heartDistance(u, v);
    if (distance >= .135) return null;

    const fill = 1 - smooth(-.02, .035, distance);
    const rim = 1 - smooth(.015, .1, Math.abs(distance));
    const glow = 1 - smooth(.04, .135, distance);
    const core = (1 - smooth(.1, .88, Math.hypot(u * .84 + .05, v + .04)))
      * (1 - smooth(-.17, -.055, distance));
    const brightness = (.76 * fill + .26 * rim + .1 * glow) * (.94 + .09 * noise) * scene.heartReveal;
    return [255 * brightness, (47 + 201 * core) * brightness, (126 + 124 * core) * brightness];
  }

  function sample(x, y, screenX, screenY, scene, noise) {
    const arch = Math.sqrt(Math.max(0, 1 - ((x + .018) / 1.09) ** 2));
    const seam = .085 - .042 * x + .031 * Math.cos(x * 3.2);
    const top = seam - .42 * arch * scene.openness;
    const bottom = seam + .207 * arch * scene.openness;
    const inside = smooth(-.008, .017, Math.min(y - top, bottom - y));
    const skinTexture = 6 * Math.sin(y * 55 + x * 10) + 5 * Math.sin(x * 32 - y * 41) + 16 * noise;
    const underEye = smooth(.15, .59, y);
    const overhead = 1 - smooth(-.39, -.07, y);
    const lashEdge = top - .021 - .023 * (.5 + .5 * Math.sin(x * 92 + 5 * y));
    const lashes = 1 - smooth(.012, .085, Math.abs(y - lashEdge));
    const brow = Math.exp(-(((y + .48 + .1 * Math.cos(x * 2.5)) / .10) ** 2));
    const crease = Math.exp(-(((y - top + .10 * arch) / .037) ** 2));
    const skin = clamp(.76 + .38 * underEye + .24 * overhead - .49 * lashes - .31 * brow - .22 * crease);

    let red = (192 + skinTexture) * skin;
    let green = (121 + skinTexture) * skin;
    let blue = (101 + skinTexture) * skin;

    if (inside > 0) {
      const dx = x / .94;
      const dy = y;
      const radius = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const irisEdge = .343 + .0035 * Math.sin(angle * 27) + .004 * Math.cos(angle * 13);
      const upperLight = .41 + .59 * smooth(-.003, .116, y - top);
      let eyeRed;
      let eyeGreen;
      let eyeBlue;

      if (radius < irisEdge) {
        const pupil = pupilRadius + .003 * Math.sin(angle * 9);
        const glint = scene.glint * (
          .90 * Math.exp(-(((dx - .088) / .068) ** 2 + ((dy + .103) / .049) ** 2))
          + .66 * Math.exp(-(((dx + .065) / .023) ** 2 + ((dy - .057) / .020) ** 2))
        );
        const fibers = .5 + .24 * Math.sin(angle * 61 + radius * 35)
          + .17 * Math.sin(angle * 97 - radius * 61) + .095 * Math.sin(angle * 19 + radius * 105);
        const rings = .88 + .10 * Math.sin(radius * 91 + 2 * Math.sin(angle * 8));
        const limbus = 1 - smooth(irisEdge - .041, irisEdge, radius);
        const irisLight = (.38 + .62 * fibers) * rings * (.88 + .15 * Math.sin(angle + .65));
        const irisBlend = smooth(pupil - .012, pupil + .018, radius) * (.19 + .81 * limbus) * upperLight;
        eyeRed = 6 + (34 + 112 * irisLight) * irisBlend + 229 * glint;
        eyeGreen = 8 + (81 + 153 * irisLight) * irisBlend + 231 * glint;
        eyeBlue = 10 + (127 + 133 * irisLight) * irisBlend + 234 * glint;

        if (radius < pupil && scene.worldReveal > 0) {
          const heart = sampleHeart(screenX, screenY, scene, noise);
          if (heart) [eyeRed, eyeGreen, eyeBlue] = heart;
        }
      } else {
        const corners = smooth(.44, 1.13, Math.abs(x));
        const rim = smooth(-.002, .073, bottom - y);
        const irisShadow = .73 + .27 * smooth(irisEdge, irisEdge + .069, radius);
        const tissue = upperLight * (.46 + .54 * rim) * (1 - .33 * corners) * irisShadow;
        const fineDetail = 5 * Math.sin(52 * x + 9 * Math.sin(y * 14)) + 8 * noise;
        eyeRed = 43 + (209 + fineDetail) * tissue;
        eyeGreen = 24 + (224 + fineDetail) * tissue;
        eyeBlue = 27 + (218 + fineDetail) * tissue;
      }

      red += (eyeRed - red) * inside;
      green += (eyeGreen - green) * inside;
      blue += (eyeBlue - blue) * inside;
    }

    const edge = 1 - .21 * smooth(.68, 1.02, Math.max(Math.abs(screenX), Math.abs(screenY) / .8));
    return [red * edge, green * edge, blue * edge];
  }

  function drawStars(scene, width) {
    if (scene.worldReveal === 0) return;

    const unit = width / 2;
    const expansion = .27 + .73 * smooth(1.05, 8.7, scene.zoom);
    const drift = scene.time - 10;

    for (const star of stars) {
      const x = star.x * expansion + .012 * Math.sin(.31 * drift + star.phase);
      const y = star.y * expansion + .014 * Math.cos(.26 * drift + star.phase);
      const distance = Math.hypot(x / .94, y) / scene.zoom;
      const heartEdge = heartDistance(x / scene.heartSize, y / scene.heartSize);
      const heartShadow = 1 - scene.heartReveal * (1 - smooth(.01, .14, heartEdge));
      const twinkle = .45 + .55 * (.5 + .5 * Math.sin(scene.time * 2.45 + star.phase));
      const pupilMask = 1 - smooth(pupilRadius - .023, pupilRadius - .002, distance);
      const strength = star.cross ? .66 + .34 * star.strength : star.strength;
      const opacity = scene.fade * scene.worldReveal * pupilMask * heartShadow * twinkle * strength;
      if (opacity < .045) continue;

      const px = (x + 1) * unit;
      const py = (y + .8) * unit;
      const length = width * star.size * (.003 + .018 * twinkle) * expansion;
      const dot = Math.max(1, width * .0023 * star.size);
      context.fillStyle = `rgba(224, 235, 255, ${opacity})`;
      context.fillRect(px - dot / 2, py - dot / 2, dot, dot);

      if (star.cross) {
        context.fillStyle = `rgba(211, 224, 249, ${opacity * .85})`;
        context.fillRect(px - length * .62, py - dot * .23, length * 1.24, dot * .46);
        context.fillRect(px - dot * .22, py - length, dot * .44, length * 2);
      }
    }
  }

  function draw(time) {
    const { width, height } = canvas;
    const scene = sceneAt(time);
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);
    context.font = `600 ${cellWidth * 1.53}px ui-monospace, Menlo, Consolas, monospace`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.globalAlpha = scene.fade;

    for (let row = 0; row < rows; row++) {
      const screenY = ((row + .5) / rows - .5) * 1.6;
      const y = screenY / scene.zoom;

      for (let column = 0; column < columns; column++) {
        const screenX = (column + .5) * 2 / columns - 1;
        const x = screenX / scene.zoom;
        const noise = random(row * columns + column);
        const [red, green, blue] = sample(x, y, screenX, screenY, scene, noise);
        const intensity = Math.max(red * .91, green, blue * .88);
        const glyph = Math.floor(clamp(intensity / 255 * .92 + (noise - .32) * .23) * (glyphs.length - 1));
        if (intensity < 13 || glyph === 0) continue;

        context.fillStyle = color(red, green, blue);
        context.fillText(glyphs[glyph], (column + .5) * cellWidth, (row + .55) * cellHeight);
      }
    }

    context.globalAlpha = 1;
    drawStars(scene, width);
  }

  function displayedTime() {
    return !running && elapsed === 0 ? stillTime : elapsed % duration;
  }

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    const density = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(bounds.width * density));
    canvas.height = Math.max(1, Math.round(bounds.height * density));
    draw(displayedTime());
  }

  function tick(timestamp) {
    if (previousTimestamp !== undefined) {
      const delta = timestamp - previousTimestamp;
      elapsed += delta / 1000;
      frameElapsed += delta;
      if (frameElapsed >= frameInterval) {
        frameElapsed %= frameInterval;
        draw(displayedTime());
      }
    }
    previousTimestamp = timestamp;
    frameId = requestAnimationFrame(tick);
  }

  function syncPlayback() {
    button.toggleAttribute("data-paused", !running);
    button.setAttribute("aria-label", running ? "Приостановить анимацию" : "Воспроизвести анимацию");
    if (running && !document.hidden) {
      if (!frameId) frameId = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(frameId);
      frameId = 0;
      previousTimestamp = undefined;
      frameElapsed = 0;
    }
  }

  button.addEventListener("click", () => {
    running = !running;
    syncPlayback();
  });
  motionPreference.addEventListener("change", ({ matches }) => {
    if (matches) {
      running = false;
      elapsed = 0;
      draw(stillTime);
      syncPlayback();
    }
  });
  document.addEventListener("visibilitychange", syncPlayback);
  new ResizeObserver(resize).observe(canvas);
  button.hidden = false;
  syncPlayback();
})();
