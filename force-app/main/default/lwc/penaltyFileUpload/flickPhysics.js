const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

// Pitch-relative velocity keeps the same gesture usable in wide and narrow cards.
// Preserve an intentional drag even if the user pauses before letting go.
// A pause softens the shot instead of silently cancelling it.
export function releaseVelocity(samples, width, height) {
  if (samples.length < 2 || !width || !height) return null;
  const start = samples[0];
  if (
    !samples.some(
      (point) => Math.hypot(point.x - start.x, point.y - start.y) >= 6
    )
  )
    return null;
  let movingIndex = samples.length - 1;
  while (
    movingIndex > 0 &&
    Math.hypot(
      samples[movingIndex].x - samples[movingIndex - 1].x,
      samples[movingIndex].y - samples[movingIndex - 1].y
    ) < 0.5
  )
    movingIndex--;
  if (movingIndex === 0) return null;
  const last = samples[movingIndex];
  let first = samples[movingIndex - 1];
  for (let i = movingIndex - 1; i >= 0; i--) {
    first = samples[i];
    if (last.time - first.time >= 120) break;
  }
  // A direction reversal can cancel the net displacement in a time window.
  // In that case the last actual segment supplies the release direction.
  if (Math.hypot(last.x - first.x, last.y - first.y) < 0.5)
    first = samples[movingIndex - 1];
  const elapsed = Math.max(8, last.time - first.time);
  const rawX = (((last.x - first.x) / width) * 100000) / elapsed;
  const rawY = (((last.y - first.y) / height) * 100000) / elapsed;
  const rawSpeed = Math.hypot(rawX, rawY);
  if (!rawSpeed) return null;
  const pause = Math.max(0, samples[samples.length - 1].time - last.time - 120);
  const speed = Math.max(18, rawSpeed * Math.exp(-pause / 300));
  return {
    vx: (rawX / rawSpeed) * speed,
    vy: (rawY / rawSpeed) * speed,
    speed
  };
}

export function flightFromFlick(velocity, x, y) {
  const { vx, vy, speed } = velocity;
  const dx = vx / speed;
  const dy = vy / speed;
  let distance = clamp(speed * 0.42, 3, 46);
  // The goal is the depth plane. Extra power makes the flight faster, not an
  // automatic overshoot above the crossbar.
  if (dy < 0) distance = Math.min(distance, (y - 42) / -dy);
  return {
    x: clamp(x + dx * distance, -6, 106),
    y: clamp(y + dy * distance, 15, 103),
    power: clamp(speed / 190, 0, 1),
    speed,
    duration: clamp(1450 - speed * 5, 300, 1450)
  };
}
