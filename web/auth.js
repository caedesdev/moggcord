(() => {
  "use strict";

  const dialog = document.querySelector("#login-dialog");
  const accountButton = document.querySelector("[data-auth-open]");
  const profileLink = document.querySelector("[data-profile-link]");
  if (!dialog || !accountButton || !profileLink) return;

  const form = dialog.querySelector("[data-auth-form]");
  const identityInput = dialog.querySelector("#auth-username, #auth-email");
  const status = dialog.querySelector("#auth-status");
  const panel = dialog.querySelector("[data-auth-panel]");
  const sentPanel = dialog.querySelector("[data-auth-sent]");
  const title = dialog.querySelector("#auth-title");
  const description = dialog.querySelector("#auth-description");
  const config = window.MOGGCORD_AUTH_CONFIG ?? {};
  const serverMode = config.mode === "server";
  let registering = false;
  let passwordInput;
  let accountToggle;
  const localMode = window.moggcordLocal?.isEnabled === true;
  const needsLocalServer = window.moggcordLocal?.needsLocalServer === true;
  const providerNames = { discord: "Discord", google: "Google", github: "GitHub" };
  const sdkUrl = new URL("assets/vendor/supabase.js", document.currentScript.src).href;
  let clientPromise;
  let currentUser = null;
  let busy = false;
  let providerAvailability = serverMode ? { discord: false, google: false, github: false } : {};
  function createShaderArtwork(container, unavailable) {
    if (!container) return null;
    const canvas = document.createElement("canvas");
    canvas.className = "auth-shader-scene";
    canvas.setAttribute("aria-hidden", "true");
    container.prepend(canvas);
    let gl;
    try {
      gl = canvas.getContext("webgl", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
    } catch {
      canvas.remove();
      return null;
    }
    if (!gl) { canvas.remove(); return null; }
    const fragmentSource = `// "Halftone" — made with the 21st.dev Shader Builder
// Packed WebGL1 uniforms (the shader exposes readable u_* aliases as macros):
//   u_colors[8] (first 4 used)
//   vec3(0.043, 0.063, 0.149)
//   vec3(0.239, 0.275, 0.910)
//   vec3(0.694, 0.549, 1.000)
//   vec3(1.000, 0.839, 0.906)
//   u_scene = vec4(canvas width, canvas height, seconds * 1.43, 4.0)
//   u_shape = vec4(1.48, 0.88, 0.50, 0.00)
//   u_surface = vec4(2.40, 0.91, 0.00, 1.00)
//   u_finish = vec4(0.00, 0.00, 0.000, 0.06)
//   u_transform = vec4(2926.0, 0.00, 0.00, 0.0)
//   u_space = vec4(0.00, 0.00, pointer x, pointer y)
//   u_cursor = vec4(presence, 2.0, 0.65, 0.46)

#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform vec3 u_colors[8];
// Seven packed vectors + eight colour vectors = 15 fragment uniform vectors,
// one below WebGL1's guaranteed minimum. Macros preserve the public u_* API.
uniform vec4 u_scene;      // resolution.xy, time, colour count
uniform vec4 u_shape;      // scale, intensity, paramA, warp
uniform vec4 u_surface;    // detail, contrast, brightness, saturation
uniform vec4 u_finish;     // hue, vignette, blur, grain
uniform vec4 u_transform;  // seed, rotation, drift, OKLab toggle
uniform vec4 u_space;      // offset.xy, pointer.xy
uniform vec4 u_cursor;

#define u_resolution u_scene.xy
#define u_time u_scene.z
#define u_colorCount u_scene.w
#define u_scale u_shape.x
#define u_intensity u_shape.y
#define u_paramA u_shape.z
#define u_warp u_shape.w
#define u_detail u_surface.x
#define u_contrast u_surface.y
#define u_brightness u_surface.z
#define u_saturation u_surface.w
#define u_hue u_finish.x
#define u_vignette u_finish.y
#define u_blur u_finish.z
#define u_grain u_finish.w
#ifdef GL_FRAGMENT_PRECISION_HIGH
#define u_seed u_transform.x
#else
// Keep hash inputs inside mediump's guaranteed ±2^14 range.
#define u_seed mod(u_transform.x, 31.0)
#endif
#define u_rotate u_transform.y
#define u_drift u_transform.z
#define u_oklab u_transform.w
#define u_offset u_space.xy
#define u_mouse u_space.zw
#define u_cursorPresence u_cursor.x
#define u_cursorEffect u_cursor.y
#define u_cursorStrength u_cursor.z
#define u_cursorRadius u_cursor.w

float hash21(vec2 p) {
#ifndef GL_FRAGMENT_PRECISION_HIGH
  p = mod(p, 31.0);
#endif
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// Even, un-structured white noise for film grain (Dave Hoskins hash12). The
// multiply hash above is fine for value noise but shows a faint axis-aligned
// mesh at integer fragment coords, which reads as a net over flat areas.
float grainHash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
#ifndef GL_FRAGMENT_PRECISION_HIGH
  p = mod(p, 31.0);
#endif
  float n = sin(dot(p, vec2(41.0, 289.0)));
  return fract(vec2(15731.743, 7892.321) * n);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + vec2(17.0, 9.2);
    a *= 0.5;
  }
  return v;
}

// --- OKLab colour mixing (perceptual), gated by u_oklab -----------------------
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)),
    step(0.04045, c));
}
vec3 linearToSrgb(vec3 c) {
  // max() guards the sRGB branch: out-of-gamut OKLab interpolations can send a
  // channel negative, and pow(negative, …) is NaN which mix()/step() would
  // then propagate. The linear branch clips such channels to 0 downstream.
  return mix(c * 12.92, 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, c));
}
vec3 linToOklab(vec3 c) {
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  l = pow(max(l, 0.0), 1.0 / 3.0);
  m = pow(max(m, 0.0), 1.0 / 3.0);
  s = pow(max(s, 0.0), 1.0 / 3.0);
  return vec3(
    0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s);
}
vec3 oklabToLin(vec3 c) {
  float l = c.x + 0.3963377774 * c.y + 0.2158037573 * c.z;
  float m = c.x - 0.1055613458 * c.y - 0.0638541728 * c.z;
  float s = c.x - 0.0894841775 * c.y - 1.2914855480 * c.z;
  l = l * l * l; m = m * m * m; s = s * s * s;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}
vec3 mixColour(vec3 a, vec3 b, float t) {
  if (u_oklab > 0.5) {
    vec3 la = linToOklab(srgbToLinear(a));
    vec3 lb = linToOklab(srgbToLinear(b));
    return clamp(linearToSrgb(oklabToLin(mix(la, lb, t))), 0.0, 1.0);
  }
  return mix(a, b, t);
}

// Mix through the recipe colours; x is clamped to 0..1. WebGL1 forbids
// dynamic uniform indexing in fragment shaders, hence the constant loop.
vec3 palette(float x) {
  float n = max(u_colorCount - 1.0, 1.0);
  float f = clamp(x, 0.0, 1.0) * n;
  vec3 col = u_colors[0];
  for (int i = 0; i < 7; i++) {
    if (float(i) < n)
      col = mixColour(col, u_colors[i + 1],
        smoothstep(0.0, 1.0, clamp(f - float(i), 0.0, 1.0)));
  }
  return col;
}

vec3 hueRotate(vec3 col, float a) {
  const mat3 toYIQ = mat3(0.299, 0.596, 0.211,
                          0.587, -0.274, -0.523,
                          0.114, -0.322, 0.312);
  const mat3 toRGB = mat3(1.0, 1.0, 1.0,
                          0.956, -0.272, -1.106,
                          0.621, -0.647, 1.703);
  vec3 yiq = toYIQ * col;
  float ca = cos(a), sa = sin(a);
  yiq = vec3(yiq.x, yiq.y * ca - yiq.z * sa, yiq.y * sa + yiq.z * ca);
  return toRGB * yiq;
}

vec3 shade(vec2 uv, vec2 p, float t) {
  float cells = 18.0 + u_intensity * 30.0;
  vec2 f = fract(p * cells) - 0.5;
  float field = 0.5 + 0.5 * sin(p.x * 3.0 + t + u_seed) * sin(p.y * 2.4 - t * 0.7);
  float r = (0.06 + u_paramA * 0.34) + field * 0.2;
  float dotMask = 1.0 - smoothstep(r - 0.08, r, length(f));
  return mix(u_colors[0], palette(field), dotMask);
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  vec2 screenUv = uv;
  vec2 p = (gl_FragCoord.xy - 0.5 * u_resolution.xy)
    / min(u_resolution.x, u_resolution.y);
  float cursorMask = 0.0;

  // Cursor modes 1–3 are local distortions. Push shifts the same screen-space
  // coordinates before field transforms, so Zoom/Rotate don't change its feel.
  if (u_cursorPresence > 0.001) {
    // u_mouse is normalized to -1..1 in canvas space. Convert it to the same
    // aspect-corrected screen space as p so effects stay under the cursor.
    vec2 cursor = (0.5 * u_mouse * u_resolution.xy)
      / min(u_resolution.x, u_resolution.y);
    vec2 cursorDelta = p - cursor;
    if (u_cursorEffect < 0.5) {
      p += cursor * u_cursorPresence * u_cursorStrength * 0.55;
    } else {
      float cursorDistance = length(cursorDelta);
      vec2 cursorDirection = cursorDelta / max(cursorDistance, 0.0001);
      cursorMask = u_cursorPresence
        * (1.0 - smoothstep(0.0, u_cursorRadius, cursorDistance));
      if (u_cursorEffect < 1.5) {
        p -= cursorDirection * cursorMask * u_cursorStrength * 0.24;
      } else if (u_cursorEffect < 2.5) {
        float cursorAngle = cursorMask * u_cursorStrength * 2.2;
        float cc = cos(cursorAngle), cs = sin(cursorAngle);
        p = cursor + mat2(cc, -cs, cs, cc) * cursorDelta;
      } else if (u_cursorEffect < 3.5) {
        float ripple = sin(
          cursorDistance / max(u_cursorRadius, 0.001) * 18.0 - u_time * 5.0);
        p -= cursorDirection * ripple * cursorMask * u_cursorStrength * 0.07;
      }
    }
  }

  // Keep presets that read uv (rather than p) in the same warped space.
  uv = p * min(u_resolution.x, u_resolution.y) / u_resolution.xy + 0.5;
  p *= u_scale;
  // Field transform: rotate, pan, pointer push, slow drift.
  if (abs(u_rotate) > 0.0001) {
    float cr = cos(u_rotate), sr = sin(u_rotate);
    p = mat2(cr, -sr, sr, cr) * p;
  }
  p += u_offset;
  if (u_drift > 0.0001)
    p += u_drift * vec2(sin(u_time * 0.31), cos(u_time * 0.23));
  // Organic domain warp.
  if (u_warp > 0.0) {
    p += u_warp * (vec2(
      fbm(p * u_detail + u_seed),
      fbm(p * u_detail + vec2(5.2, 1.3))) - 0.5);
  }
  // Shade, with an optional soft 5-tap blur.
  vec3 col;
  if (u_blur > 0.0) {
    float e = u_blur;
    float pe = e * u_scale;
    vec2 uvE = vec2(e) * min(u_resolution.x, u_resolution.y) / u_resolution.xy;
    col  = shade(uv, p, u_time) * 0.36;
    col += shade(uv + vec2(uvE.x, 0.0), p + vec2(pe, 0.0), u_time) * 0.16;
    col += shade(uv - vec2(uvE.x, 0.0), p - vec2(pe, 0.0), u_time) * 0.16;
    col += shade(uv + vec2(0.0, uvE.y), p + vec2(0.0, pe), u_time) * 0.16;
    col += shade(uv - vec2(0.0, uvE.y), p - vec2(0.0, pe), u_time) * 0.16;
  } else {
    col = shade(uv, p, u_time);
  }
  // Post: contrast, saturation, hue, brightness, vignette, grain.
  if (abs(u_contrast - 1.0) > 0.0001)
    col = (col - 0.5) * u_contrast + 0.5;
  if (abs(u_saturation - 1.0) > 0.0001) {
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, u_saturation);
  }
  if (abs(u_hue) > 0.0001)
    col = hueRotate(col, u_hue);
  if (abs(u_brightness) > 0.0001)
    col += u_brightness;
  if (u_vignette > 0.0001) {
    float vd = length(screenUv - 0.5) * 1.41421356;
    col *= 1.0 - u_vignette * smoothstep(0.35, 1.0, vd);
  }
  if (u_cursorPresence > 0.001 && u_cursorEffect > 3.5)
    col += (vec3(0.18) + col * 0.12) * cursorMask * u_cursorStrength;
  if (u_grain > 0.0001)
    col += (grainHash(
      gl_FragCoord.xy + vec2(u_seed * 17.0, u_seed * 31.0)) - 0.5) * u_grain;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;
    let vertex, fragment, program, buffer;
    const compile = (type, source) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Artwork shader unavailable.");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        throw new Error("Artwork shader could not compile.");
      }
      return shader;
    };
    try {
      vertex = compile(gl.VERTEX_SHADER, "attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }");
      fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      if (!program) throw new Error("Artwork program unavailable.");
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Artwork program could not link.");
      gl.useProgram(program);
      buffer = gl.createBuffer();
      if (!buffer) throw new Error("Artwork buffer unavailable.");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "a_position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    } catch {
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      canvas.remove();
      return null;
    }
    gl.detachShader(program, vertex);
    gl.detachShader(program, fragment);
    gl.deleteShader(vertex);
    gl.deleteShader(fragment);
    const scene = gl.getUniformLocation(program, "u_scene");
    gl.uniform3fv(gl.getUniformLocation(program, "u_colors[0]"), new Float32Array([
      0.043, 0.063, 0.149, 0.239, 0.275, 0.910, 0.694, 0.549, 1.000, 1.000, 0.839, 0.906,
      1.000, 0.839, 0.906, 1.000, 0.839, 0.906, 1.000, 0.839, 0.906, 1.000, 0.839, 0.906
    ]));
    for (const [name, values] of Object.entries({
      u_shape: [1.48, 0.88, 0.50, 0.00],
      u_surface: [2.40, 0.91, 0.00, 1.00],
      u_finish: [0.00, 0.00, 0.000, 0.06],
      u_transform: [2926.0, 0.00, 0.00, 0.0],
      u_space: [0.00, 0.00, 0.00, 0.00],
      u_cursor: [0.00, 2.0, 0.65, 0.46]
    })) gl.uniform4fv(gl.getUniformLocation(program, name), values);
    let frame = null, elapsed = 0, previous = null, visible = false, playing = false, disposed = false;
    const resize = () => {
      const bounds = container.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    };
    const draw = () => {
      if (disposed || !visible || gl.isContextLost()) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform4f(scene, canvas.width, canvas.height, elapsed * 1.43, 4.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const stop = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      previous = null;
    };
    const tick = now => {
      frame = null;
      if (disposed || !visible || !playing) return;
      if (previous !== null) elapsed += Math.max(0, now - previous) / 1000;
      previous = now;
      draw();
      frame = requestAnimationFrame(tick);
    };
    const refresh = () => { if (visible && !disposed) { resize(); draw(); } };
    const observer = new ResizeObserver(refresh);
    observer.observe(container);
    window.addEventListener("resize", refresh);
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      stop();
      observer.disconnect();
      window.removeEventListener("resize", refresh);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      canvas.remove();
      container.removeAttribute("data-shader-ready");
    };
    canvas.addEventListener("webglcontextlost", () => { dispose(); unavailable(); });
    container.dataset.shaderReady = "true";
    return {
      dispose,
      sync(animate, shown) {
        visible = shown;
        playing = animate;
        if (!visible || !playing) stop();
        if (!visible || disposed) return;
        resize();
        draw();
        if (playing && frame === null) frame = requestAnimationFrame(tick);
      }
    };
  }

  const motionToggle = dialog.querySelector("[data-auth-motion]");
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  let motionPaused = false;
  let artwork;
  const syncArtwork = () => {
    dialog.dataset.authView = registering ? "signup" : "login";
    if (dialog.open && artwork === undefined) artwork = createShaderArtwork(dialog.querySelector(".auth-artwork"), () => { artwork = null; syncArtwork(); });
    if (dialog.open && !artwork) {
      const image = dialog.querySelector(registering ? ".auth-signup-scene" : ".auth-scene");
      if (image?.dataset.src && !image.getAttribute("src")) image.src = image.dataset.src;
    }
    const visible = dialog.open && !document.hidden;
    const playing = visible && !motionPaused && !reducedMotion?.matches;
    artwork?.sync(playing, visible);
    dialog.dataset.artMotion = artwork && playing ? "running" : "paused";
    if (!motionToggle) return;
    motionToggle.hidden = !artwork || Boolean(reducedMotion?.matches);
    motionToggle.setAttribute("aria-pressed", String(motionPaused));
    motionToggle.setAttribute("aria-label", motionPaused ? "Play animation" : "Pause animation");
    motionToggle.querySelector("path").setAttribute("d", motionPaused ? "m9 5 10 7-10 7Z" : "M9 5v14M15 5v14");
  };
  motionToggle?.addEventListener("click", () => { motionPaused = !motionPaused; syncArtwork(); });
  document.addEventListener("visibilitychange", syncArtwork);
  reducedMotion?.addEventListener?.("change", syncArtwork);
  new MutationObserver(syncArtwork).observe(dialog, { attributes: true, attributeFilter: ["open"] });
  window.addEventListener("pagehide", () => { artwork?.dispose(); artwork = undefined; });
  window.addEventListener("pageshow", syncArtwork);

  const authError = (code) => Object.assign(new Error(code), { code });

  const isConfigured = () => {
    if (localMode || serverMode) return true;
    if (typeof config.supabaseUrl !== "string" || !config.supabaseUrl.trim()) return false;
    if (typeof config.supabasePublishableKey !== "string" || !config.supabasePublishableKey.trim()) return false;
    try {
      const url = new URL(config.supabaseUrl);
      return url.protocol === "https:" && !url.username && !url.password;
    } catch {
      return false;
    }
  };

  const showStatus = (message = "", tone = "danger") => window.MoggUI.setAlert(status, {
    tone,
    title: message ? (tone === "warning" ? "Check your details" : tone === "info" ? "Sign-in cancelled" : "Sign-in failed") : "",
    message,
  });

  const errorMessage = (error) => {
    const code = error?.code ?? "";
    if (code === "invalid_credentials") return "Username or password is incorrect. Please try again.";
    if (code === "credentials_invalid") return "Use a username with 3–32 letters, numbers, dots, dashes or underscores, starting with a letter or number. Your password needs at least 12 characters.";
    if (code === "username_taken") return "This username is already taken. Please choose another one.";
    if (code === "account_exists") return "An account already uses this sign-in. Please use its original sign-in method.";
    if (code === "verified_email_required") return "This provider needs a verified email address to create your account.";
    if (code === "oauth_failed" || code === "oauth_state_invalid") return "We couldn’t complete provider sign-in. Please start again.";
    if (code === "local_storage_full") return "Your browser storage is full. Remove a local plugin or theme and try again.";
    if (code === "local_storage_unavailable") return "Allow this site to save browser data to use local profiles.";
    if (code === "local_storage_invalid") return "The saved local data couldn’t be read. Your existing data has been kept.";
    if (code === "local_name_invalid") return "Enter a display name with up to 40 characters.";
    if (code === "not_configured") return "Sign-in isn’t available yet. Please try again later.";
    if (code === "http_required") return "Please open the Moggcord website to sign in. Sign-in is unavailable in a local file preview.";
    if (code === "provider_disabled" || code === "validation_failed") return "This sign-in option is currently unavailable. Please try another method.";
    if (code === "over_email_send_rate_limit" || code === "over_request_rate_limit" || error?.status === 429) return "Too many attempts. Please wait a minute before trying again.";
    if (code === "email_address_invalid") return "Check your email address and try again.";
    if (code === "email_address_not_authorized") return "Email sign-in is still being set up. Please try another sign-in method.";
    if (code === "access_denied") return "Sign-in was cancelled. You can try again whenever you’re ready.";
    if (["otp_expired", "flow_state_expired", "flow_state_not_found", "bad_code_verifier", "pkce_code_verifier_not_found", "pkce_code_verifier_mismatch"].includes(code)) {
      return "This sign-in link has expired or was opened in another browser. Please request a new link and open it in this browser.";
    }
    return "We couldn’t complete sign-in. Check your connection and try again.";
  };

  const setBusy = (value, provider = "") => {
    busy = value;
    form.setAttribute("aria-busy", String(value));
    identityInput.disabled = value;
    if (passwordInput) passwordInput.disabled = value;
    if (accountToggle) accountToggle.disabled = value;
    dialog.querySelectorAll("[data-auth-provider], .auth-email-submit").forEach((button) => {
      const label = button.querySelector("span");
      const name = button.dataset.authProvider;
      button.disabled = value || (name && providerAvailability[name] === false);
      label.textContent = name
        ? (value && provider === name ? "Connecting…" : providerAvailability[name] === false ? `${providerNames[name]}${serverMode ? "\nComing soon" : " · coming soon"}` : `Continue with ${providerNames[name]}`)
        : (localMode ? (value ? "Signing in…" : "Continue locally") : serverMode ? (value ? "Please wait…" : registering ? "Create account" : "Sign in") : (value && !provider ? "Sending sign-in link…" : "Continue with email"));
    });
  };

  const showEmailForm = () => {
    panel.hidden = false;
    sentPanel.hidden = true;
    title.textContent = localMode ? "Make yourself at home." : registering ? "Make it your own." : "Welcome back.";
    description.textContent = localMode ? "Choose a test profile. Saved only in this browser." : serverMode ? (registering ? "Already have an account?" : "Don’t have an account?") : "Sign in or create an account to get started.";
    syncArtwork();
    showStatus();
  };

  if (serverMode) {
    dialog.classList.add("auth-server-dialog");
    form.classList.add("auth-server-form");
    const identityField = document.createElement("div"); identityField.className = "auth-password-field";
    const usernameLabel = form.querySelector('label[for="auth-email"], label[for="auth-username"]');
    identityInput.id = "auth-username"; identityInput.type = "text"; identityInput.name = "username";
    identityInput.autocomplete = "username"; identityInput.inputMode = "text";
    identityInput.minLength = 3; identityInput.maxLength = 32;
    identityInput.pattern = "[A-Za-z0-9][A-Za-z0-9_.\\-]{2,31}";
    identityInput.placeholder = "Your username";
    usernameLabel.htmlFor = "auth-username"; usernameLabel.textContent = "Username";
    const icon = identityInput.closest(".auth-input-shell").querySelector("svg");
    if (icon) icon.innerHTML = '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>';
    const divider = dialog.querySelector(".auth-divider");
    const providerButtons = dialog.querySelector(".auth-providers");
    divider.querySelector("span").textContent = "or continue with";
    panel.append(form, divider, providerButtons);
    identityField.append(usernameLabel, identityInput.closest(".auth-input-shell"));
    form.prepend(identityField);
    const passwordField = document.createElement("div");
    passwordField.className = "auth-password-field";
    passwordField.innerHTML = '<label for="auth-password">Password</label><div class="auth-input-shell"><input id="auth-password" name="password" type="password" autocomplete="current-password" minlength="12" maxlength="256" placeholder="Your password" required><button class="auth-password-visibility" type="button" aria-label="Show password">Show</button></div>';
    passwordInput = passwordField.querySelector("input");
    const visibility = passwordField.querySelector("button");
    visibility.addEventListener("click", () => { const visible = passwordInput.type === "password"; passwordInput.type = visible ? "text" : "password"; visibility.textContent = visible ? "Hide" : "Show"; visibility.setAttribute("aria-label", visible ? "Hide password" : "Show password"); });
    const submit = form.querySelector('button[type="submit"]');
    form.insertBefore(passwordField, submit);
    const hint = document.createElement("p"); hint.className = "auth-password-hint"; hint.textContent = "Username: 3–32 letters, numbers, dots, dashes or underscores. Password: at least 12 characters."; hint.hidden = true; form.insertBefore(hint, submit);
    accountToggle = document.createElement("button"); accountToggle.className = "auth-account-toggle"; accountToggle.type = "button";
    accountToggle.textContent = "Create an account";
    const accountSwitch = document.createElement("div"); accountSwitch.className = "auth-account-switch";
    description.before(accountSwitch); accountSwitch.append(description, accountToggle);
    accountToggle.addEventListener("click", () => {
      registering = !registering;
      passwordInput.autocomplete = registering ? "new-password" : "current-password";
      hint.hidden = !registering;
      accountToggle.textContent = registering ? "Sign in" : "Create an account";
      showEmailForm(); setBusy(false); identityInput.focus();
    });
    showEmailForm(); setBusy(false);
  }

  const openLogin = () => {
    document.querySelector(".mobile-menu")?.classList.remove("open");
    const mobileButton = document.querySelector(".menu-button");
    mobileButton?.setAttribute("aria-expanded", "false");
    mobileButton?.setAttribute("aria-label", "Open menu");
    if (!dialog.open) dialog.showModal();
    syncArtwork();
    document.documentElement.classList.add("auth-open");
    accountButton.setAttribute("aria-expanded", "true");
  };

  if (localMode || needsLocalServer) {
    dialog.querySelector(".auth-providers").hidden = true;
    dialog.querySelector(".auth-divider").hidden = true;
    dialog.querySelector(".auth-eyebrow").textContent = "LOCAL PREVIEW";
    if (localMode) {
      identityInput.type = "text";
      identityInput.name = "display_name";
      identityInput.maxLength = 40;
      identityInput.autocomplete = "nickname";
      identityInput.removeAttribute("inputmode");
      identityInput.placeholder = "Your display name";
      form.querySelector("label").textContent = "Display name";
      form.querySelector('button[type="submit"] > span').textContent = "Continue locally";
      form.classList.add("auth-local-form");
      showEmailForm();
    } else {
      form.hidden = true;
      title.textContent = "Open the local preview.";
      description.textContent = "Use the local website so your profile works across all pages.";
      const link = document.createElement("a");
      link.className = "auth-email-submit auth-local-link";
      const page = window.location.pathname.split("/").pop()?.replace(/\.html$/, "");
      link.href = `http://127.0.0.1:4173/${["user-plugins", "themes", "profile"].includes(page) ? page : ""}`;
      link.textContent = "Open local Moggcord";
      panel.append(link);
    }
  }

  const renderUser = (user) => {
    currentUser = user ?? null;
    const metadata = currentUser?.user_metadata ?? {};
    const name = [metadata.full_name, metadata.name, metadata.user_name, currentUser?.email?.split("@")[0]]
      .find((value) => typeof value === "string" && value.trim()) ?? "Account";
    accountButton.hidden = Boolean(currentUser);
    profileLink.hidden = !currentUser;
    profileLink.querySelector("[data-profile-name]").textContent = currentUser ? name : "";
    const initial = profileLink.querySelector("[data-profile-initial]");
    initial.textContent = currentUser ? [...name.trim()][0].toUpperCase() : "";
    if (serverMode) {
      profileLink.href = window.MoggcordApi.profileHref(currentUser?.username);
      if (currentUser) window.MoggcordApi.renderAvatar(initial,currentUser.avatar_url,[...name.trim()][0].toUpperCase());
      if (currentUser && window.location.pathname.toLowerCase() === new URL(profileLink.href).pathname.toLowerCase()) profileLink.setAttribute("aria-current","page");
      else profileLink.removeAttribute("aria-current");
    }
    profileLink.setAttribute("aria-label", currentUser ? `View your profile, ${name}` : "Your profile");
    if (currentUser) {
      if (dialog.open) dialog.close();
      form.reset();
      showEmailForm();
    }
    window.dispatchEvent(new CustomEvent("moggcord:authchange", {
      detail: { userId: currentUser?.id ?? null },
    }));
  };

  const loadSdk = () => {
    if (window.supabase?.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = sdkUrl;
      script.onload = () => window.supabase?.createClient ? resolve() : reject(authError("sdk_unavailable"));
      script.onerror = () => { script.remove(); reject(authError("sdk_unavailable")); };
      document.head.appendChild(script);
    });
  };

  const getClient = () => {
    if (!isConfigured()) return Promise.reject(authError("not_configured"));
    if (!["https:", "http:"].includes(window.location.protocol)) return Promise.reject(authError("http_required"));
    if (!clientPromise) {
      clientPromise = (async () => {
        if (!localMode && !serverMode) await loadSdk();
        const client = localMode ? window.moggcordLocal.createClient() : serverMode ? window.MoggcordApi.createClient() : window.supabase.createClient(config.supabaseUrl.trim(), config.supabasePublishableKey.trim(), {
          auth: {
            flowType: "pkce",
            detectSessionInUrl: true,
            persistSession: true,
            autoRefreshToken: true,
            storageKey: "moggcord-auth",
          },
        });
        client.auth.onAuthStateChange((_event, session) => renderUser(session?.user));
        return client;
      })().catch((error) => {
        clientPromise = undefined;
        throw error;
      });
    }
    return clientPromise;
  };

  // Return to this exact page, without copying callback codes or arbitrary query parameters.
  const redirectUrl = () => `${window.location.origin}${window.location.pathname}`;

  // Supabase reports which providers are actually enabled. Do not offer a
  // working-looking OAuth redirect for a provider that has no credentials yet.
  if (!localMode && isConfigured()) {
    fetch(serverMode ? "/api/auth/settings" : `${config.supabaseUrl.replace(/\/$/, "")}/auth/v1/settings`, serverMode ? {} : { headers: { apikey: config.supabasePublishableKey } })
      .then(response => response.ok ? response.json() : null)
      .then(settings => {
        if (!settings?.external) return;
        providerAvailability = settings.external;
        setBusy(busy);
      }).catch(() => {});
  }

  accountButton.addEventListener("click", openLogin);

  dialog.querySelectorAll("[data-auth-close], [data-auth-close-art]").forEach(button => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("close", () => {
    syncArtwork();
    accountButton.setAttribute("aria-expanded", "false");
    if (!document.querySelector("dialog[open]")) {
      document.documentElement.classList.remove("auth-open");
      (currentUser ? profileLink : accountButton).focus({ preventScroll: true });
    }
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key !== "Tab") return;
    const controls = [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
      .filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  let backdropPointerDown = false;
  const isOutsideDialog = (event) => {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  dialog.addEventListener("pointerdown", (event) => { backdropPointerDown = event.target === dialog && isOutsideDialog(event); });
  dialog.addEventListener("click", (event) => {
    if (backdropPointerDown && event.target === dialog && isOutsideDialog(event)) dialog.close();
    backdropPointerDown = false;
  });

  dialog.querySelectorAll("[data-auth-provider]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (busy) return;
      if (localMode || needsLocalServer) return;
      const provider = button.dataset.authProvider;
      if (!Object.hasOwn(providerNames, provider)) return;
      showStatus();
      setBusy(true, provider);
      try {
        const client = await getClient();
        const { data, error } = await client.auth.signInWithOAuth({
          provider,
          options: { redirectTo: redirectUrl(), skipBrowserRedirect: true },
        });
        if (error) throw error;
        const destination = new URL(data.url);
        if (destination.origin !== (serverMode ? window.location.origin : new URL(config.supabaseUrl).origin)) throw authError("invalid_redirect");
        window.location.assign(destination.href);
      } catch (error) {
        showStatus(errorMessage(error));
      } finally {
        setBusy(false);
      }
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !form.reportValidity()) return;
    const identifier = identityInput.value.trim();
    showStatus();
    setBusy(true);
    try {
      const client = await getClient();
      if (localMode) {
        const { data, error } = await client.auth.signInLocally({ name: identifier });
        if (error) throw error;
        renderUser(data.user);
        return;
      }
      if (serverMode) {
        const details = { username: identifier, password: passwordInput.value };
        const { data, error } = registering
          ? await client.auth.signUp(details)
          : await client.auth.signInWithPassword(details);
        if (error) throw error;
        renderUser(data.user);
        return;
      }
      const { error } = await client.auth.signInWithOtp({
        email: identifier,
        options: { emailRedirectTo: redirectUrl(), shouldCreateUser: true },
      });
      if (error) throw error;
      // A successful request does not establish a session; only the verified link can do that.
      panel.hidden = true;
      sentPanel.hidden = false;
      dialog.querySelector("[data-auth-sent-email]").textContent = identifier;
      title.textContent = "Check your inbox.";
      description.textContent = "You’re one click away.";
      if (dialog.open) title.focus({ preventScroll: true });
    } catch (error) {
      showStatus(errorMessage(error));
    } finally {
      setBusy(false);
    }
  });

  identityInput.addEventListener("input", () => { if (!busy) showStatus(); });
  dialog.querySelector("[data-auth-back]").addEventListener("click", () => {
    showEmailForm();
    identityInput.focus();
  });

  const signOut = async () => {
    const client = await getClient();
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) throw error;
    renderUser(null);
  };

  // OAuth cancellations and expired email links return errors in the URL.
  const callbackUrl = new URL(window.location.href);
  const callbackHash = new URLSearchParams(callbackUrl.hash.slice(1));
  const callbackError = callbackUrl.searchParams.get("error_code") || callbackUrl.searchParams.get("error") || callbackHash.get("error_code") || callbackHash.get("error");
  if (callbackError) {
    ["error", "error_code", "error_description"].forEach((key) => callbackUrl.searchParams.delete(key));
    if (callbackHash.has("error") || callbackHash.has("error_code")) callbackUrl.hash = "";
    history.replaceState(null, "", `${callbackUrl.pathname}${callbackUrl.search}${callbackUrl.hash}`);
    openLogin();
    showStatus(errorMessage({ code: callbackError }), callbackError === "access_denied" ? "info" : "danger");
  }

  const ready = isConfigured()
    ? getClient().then(async (client) => {
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      renderUser(data.session?.user);
      return currentUser;
    }).catch((error) => {
      if (localMode) {
        openLogin();
        showStatus(errorMessage(error));
      } else if (callbackUrl.searchParams.has("code")) {
        callbackUrl.searchParams.delete("code");
        history.replaceState(null, "", `${callbackUrl.pathname}${callbackUrl.search}${callbackUrl.hash}`);
        openLogin();
        showStatus(errorMessage(error));
      }
      return null;
    })
    : Promise.resolve(null);

  // UI state is for presentation only. Database policies authorize every write.
  window.moggcordAuth = Object.freeze({
    mode: localMode ? "local" : serverMode ? "server" : "supabase",
    ready,
    getClient,
    getCurrentUser: () => currentUser,
    openLogin,
    signOut,
  });
})();
