(function () {
  var endpoint = (document.currentScript && document.currentScript.dataset.endpoint) || "http://127.0.0.1:8787/events";
  var sessionKey = "clickstream_session";

  function sessionId() {
    try {
      var existing = sessionStorage.getItem(sessionKey);
      if (existing) return existing;
      var fresh = "sess-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      sessionStorage.setItem(sessionKey, fresh);
      return fresh;
    } catch (error) {
      return "sess-anonymous";
    }
  }

  function send(eventType, target) {
    var payload = JSON.stringify({
      eventType: eventType,
      page: location.pathname,
      target: target || "",
      sessionId: sessionId(),
      occurredAt: new Date().toISOString()
    });
    fetch(endpoint, { method: "POST", body: payload, keepalive: true, headers: { "Content-Type": "text/plain" } }).catch(function () {});
  }

  function describe(el) {
    return el.getAttribute("data-track") || el.id || (el.textContent || "").trim().slice(0, 60) || el.tagName.toLowerCase();
  }

  document.addEventListener("click", function (event) {
    var el = event.target.closest("a, button, [data-track]");
    if (!el) return;
    send(el.tagName === "A" ? "link_click" : "button_click", describe(el));
  });

  var seenDepths = {};
  window.addEventListener("scroll", function () {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    if (max <= 0) return;
    var depth = Math.floor((window.scrollY / max) * 4) * 25;
    if (depth > 0 && !seenDepths[depth]) {
      seenDepths[depth] = true;
      send("scroll_depth", depth + "%");
    }
  }, { passive: true });

  send("page_view", document.title);
})();
