// The Knewt mark: a young newt (an eft) curled into a question mark.
// Head = the ball terminal, body = the hook, tail = the stem, and the dot stays a dot.
// The body is built from a centreline with a width profile, so the tail really tapers
// and the legs bend at the knee (straight legs read as bolts, which is what the
// exploration's sketch was criticised for). Coordinates live in a 48 by 48 box.
//
// Detail levels:
//   'full'  (48 px and up)  body, four bent legs, eye, back spots, dot
//   'mid'   (28 to 47 px)   body, four bent legs, eye, dot
//   'small' (16 to 27 px)   body, eye, dot: reads as a plain "?" with a head
'use strict';

const segs = [
  // [p0, c1, c2, p1] cubic Bezier segments of the centreline, head end first
  [[14.4, 17.0], [12.4, 10.4], [17.2, 5.6], [24.2, 5.4]],
  [[24.2, 5.4], [31.4, 5.2], [36.6, 9.8], [36.4, 15.6]],
  [[36.4, 15.6], [36.2, 20.6], [32.6, 23.4], [29.2, 25.6]],
  [[29.2, 25.6], [26.2, 27.6], [24.6, 29.6], [24.9, 34.4]],
];

function bez(s, t) {
  const [a, b, c, d] = s;
  const mt = 1 - t;
  return [0, 1].map((i) => mt * mt * mt * a[i] + 3 * mt * mt * t * b[i] + 3 * mt * t * t * c[i] + t * t * t * d[i]);
}

// Sample the centreline densely and measure arc length
function sample(n = 400) {
  const pts = [];
  for (let k = 0; k < segs.length; k++) {
    for (let j = 0; j < n / segs.length; j++) pts.push(bez(segs[k], j / (n / segs.length)));
  }
  pts.push(segs[segs.length - 1][3]);
  const len = [0];
  for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = len[len.length - 1];
  return pts.map((p, i) => ({ p, s: len[i] / total }));
}

// Width profile (full width, not half), interpolated linearly between stops
const W = [
  [0.0, 5.0], [0.045, 4.3], [0.12, 5.5], [0.22, 6.7], [0.36, 7.3], [0.5, 6.9], [0.62, 5.7], [0.7, 4.6], [0.82, 3.2], [0.93, 1.9], [1.0, 1.0],
];
function width(s) {
  for (let i = 1; i < W.length; i++) {
    if (s <= W[i][0]) {
      const [s0, w0] = W[i - 1];
      const [s1, w1] = W[i];
      const t = (s - s0) / (s1 - s0);
      const e = t * t * (3 - 2 * t); // smoothstep, so the outline has no kinks
      return w0 + (w1 - w0) * e;
    }
  }
  return W[W.length - 1][1];
}

function frameAt(samples, s) {
  let i = samples.findIndex((x) => x.s >= s);
  if (i <= 0) i = 1;
  const a = samples[i - 1].p;
  const b = samples[Math.min(i + 1, samples.length - 1)].p;
  const tx = b[0] - a[0];
  const ty = b[1] - a[1];
  const l = Math.hypot(tx, ty) || 1;
  const t = [tx / l, ty / l];
  // normal pointing to the left of travel (the outside of the hook)
  const n = [t[1], -t[0]];
  return { p: samples[i].p, t, n };
}

const f = (v) => (Math.round(v * 100) / 100).toString();

// Catmull-Rom through points, emitted as cubic Beziers, for a smooth outline
function smoothPath(points, closed) {
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  const P = (i) => points[Math.max(0, Math.min(points.length - 1, i))];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return closed ? d + 'Z' : d;
}

function bodyPath() {
  const samples = sample();
  const left = [];
  const right = [];
  const step = 0.025;
  for (let s = 0; s <= 1.0001; s += step) {
    const { p, n } = frameAt(samples, Math.min(s, 0.999));
    const w = width(s) / 2;
    left.push([p[0] + n[0] * w, p[1] + n[1] * w]);
    right.push([p[0] - n[0] * w, p[1] - n[1] * w]);
  }
  // round tail tip: a small arc between the two sides
  const tip = frameAt(samples, 0.999);
  const r = width(1) / 2;
  const tipPt = [tip.p[0] + tip.t[0] * r, tip.p[1] + tip.t[1] * r];
  const outline = [...left, tipPt, ...right.reverse()];
  return smoothPath(outline, true);
}

