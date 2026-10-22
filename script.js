// Flip + back-panel behaviour
(() => {
  "use strict";

  const card = document.getElementById("card");
  const menu = document.getElementById("back-menu");
  const panels = {
    about: document.getElementById("panel-about"),
    note: document.getElementById("panel-note"),
    portfolio: document.getElementById("panel-portfolio"),
  };
  const frontFace = card.querySelector(".face-front");
  const backFace = card.querySelector(".face-back");

  function resetPanels() {
    for (const panel of Object.values(panels)) panel.hidden = true;
    menu.hidden = false;
  }

  function flip() {
    const flipped = card.classList.toggle("flipped");
    card.setAttribute("aria-pressed", String(flipped));
    frontFace.setAttribute("aria-hidden", String(flipped));
    backFace.setAttribute("aria-hidden", String(!flipped));
    card.setAttribute("aria-label", flipped
      ? "Profile card — activate to flip back to the front"
      : "Profile card — activate to flip to the menu");
    // Returning to the front always lands on the menu, never a stale panel.
    if (!flipped) resetPanels();
  }

  // Clicking anywhere on the card flips it — except on interactive elements.
  card.addEventListener("click", (e) => {
    if (e.target.closest("a, button")) return;
    flip();
  });

  // Keyboard: Enter/Space on the card itself flips it.
  card.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target === card) {
      e.preventDefault();
      flip();
    }
  });

  // Back menu: a / b / c open their panel.
  document.querySelectorAll(".option").forEach((btn) => {
    btn.addEventListener("click", () => {
      menu.hidden = true;
      for (const [name, panel] of Object.entries(panels)) {
        panel.hidden = name !== btn.dataset.panel;
      }
    });
  });

  // "← menu" returns to the menu.
  document.querySelectorAll('[data-action="menu"]').forEach((btn) => {
    btn.addEventListener("click", resetPanels);
  });
})();
