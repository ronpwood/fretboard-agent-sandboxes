// sandbox_mount/guest/serve_app.ts — serve the payload app so the exe.dev proxy can reach it.
//
// WHY THIS FILE EXISTS, and why it is not `bun index.html`:
//
// `bun index.html` starts Bun's HTML *dev server*. That mode has two behaviours
// that are policy, not configuration, and together they make it unusable behind
// the exe.dev HTTPS proxy:
//
//   1. it binds 127.0.0.1, so the proxy (which reaches the VM's external
//      interface only) gets nothing and returns 403;
//   2. it enforces a Host-header check and answers
//      "Blocked: Host header does not match the dev server" to any request
//      arriving as <vm>.exe.xyz.
//
// MEASURED on bun 1.4.0 in the exeuntu image: neither moves. `--host` is not a
// flag in that mode (bun reads the value as a FILENAME and dies with
// `File not found "0.0.0.0"`), BUN_HOSTNAME is ignored, and a
// `[serve.static] hostname` in bunfig.toml is ignored. Bridging the loopback
// bind with socat fixes (1) and then dies on (2). All four were tried on a live
// box; the 403 survived every one.
//
// `Bun.serve` is a different thing entirely: a plain server with no dev-server
// policy attached. It binds 0.0.0.0 by default and does no Host checking. That
// is the shape the visualizer already uses
// (.claude/skills/sssf/apps/visualizer/server/index.ts) — the one app in this
// repo that was reachable through the proxy all along. This file follows it.
//
// The HTML import is what keeps this honest. `index.html` pulls in main.ts, and
// a browser cannot load TypeScript, so the file cannot simply be served as
// bytes: Bun's bundler has to transpile it. Importing the .html and handing it
// to `routes` invokes exactly that bundling — the dev server's one genuinely
// necessary feature — while leaving its network policy behind.
//
// LIVES HERE, NOT IN apps/. The payload app is what the ADWs rewrite; a file
// added there would be diffed, possibly edited, and harvested into every run's
// bundle, and it would dirty the working tree that SETUP gate A requires to be
// clean. Serving is the sandbox's concern, so it lives with the sandbox's other
// guest-side code.
//
// Usage (from observe.just):  APP_HTML=/abs/path/index.html PORT=4501 bun serve_app.ts

const PORT = Number(process.env.PORT ?? 4501);

// Absolute path, resolved by the caller. Passed as an env var rather than argv
// so the detached `nohup ... &` invocation needs no extra quoting hop.
const APP_HTML = process.env.APP_HTML;
if (!APP_HTML) {
  console.error("serve_app: APP_HTML is required (absolute path to the app's index.html)");
  process.exit(2);
}

// A dynamic import of the .html is what triggers Bun's bundling of everything it
// references (main.ts and the modules it imports). A static `import x from` would
// need the path known at parse time; this server is generic over apps.
const index = (await import(APP_HTML)).default;

const server = Bun.serve({
  port: PORT,
  // hostname is deliberately unset: Bun.serve defaults to 0.0.0.0, which is what
  // the proxy needs. Setting it to "0.0.0.0" explicitly would be equivalent but
  // implies the default is something else, and it is not.
  routes: {
    "/*": index,
  },
});

// Printed so observe's log tail shows the real bind, not an assumed one.
console.log(`serve_app: ${APP_HTML} on http://${server.hostname}:${server.port}`);