function legs(detail) {
  if (detail === 'small') return '';
  const samples = sample();
  // [s, side (+1 outside, -1 inside), reach, knee angle sign (forward = +1 toward head)]
  // The inside front leg is tucked under the head when a newt curls, so it is not drawn.
  const L = [
    [0.1, 1, 3.3, 1],
    [0.6, 1, 3.4, -1],
    [0.62, -1, 2.5, -1],
  ];
  return L.map(([s, side, reach, dir]) => {
    const { p, t, n } = frameAt(samples, s);
    const w = width(s) / 2 - 0.6;
    const base = [p[0] + n[0] * w * side, p[1] + n[1] * w * side];
    // upper limb goes out and slightly back, lower limb bends forward (front legs) or back (hind legs)
    const knee = [base[0] + n[0] * reach * side - t[0] * 0.5 * dir, base[1] + n[1] * reach * side - t[1] * 0.5 * dir];
    const foot = [knee[0] - t[0] * 2.3 * dir + n[0] * 0.5 * side, knee[1] - t[1] * 2.3 * dir + n[1] * 0.5 * side];
    // three short toes fanned at the foot, so the end reads as a hand, not a ball
    const toes = [-0.9, 0, 0.9].map((k) => {
      const dx = -t[0] * dir * 1.25 + n[0] * side * k;
      const dy = -t[1] * dir * 1.25 + n[1] * side * k;
      return `M${f(foot[0])} ${f(foot[1])}l${f(dx)} ${f(dy)}`;
    }).join('');
    return `<path d="M${f(base[0])} ${f(base[1])}L${f(knee[0])} ${f(knee[1])}L${f(foot[0])} ${f(foot[1])}" stroke-width="1.9"/>` +
      (detail === 'full' ? `<path d="${toes}" stroke-width="1.05"/>` : `<path d="${toes}" stroke-width="1.15"/>`);
  }).join('');
}

function head() {
  const samples = sample();
  const { p, t } = frameAt(samples, 0.004);
  // the head sits just behind the start of the centreline, pointing back along it
  const c = [p[0] - t[0] * 1.9, p[1] - t[1] * 1.9];
  const ang = (Math.atan2(-t[1], -t[0]) * 180) / Math.PI;
  return { c, ang, t };
}

function mark(detail = 'mid') {
  const h = head();
  const rx = detail === 'small' ? 5.0 : 4.8; // along the head's length
  const ry = detail === 'small' ? 4.6 : 4.35; // across
  // snout slightly narrower than the back of the head: two overlapping ellipses
  const snout = [h.c[0] - h.t[0] * 1.7, h.c[1] - h.t[1] * 1.7];
  // two eyes near the front of the head, one each side, as seen from above
  const ex = (side) => [h.c[0] - h.t[0] * 2.3 + h.t[1] * side * 2.15, h.c[1] - h.t[1] * 2.3 - h.t[0] * side * 2.15];
  const eyes = detail === 'small' ? [] : [ex(1), ex(-1)];
  const spots = '';
  return [
    `<g class="mk-body" style="fill:var(--mark-body);stroke:none">`,
    `<path d="${bodyPath()}"/>`,
    `<ellipse cx="${f(h.c[0])}" cy="${f(h.c[1])}" rx="${rx}" ry="${ry}" transform="rotate(${f(h.ang)} ${f(h.c[0])} ${f(h.c[1])})"/>`,
    `<ellipse cx="${f(snout[0])}" cy="${f(snout[1])}" rx="3.6" ry="3.3" transform="rotate(${f(h.ang)} ${f(snout[0])} ${f(snout[1])})"/>`,
    `</g>`,
    `<g class="mk-legs" style="fill:none;stroke:var(--mark-body);stroke-linecap:round;stroke-linejoin:round">${legs(detail)}</g>`,
    spots,
    ...eyes.map((e) => `<circle cx="${f(e[0])}" cy="${f(e[1])}" r="0.95" style="fill:var(--mark-eye)"/>`),
    `<circle cx="25.1" cy="42.2" r="${detail === 'small' ? 3.9 : 3.7}" style="fill:var(--mark-dot)"/>`,
  ].join('');
}

function spotsSvg() {
  const samples = sample();
  return [0.3, 0.42, 0.54].map((s) => {
    const { p, n } = frameAt(samples, s);
    const q = [p[0] + n[0] * 1.1, p[1] + n[1] * 1.1];
    return `<circle cx="${f(q[0])}" cy="${f(q[1])}" r="0.85" style="fill:var(--mark-spot)"/>`;
  }).join('');
}

module.exports = { mark };
