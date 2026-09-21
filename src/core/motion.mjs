import { clamp } from './senses.mjs';
export const angleDelta = (target, current) => Math.atan2(Math.sin(target - current), Math.cos(target - current));
const smooth = x => { x = clamp(x); return x * x * (3 - 2 * x); };

// Animation/kinematic mechanics, not an additional behavioral decision maker.
export function advanceMotion(s, bounds, dt, walkingSpeed, neuralTurn) {
  const flying = s.mode === 'flight';
  const climb = flying ? smooth((s.age - s.flightStartedAt) / 0.18) : 0;
  const descent = flying ? smooth((s.flightUntil - s.age) / 0.32) : 0;
  s.altitude = climb * descent;
  const targetSpeed = flying ? 230 * (0.12 + 0.88 * s.altitude) : walkingSpeed;
  const acceleration = targetSpeed > s.speed ? (flying ? 900 : 120) : (flying ? 950 : 420);
  s.speed += clamp(targetSpeed - s.speed, -acceleration * dt, acceleration * dt);

  const canTurn=flying||s.mode==='walk';
  let desiredTurn = flying ? clamp(angleDelta(s.escapeHeading, s.heading) * 6, -7, 7) : canTurn?neuralTurn:0;
  // Gradual wall avoidance replaces an instantaneous snap toward the screen centre.
  const margin = flying ? 145 : 65;
  const repelX = Math.max(0, 1 - (s.x - bounds.x) / margin) - Math.max(0, 1 - (bounds.x + bounds.width - s.x) / margin);
  const repelY = Math.max(0, 1 - (s.y - bounds.y) / margin) - Math.max(0, 1 - (bounds.y + bounds.height - s.y) / margin);
  if (canTurn && Math.abs(repelX) + Math.abs(repelY) > 0) {
    const away = Math.atan2(Math.sin(s.heading) + repelY * 4, Math.cos(s.heading) + repelX * 4);
    desiredTurn += clamp(angleDelta(away, s.heading) * 8, -8, 8);
  }
  desiredTurn = clamp(desiredTurn, flying ? -7 : -3.5, flying ? 7 : 3.5);
  s.turnVelocity += clamp(desiredTurn - s.turnVelocity, -25 * dt, 25 * dt);
  s.heading += s.turnVelocity * dt;
  const travel = s.speed * dt;
  s.x += Math.cos(s.heading) * travel;
  s.y += Math.sin(s.heading) * travel;
  if (!flying) s.gaitPhase += travel * Math.PI * 2 / 22;
}
