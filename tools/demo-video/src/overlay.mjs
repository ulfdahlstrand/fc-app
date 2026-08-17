/**
 * The two things Playwright does not put in a recording: a mouse pointer, and
 * any way to say what the viewer is looking at.
 *
 * Registered with `addInitScript`, so it is reinstalled on every document —
 * hard navigations included — rather than needing to be re-injected by hand.
 * Everything it adds is `pointer-events: none`, so it can never swallow a click
 * meant for the app underneath.
 */
export function installOverlay() {
  const install = () => {
    if (document.getElementById("__demo_cursor")) return;

    const style = document.createElement("style");
    style.textContent = `
      #__demo_cursor {
        position: fixed; left: 0; top: 0; width: 22px; height: 22px;
        margin: -11px 0 0 -11px; border-radius: 50%;
        background: rgba(0,179,65,.35); border: 2px solid #00b341;
        box-shadow: 0 2px 10px rgba(0,0,0,.35);
        pointer-events: none; z-index: 2147483647;
        transition: transform .08s ease-out;
      }
      #__demo_cursor.__down { transform: scale(.6); background: rgba(0,179,65,.75); }
      .__demo_ring {
        position: fixed; width: 22px; height: 22px; margin: -11px 0 0 -11px;
        border-radius: 50%; border: 2px solid #00b341;
        pointer-events: none; z-index: 2147483646;
        animation: __demo_ring .5s ease-out forwards;
      }
      @keyframes __demo_ring { to { transform: scale(3.2); opacity: 0; } }
      #__demo_caption {
        position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%);
        max-width: 78vw; padding: 12px 22px; border-radius: 999px;
        background: rgba(12,16,14,.92); color: #f1f3ee;
        font: 600 16px/1.4 Archivo, system-ui, sans-serif;
        letter-spacing: .2px; text-align: center;
        pointer-events: none; z-index: 2147483647;
        opacity: 0; transition: opacity .35s ease;
      }
      #__demo_caption.__on { opacity: 1; }
    `;
    document.head.appendChild(style);

    const dot = document.createElement("div");
    dot.id = "__demo_cursor";
    document.body.appendChild(dot);

    const caption = document.createElement("div");
    caption.id = "__demo_caption";
    document.body.appendChild(caption);

    let x = 0;
    let y = 0;

    addEventListener(
      "mousemove",
      (event) => {
        x = event.clientX;
        y = event.clientY;
        dot.style.left = `${x}px`;
        dot.style.top = `${y}px`;
      },
      true,
    );

    // A ripple on every press, so a click is something the viewer sees happen
    // rather than infers from the screen changing.
    addEventListener(
      "mousedown",
      () => {
        dot.classList.add("__down");
        const ring = document.createElement("div");
        ring.className = "__demo_ring";
        ring.style.left = `${x}px`;
        ring.style.top = `${y}px`;
        document.body.appendChild(ring);
        setTimeout(() => ring.remove(), 520);
      },
      true,
    );

    addEventListener("mouseup", () => dot.classList.remove("__down"), true);

    window.__caption = (text) => {
      const el = document.getElementById("__demo_caption");
      if (!el) return;
      if (!text) {
        el.classList.remove("__on");
        return;
      }
      el.textContent = text;
      el.classList.add("__on");
    };
  };

  if (document.body) install();
  else addEventListener("DOMContentLoaded", install);
}
