// Static + sandboxed dry-run for JS/jQuery snippets.
// Returns diagnostics that get fed to the LLM debug prompt for grounded suggestions.

export interface Diagnostic {
  level: "error" | "warn" | "info";
  message: string;
}

const JS_LANGS = /^(js|javascript|jsx|node|jquery|ts|typescript|tsx)$/i;

export function isJsLanguage(lang?: string): boolean {
  return !!lang && JS_LANGS.test(lang);
}

/**
 * Heuristic detector when language metadata is missing (e.g. textarea, plain
 * <script> blocks where Monaco didn't tag the selection).
 */
export function looksLikeJs(code: string): boolean {
  const c = code.trim();
  if (!c) return false;
  return (
    /\b(function|const|let|var|=>|return|if\s*\(|for\s*\(|while\s*\()\b/.test(c) ||
    /\$\(.+?\)\.\w+\(/.test(c) ||
    /\bjQuery\b/.test(c)
  );
}

export async function dryRunJs(code: string): Promise<Diagnostic[]> {
  const out: Diagnostic[] = [];
  syntaxCheck(code, out);
  jqueryHints(code, out);
  const runtime = await sandboxRun(code);
  if (runtime) out.push(runtime);
  return out;
}

function syntaxCheck(code: string, out: Diagnostic[]) {
  try {
    // Function constructor parses but does not execute.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(code);
  } catch (e) {
    out.push({ level: "error", message: `Syntax error: ${(e as Error).message}` });
  }
}

function jqueryHints(code: string, out: Diagnostic[]) {
  const usesJq = /\$\(/.test(code) || /\bjQuery\b/.test(code);
  if (!usesJq) return;

  // Deprecated event shorthands
  for (const fn of ["click", "blur", "focus", "change", "submit", "keydown", "keyup", "keypress", "mouseenter", "mouseleave", "hover"]) {
    const re = new RegExp(`\\.${fn}\\s*\\(\\s*function`, "g");
    if (re.test(code)) {
      out.push({ level: "warn", message: `.${fn}(fn) shorthand removed in jQuery 3+. Use .on('${fn === "hover" ? "mouseenter mouseleave" : fn}', fn).` });
    }
  }

  // Repeated $(this) wrapping
  const thisCount = (code.match(/\$\(this\)/g) || []).length;
  if (thisCount > 1) {
    out.push({ level: "warn", message: `$(this) wrapped ${thisCount}× — cache once: const $self = $(this);` });
  }

  // Repeated identical jQuery selectors
  const selectorMatches = code.match(/\$\(['"][^'"]+['"]\)/g) || [];
  const counts: Record<string, number> = {};
  for (const s of selectorMatches) counts[s] = (counts[s] || 0) + 1;
  for (const [sel, n] of Object.entries(counts)) {
    if (n >= 3) out.push({ level: "warn", message: `Selector ${sel} re-evaluated ${n}× — cache it.` });
  }

  // .data() vs .attr('data-*')
  if (/\.attr\(['"]data-/.test(code)) {
    out.push({ level: "info", message: "Prefer .data('foo') over .attr('data-foo') — uses jQuery's data cache." });
  }
}

/**
 * Best-effort runtime check inside a sandboxed iframe with a mocked jQuery
 * surface. Real DOM is unavailable; this only catches code that *throws*
 * before touching anything missing. Times out at 2s.
 */
function sandboxRun(code: string): Promise<Diagnostic | null> {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.style.cssText = "position:absolute;width:0;height:0;border:0;opacity:0;pointer-events:none;left:-9999px";

    const token = `ai-assist-${Math.random().toString(36).slice(2)}`;

    // Minimal jQuery chainable shim. Returns objects with no-op methods so
    // method-chains don't throw. This means real bugs that only manifest with
    // a real DOM (e.g. element-missing) won't be caught here, but anything
    // syntactic / logical / arithmetic / type-error will.
    const srcdoc = `<!doctype html><html><body><script>
      (function () {
        function chain() { return new Proxy(function(){}, {
          get: function (t, k) {
            if (k === 'length') return 0;
            if (k === Symbol.toPrimitive) return function(){return 0;};
            if (k === 'then') return undefined;
            if (k === 'each' || k === 'forEach' || k === 'map') return function(){ return chain(); };
            return chain();
          },
          apply: function () { return chain(); }
        }); }
        var $ = chain;
        window.$ = window.jQuery = $;
        window.addEventListener('error', function (e) {
          parent.postMessage({ t: '${token}', ok: false, m: (e.error && e.error.message) || e.message }, '*');
        });
        try {
          (function () { ${code} \n;}).call(window);
          parent.postMessage({ t: '${token}', ok: true }, '*');
        } catch (e) {
          parent.postMessage({ t: '${token}', ok: false, m: (e && e.message) || String(e) }, '*');
        }
      })();
    </script></body></html>`;

    const cleanup = () => {
      window.removeEventListener("message", onMsg);
      iframe.remove();
    };
    const timer = window.setTimeout(() => {
      cleanup();
      resolve({ level: "warn", message: "Dry-run timed out (>2s) — possibly infinite loop or long-running task." });
    }, 2000);

    const onMsg = (e: MessageEvent) => {
      const d = e.data as { t?: string; ok?: boolean; m?: string };
      if (!d || d.t !== token) return;
      window.clearTimeout(timer);
      cleanup();
      if (d.ok) resolve(null);
      else resolve({ level: "error", message: `Runtime error in dry-run: ${d.m ?? "unknown"}` });
    };

    window.addEventListener("message", onMsg);
    iframe.srcdoc = srcdoc;
    document.body.appendChild(iframe);
  });
}
