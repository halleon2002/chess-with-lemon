// ================= Light / Dark theme toggle =================
// The actual color swap happens in CSS via [data-theme="light"] variable
// overrides — this just flips the attribute and remembers the choice.

(function () {
  const root = document.documentElement;
  const btn = document.getElementById("themeToggle");

  function currentTheme() {
    return root.getAttribute("data-theme") === "light" ? "light" : "dark";
  }

  function applyIcon() {
    // Icon shows the mode you'll switch TO.
    btn.textContent = currentTheme() === "dark" ? "☀️" : "🌙";
  }

  btn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    applyIcon();
  });

  applyIcon();
})();
